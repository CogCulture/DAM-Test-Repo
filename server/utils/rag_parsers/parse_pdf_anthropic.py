import os
import argparse
import base64
import time
import json
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
import anthropic

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from langsmith.wrappers import wrap_anthropic
    from langsmith import traceable
    LANGSMITH_AVAILABLE = True
except ImportError:
    LANGSMITH_AVAILABLE = False

    def traceable(*args, **kwargs):
        def wrapper(func):
            return func
        return wrapper

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def call_anthropic_with_retry(client, model, messages, system=None, max_tokens=4096, temperature=0.1, max_retries=5):
    """Call Anthropic API with exponential backoff for rate limits."""
    for attempt in range(max_retries):
        try:
            kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages
            }
            if system:
                kwargs["system"] = system
            resp = client.messages.create(**kwargs)
            return resp
        except Exception as e:
            err_msg = str(e).lower()
            if "429" in err_msg or "rate limit" in err_msg or "overloaded" in err_msg:
                wait_time = (attempt + 1) * 10
                print(f"    -> [WARNING] Rate limit hit. Attempt {attempt + 1}/{max_retries}. Pausing {wait_time}s...")
                time.sleep(wait_time)
            elif "50" in err_msg or "server error" in err_msg:
                wait_time = (attempt + 1) * 5
                print(f"    -> [WARNING] Service error. Attempt {attempt + 1}/{max_retries}. Pausing {wait_time}s...")
                time.sleep(wait_time)
            else:
                raise e
    raise Exception("Max retries exceeded due to persistent API errors.")

def run_anthropic_batch_task(client, requests_list, poll_interval=30):
    """Executes a batch task using Anthropic Message Batches API."""
    print(f"    -> Creating batch task with {len(requests_list)} requests...")
    try:
        batch = client.beta.messages.batches.create(requests=requests_list)
        batch_id = batch.id
        print(f"    -> Batch Task ID: {batch_id}. Polling for completion...")
        
        while True:
            b_status = client.beta.messages.batches.retrieve(batch_id)
            status = b_status.processing_status
            print(f"       Status: {status}...")
            if status in ["ended", "canceled", "expired"]:
                break
            time.sleep(poll_interval)
            
        if status != "ended":
            print(f"[ERROR] Batch ended with non-success status: {status}")
            
        print(f"    -> Batch complete. Downloading results...")
        
        results = {}
        for result in client.beta.messages.batches.results(batch_id):
            cid = result.custom_id
            if result.result.type == "succeeded":
                msg = result.result.message.content[0].text
                usage = {
                    "input_tokens": result.result.message.usage.input_tokens,
                    "output_tokens": result.result.message.usage.output_tokens
                }
                results[cid] = {"content": msg, "usage": usage}
            else:
                results[cid] = {"error": str(result.result), "usage": {}}
                
        return results
    except Exception as e:
        print(f"[ERROR] Batch processing failed: {traceback.format_exc()}")
        return {}

def extract_json(text):
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()

# =============================================================================
# PROMPTS
# =============================================================================

def get_page_prompt(page_num, native_text):
    return (
        f"You are an expert document analyst. Synthesize the content of Page {page_num} "
        "into a highly structured JSON object.\n"
        "Analyze the visual elements (charts, layout, images) provided in the image, along with the provided native text.\n"
        "CRITICAL: Do NOT invent or infer information not present in the page. "
        "Output ONLY valid JSON, without any markdown formatting wrappers or explanatory text.\n\n"
        f"--- NATIVE TEXT ---\n{native_text}\n\n"
        "Generate a JSON object with EXACTLY these keys:\n"
        "{\n"
        "  \"title\": \"<The exact or most prominent title/heading of the page. If none, summarize in 3-5 words.>\",\n"
        "  \"summary\": \"<A detailed, accurate paragraph summarizing the page's main points, data, and visual takeaways.>\",\n"
        "  \"key_takeaways\": [\"<list>\", \"<of>\", \"<key>\", \"<takeaways>\"],\n"
        "  \"entities\": [\"<list>\", \"<of>\", \"<key>\", \"<organizations>\", \"<metrics>\", \"<people>\"],\n"
        "  \"page_theme\": \"<1-3 word high-level theme>\"\n"
        "}"
    )

def get_overall_summary_prompt():
    return (
        "You are an expert document summarizer. Read the structured data of this PDF document in the system instructions.\n"
        "Perform an analysis of the entire document and write a comprehensive executive summary.\n"
        "Output ONLY valid JSON, no markdown formatting blocks.\n\n"
        "Generate a JSON object with exactly these keys:\n"
        "{\n"
        "  \"executive_summary\": \"<3-5 paragraphs detailing the primary objective, main arguments, key data points, and conclusion of the entire document.>\",\n"
        "  \"primary_themes\": [\"<theme1>\", \"<theme2>\", \"<theme3>\"],\n"
        "  \"overall_takeaway\": \"<A strong 1-2 sentence concluding thought on the document's purpose and impact.>\"\n"
        "}"
    )

# =============================================================================
# MAIN PIPELINE
# =============================================================================

@traceable(name="PDF Parsing Pipeline")
def process_pdf(pdf_path, anthropic_key, model, max_workers, use_batch):
    if not PYMUPDF_AVAILABLE:
        print("[ERROR] PyMuPDF is not installed. Please run: pip install pymupdf")
        return

    mode_str = "BATCH" if use_batch else "REAL-TIME"
    print(f"\n--- Starting PDF Parsing Pipeline (Anthropic 2-Prompt - {mode_str} Mode) on: {os.path.basename(pdf_path)} ---")
    
    client = anthropic.Anthropic(api_key=anthropic_key)
    if LANGSMITH_AVAILABLE and os.environ.get("LANGCHAIN_TRACING_V2", "").lower() == "true":
        print(f"    -> [INFO] LangSmith tracing is ENABLED.")
        client = wrap_anthropic(client)
        
    usage_stats = {
        "anthropic_in": 0, "anthropic_out": 0
    }
    
    def add_usage(usage_obj):
        if not usage_obj: return
        if hasattr(usage_obj, "input_tokens"):
            in_tokens = usage_obj.input_tokens
            out_tokens = usage_obj.output_tokens
        elif isinstance(usage_obj, dict):
            in_tokens = usage_obj.get("input_tokens", 0)
            out_tokens = usage_obj.get("output_tokens", 0)
        else:
            in_tokens = 0
            out_tokens = 0
            
        usage_stats["anthropic_in"] += in_tokens
        usage_stats["anthropic_out"] += out_tokens

    # -------------------------------------------------------------------------
    # PHASE 1: PAGE-BY-PAGE EXTRACTION
    # -------------------------------------------------------------------------
    print("\n[PHASE 1] Extracting native text, rendering images, and structuring JSON...")
    
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    print(f"Total pages: {total_pages}")
    
    pages_data = []
    
    for page_num in range(total_pages):
        page = doc.load_page(page_num)
        
        # Extract native text
        native_text = page.get_text().strip()
        if not native_text:
            native_text = "No extractable text on this page."
            
        # Render image (scale up 2x for better resolution)
        matrix = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=matrix)
        img_bytes = pix.tobytes("jpeg", jpg_quality=85)
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        
        pages_data.append({
            "page_num": page_num + 1,
            "native_text": native_text,
            "img_b64": img_b64
        })
        
    doc.close()
    
    structured_pages = {}
    
    if use_batch:
        reqs = []
        for p in pages_data:
            p_num = p["page_num"]
            prompt = get_page_prompt(p_num, p["native_text"])
            
            content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": p["img_b64"],
                    }
                },
                {"type": "text", "text": prompt}
            ]
            
            reqs.append({
                "custom_id": f"page_{p_num}",
                "params": {
                    "model": model,
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": content}]
                }
            })
            
        if reqs:
            batch_res = run_anthropic_batch_task(client, reqs)
            for p in pages_data:
                p_num = p["page_num"]
                cid = f"page_{p_num}"
                if cid in batch_res and "content" in batch_res[cid]:
                    try:
                        parsed = json.loads(extract_json(batch_res[cid]["content"]))
                        parsed["page_num"] = p_num
                        structured_pages[p_num] = parsed
                        add_usage(batch_res[cid].get("usage"))
                    except:
                        structured_pages[p_num] = {"page_num": p_num, "title": f"Page {p_num}", "summary": "Failed to parse JSON."}
                else:
                    structured_pages[p_num] = {"page_num": p_num, "title": f"Page {p_num}", "summary": "Batch failed."}
    else:
        def process_page(p_dict):
            p_num = p_dict["page_num"]
            n_text = p_dict["native_text"]
            prompt = get_page_prompt(p_num, n_text)

            # Always send both the rendered image and the native text to Claude Vision.
            # The image captures charts, layout, and design elements that raw text misses.
            content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": p_dict["img_b64"],
                    }
                },
                {"type": "text", "text": prompt}
            ]
            
            try:
                resp = call_anthropic_with_retry(
                    client, model, [{"role": "user", "content": content}], 
                    temperature=0.1
                )
                parsed = json.loads(extract_json(resp.content[0].text))
                parsed["page_num"] = p_num
                return p_num, parsed, resp.usage
            except Exception as e:
                return p_num, {"page_num": p_num, "title": f"Page {p_num}", "summary": str(e)}, {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process_page, p): p["page_num"] for p in pages_data}
            for future in as_completed(futures):
                p_num, struct_data, usage = future.result()
                structured_pages[p_num] = struct_data
                add_usage(usage)
                print(f" -> Processed Page {p_num}")
                
    structured_pages_list = [structured_pages[i] for i in range(1, total_pages + 1)]
    all_pages_json_str = json.dumps(structured_pages_list, indent=2)

    # -------------------------------------------------------------------------
    # PHASE 2: OVERALL PDF SUMMARIZATION
    # -------------------------------------------------------------------------
    print("\n[PHASE 2] Generating overall executive summary...")
    
    has_native_pages = any(p.get("native_text") for p in structured_pages_list)
    if has_native_pages:
        combined_text = "\n\n".join([f"### Page {p['page_num']}: {p.get('title', '')}\n{p.get('summary', '')}" for p in structured_pages_list[:10]])
        final_summary_data = {
            "executive_summary": f"Directly extracted {total_pages} pages from native PDF document.\n\n{combined_text}",
            "primary_themes": ["Document Analysis", "Native PDF Ingestion"],
            "overall_takeaway": f"Successfully parsed {total_pages} pages and indexed vectors into Pinecone."
        }
    else:
        system_prompt = f"Here is the structured JSON data for all pages in the document:\n\n--- ALL PAGES DATA ---\n{all_pages_json_str}\n\n"
        prompt_phase2 = get_overall_summary_prompt()
        
        try:
            resp_phase2 = call_anthropic_with_retry(
                client, 
                model, 
                [{"role": "user", "content": prompt_phase2}], 
                system=system_prompt, 
                max_tokens=8192, 
                temperature=0.2
            )
            add_usage(resp_phase2.usage)
            final_summary_data = json.loads(extract_json(resp_phase2.content[0].text))
        except Exception as e:
            print(f"[ERROR] Overall summarization failed: {e}")
            final_summary_data = {
                "executive_summary": "Failed to generate summary.",
                "primary_themes": [],
                "overall_takeaway": ""
            }

    # -------------------------------------------------------------------------
    # COST CALCULATION
    # -------------------------------------------------------------------------
    anthropic_in_price = 0.003
    anthropic_out_price = 0.015
    
    multiplier = 0.5 if use_batch else 1.0
    
    cost_in = (usage_stats['anthropic_in']/1000 * anthropic_in_price) * multiplier
    cost_out = (usage_stats['anthropic_out']/1000 * anthropic_out_price) * multiplier
    total_cost = cost_in + cost_out

    # -------------------------------------------------------------------------
    # COMPILATION TO MARKDOWN
    # -------------------------------------------------------------------------
    print("\n[FINISHING] Compiling final Markdown report...")
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    suffix = "_pdf_batch_parsed.md" if use_batch else "_pdf_realtime_parsed.md"
    out_dir = os.path.dirname(os.path.abspath(pdf_path))
    out_path = os.path.join(out_dir, f"{base_name}{suffix}")
    
    executive_summary = final_summary_data.get("executive_summary", "N/A")
    themes = final_summary_data.get("primary_themes", [])
    takeaway = final_summary_data.get("overall_takeaway", "")
    
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# PDF Insights Report (Anthropic 2-Prompt)\n")
        f.write(f"**File:** {os.path.basename(pdf_path)}\n")
        f.write(f"**Total Pages:** {total_pages}\n")
        f.write(f"**Processing Mode:** {mode_str}\n\n")
        f.write("---\n\n")
        
        f.write(f"## 1. Executive Summary\n")
        f.write(f"{executive_summary}\n\n")
        
        if themes:
            f.write(f"**Primary Themes:** {', '.join(themes)}\n\n")
        if takeaway:
            f.write(f"**Overall Takeaway:** {takeaway}\n\n")
            
        f.write("---\n\n")
        
        f.write(f"## 2. Page-by-Page Breakdown\n")
        for page in structured_pages_list:
            f.write(f"### Page {page.get('page_num')}: {page.get('title', 'Untitled')}\n")
            f.write(f"**Theme:** {page.get('page_theme', 'N/A')}\n\n")
            f.write(f"**Summary:**\n{page.get('summary', 'N/A')}\n\n")
            
            takeaways = page.get('key_takeaways', [])
            if takeaways:
                f.write("**Key Takeaways:**\n")
                for tk in takeaways:
                    f.write(f"- {tk}\n")
                f.write("\n")
                
            entities = page.get('entities', [])
            if entities:
                f.write(f"**Entities/Metrics:** {', '.join(entities)}\n\n")
            f.write("\n")
            
        f.write("---\n\n")
        f.write(f"## 3. Cost & Token Analysis\n")
        f.write(f"| Model | Input Tokens | Output Tokens | Estimated Cost (USD) |\n")
        f.write(f"|---|---|---|---|\n")
        f.write(f"| Claude ({model}) | {usage_stats['anthropic_in']:,} | {usage_stats['anthropic_out']:,} | ${total_cost:.4f} |\n\n")
        f.write(f"*Note: Batch processing is billed at 50% of real-time processing costs.*")

    print(f"[SUCCESS] Saved PDF report to: {out_path}")
    return {
        "output_path": out_path,
        "input_tokens": usage_stats["anthropic_in"],
        "output_tokens": usage_stats["anthropic_out"],
        "cost": total_cost
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parse PDF into structured Markdown using Anthropic 2-Prompt Architecture.")
    parser.add_argument("pdf_path", type=str, help="Path to the .pdf file")
    parser.add_argument("--anthropic-key", type=str, default=None, help="Anthropic API key")
    parser.add_argument("--model", type=str, default="claude-sonnet-4-6", help="Claude model version")
    parser.add_argument("--workers", type=int, default=3, help="Max concurrent workers (realtime)")
    parser.add_argument("--batch", action="store_true", default=True, help="Enable 50% cost Anthropic batch processing mode (now default)")
    
    args = parser.parse_args()
    
    anthropic_api_key = args.anthropic_key or os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_api_key:
        print("[ERROR] No Anthropic API key found. Use --anthropic-key or ANTHROPIC_API_KEY env var.")
        exit(1)
        
    process_pdf(
        pdf_path=args.pdf_path,
        anthropic_key=anthropic_api_key,
        model=args.model,
        max_workers=args.workers,
        use_batch=args.batch
    )
