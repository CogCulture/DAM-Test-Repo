import os
import argparse
import base64
import time
import json
import tempfile
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
import anthropic

try:
    import win32com.client
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False

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
                # Assuming standard text block
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

def image_to_base64_media_type(image_path):
    with open(image_path, "rb") as image_file:
        b64_data = base64.b64encode(image_file.read()).decode('utf-8')
    # Anthropic expects media_type
    ext = os.path.splitext(image_path)[1].lower()
    media_type = "image/jpeg"
    if ext == ".png":
        media_type = "image/png"
    elif ext == ".webp":
        media_type = "image/webp"
    return media_type, b64_data

def export_all_slides_as_images(ppt_path, output_dir):
    """Exports all slides at once to avoid opening/closing PPT repeatedly."""
    if not WIN32_AVAILABLE:
        raise Exception("win32com.client is not available.")
    
    powerpoint = win32com.client.Dispatch("PowerPoint.Application")
    abs_ppt_path = os.path.abspath(ppt_path)
    abs_out_dir = os.path.abspath(output_dir)
    
    os.makedirs(abs_out_dir, exist_ok=True)
    
    presentation = powerpoint.Presentations.Open(abs_ppt_path, ReadOnly=True, WithWindow=False)
    slide_paths = {}
    try:
        for i, slide in enumerate(presentation.Slides, start=1):
            out_path = os.path.join(abs_out_dir, f"slide_{i}.jpg")
            slide.Export(out_path, "JPG")
            slide_paths[i] = out_path
    finally:
        presentation.Close()
    
    return slide_paths


# =============================================================================
# PROMPTS
# =============================================================================

def get_unified_slide_prompt(slide_num, native_text):
    return (
        f"You are an expert presentation parser. Synthesize the content of Slide {slide_num} "
        "into a highly structured JSON object.\n"
        "If an image is provided, analyze the visual elements (charts, pictures, layout) along with the provided native text.\n"
        "CRITICAL: Do NOT invent or infer information not present in the slide. "
        "Output ONLY valid JSON, without any markdown formatting wrappers or explanatory text.\n\n"
        f"--- NATIVE TEXT ---\n{native_text}\n\n"
        "Generate a JSON object with EXACTLY these keys:\n"
        "{\n"
        "  \"title\": \"<The exact or most prominent title of the slide. If none, summarize in 3-5 words.>\",\n"
        "  \"summary\": \"<A detailed, accurate paragraph summarizing the slide's main points, data, and visual takeaways.>\",\n"
        "  \"key_takeaways\": [\"<list>\", \"<of>\", \"<key>\", \"<takeaways>\"],\n"
        "  \"entities\": [\"<list>\", \"<of>\", \"<key>\", \"<organizations>\", \"<metrics>\"],\n"
        "  \"slide_theme\": \"<1-3 word high-level theme>\"\n"
        "}"
    )

def get_unified_summary_prompt():
    return (
        "You are an expert presentation summarizer and data architect. Read the structured data of this presentation in the system instructions.\n"
        "Perform topic clustering to group related slides, write a comprehensive summary for each topic, and write a high-level executive summary of the entire deck.\n"
        "Output ONLY valid JSON, no markdown formatting blocks.\n\n"
        "Generate a JSON object with exactly these keys:\n"
        "{\n"
        "  \"executive_summary\": \"<3-5 paragraphs detailing the primary objective, main arguments, key data points, and conclusion.>\",\n"
        "  \"topics\": [\n"
        "    {\n"
        "      \"theme\": \"<broad theme name>\",\n"
        "      \"slides\": [<slide_num1>, <slide_num2>],\n"
        "      \"comprehensive_summary\": \"<Detailed, accurate, and cohesive topic summary. Highlight key statistics, important entities, and the overall narrative of this topic across its slides.>\"\n"
        "    }\n"
        "  ]\n"
        "}"
    )

# =============================================================================
# MAIN PIPELINE
# =============================================================================

@traceable(name="PPTX Parsing Pipeline")
def process_pptx(ppt_path, anthropic_key, model, max_workers, use_batch):
    mode_str = "BATCH" if use_batch else "REAL-TIME"
    print(f"\n--- Starting PPTX Parsing Pipeline (v3 Anthropic 2-Prompt - {mode_str} Mode) on: {os.path.basename(ppt_path)} ---")
    
    client = anthropic.Anthropic(api_key=anthropic_key)
    if LANGSMITH_AVAILABLE and os.environ.get("LANGCHAIN_TRACING_V2", "").lower() == "true":
        print(f"    -> [INFO] LangSmith tracing is ENABLED.")
        client = wrap_anthropic(client)
        
    prs = Presentation(ppt_path)
    
    slides_data = []
    
    usage_stats = {
        "anthropic_in": 0, "anthropic_out": 0, "cache_creation": 0, "cache_read": 0
    }
    
    def add_usage(usage_obj):
        if not usage_obj: return
        
        cache_c = 0
        cache_r = 0
        if hasattr(usage_obj, "input_tokens"):
            in_tokens = usage_obj.input_tokens
            out_tokens = usage_obj.output_tokens
            if hasattr(usage_obj, "cache_creation_input_tokens"):
                cache_c = usage_obj.cache_creation_input_tokens or 0
                cache_r = usage_obj.cache_read_input_tokens or 0
        elif isinstance(usage_obj, dict):
            in_tokens = usage_obj.get("input_tokens", 0)
            out_tokens = usage_obj.get("output_tokens", 0)
            cache_c = usage_obj.get("cache_creation_input_tokens", 0)
            cache_r = usage_obj.get("cache_read_input_tokens", 0)
        else:
            in_tokens = 0
            out_tokens = 0
            
        usage_stats["anthropic_in"] += in_tokens
        usage_stats["anthropic_out"] += out_tokens
        usage_stats["cache_creation"] += cache_c
        usage_stats["cache_read"] += cache_r
        
    def extract_json(text):
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()
    
    # -------------------------------------------------------------------------
    # PHASE 1: UNIFIED PER-SLIDE EXTRACTION (Vision + Text -> JSON)
    # -------------------------------------------------------------------------
    print("\n[PHASE 1] Extracting native text, visuals, and structuring JSON...")
    
    for i, slide in enumerate(prs.slides, start=1):
        native_text = ""
        has_visuals = False
        
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                native_text += shape.text.strip() + "\n"
            if shape.shape_type in [MSO_SHAPE_TYPE.PICTURE, MSO_SHAPE_TYPE.CHART, MSO_SHAPE_TYPE.GROUP, MSO_SHAPE_TYPE.TABLE]:
                has_visuals = True
                
        slides_data.append({
            "slide_num": i,
            "native_text": native_text.strip(),
            "has_visuals": has_visuals
        })
        
    print(f"Total slides: {len(slides_data)}")
    slides_with_visuals = [s["slide_num"] for s in slides_data if s["has_visuals"]]
    print(f"Slides with visual elements: {len(slides_with_visuals)}")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        slide_image_paths = {}
        if slides_with_visuals:
            print("\nExporting visual slides to images using PowerPoint COM...")
            try:
                slide_image_paths = export_all_slides_as_images(ppt_path, tmpdir)
            except Exception as e:
                print(f"[WARNING] Failed to export images: {e}")
                
        structured_slides = {}

        if use_batch:
            reqs = []
            for s in slides_data:
                s_num = s["slide_num"]
                native_text = s["native_text"]
                prompt = get_unified_slide_prompt(s_num, native_text)
                
                content = []
                if s["has_visuals"] and s_num in slide_image_paths and os.path.exists(slide_image_paths[s_num]):
                    m_type, img_b64 = image_to_base64_media_type(slide_image_paths[s_num])
                    content.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": m_type,
                            "data": img_b64,
                        }
                    })
                
                content.append({"type": "text", "text": prompt})
                
                reqs.append({
                    "custom_id": f"slide_{s_num}",
                    "params": {
                        "model": model,
                        "max_tokens": 4096,
                        "messages": [{"role": "user", "content": content}]
                    }
                })
                
            if reqs:
                batch_res = run_anthropic_batch_task(client, reqs)
                for s in slides_data:
                    s_num = s["slide_num"]
                    cid = f"slide_{s_num}"
                    if cid in batch_res and "content" in batch_res[cid]:
                        try:
                            parsed = json.loads(extract_json(batch_res[cid]["content"]))
                            parsed["slide_num"] = s_num
                            structured_slides[s_num] = parsed
                            add_usage(batch_res[cid].get("usage"))
                        except:
                            structured_slides[s_num] = {"slide_num": s_num, "title": f"Slide {s_num}", "summary": "Failed to parse JSON."}
                    else:
                        structured_slides[s_num] = {"slide_num": s_num, "title": f"Slide {s_num}", "summary": "Batch failed."}
        else:
            def process_unified_slide(slide_dict):
                s_num = slide_dict["slide_num"]
                native_text = slide_dict["native_text"]
                prompt = get_unified_slide_prompt(s_num, native_text)
                
                content = []
                if slide_dict["has_visuals"] and s_num in slide_image_paths and os.path.exists(slide_image_paths[s_num]):
                    m_type, img_b64 = image_to_base64_media_type(slide_image_paths[s_num])
                    content.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": m_type,
                            "data": img_b64,
                        }
                    })
                
                content.append({"type": "text", "text": prompt})
                
                try:
                    resp = call_anthropic_with_retry(
                        client, model, [{"role": "user", "content": content}], 
                        temperature=0.1
                    )
                    parsed = json.loads(extract_json(resp.content[0].text))
                    parsed["slide_num"] = s_num
                    return s_num, parsed, resp.usage
                except Exception as e:
                    return s_num, {"slide_num": s_num, "title": f"Slide {s_num}", "summary": str(e)}, {}

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(process_unified_slide, s): s["slide_num"] for s in slides_data}
                for future in as_completed(futures):
                    s_num, struct_data, usage = future.result()
                    structured_slides[s_num] = struct_data
                    add_usage(usage)
                    print(f" -> Processed Slide {s_num}")
                
    structured_slides_list = [structured_slides[i] for i in range(1, len(slides_data) + 1)]
    all_slides_json_str = json.dumps(structured_slides_list, indent=2)

    # -------------------------------------------------------------------------
    # PHASE 2: UNIFIED SUMMARIZATION (One Call for Entire Deck)
    # -------------------------------------------------------------------------
    print("\n[PHASE 2] Generating executive summary, relationships, and topic summaries...")
    
    system_prompt = f"Here is the structured JSON data for all slides in the presentation:\n\n--- ALL SLIDES DATA ---\n{all_slides_json_str}\n\n"
    
    prompt_phase2 = get_unified_summary_prompt()
    
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
        print(f"[ERROR] Unified summarization failed: {e}")
        final_summary_data = {
            "executive_summary": "Failed to generate summary.",
            "topics": []
        }

    # -------------------------------------------------------------------------
    # COST CALCULATION
    # -------------------------------------------------------------------------
    anthropic_in_price = 0.003
    anthropic_out_price = 0.015
    anthropic_cache_c_price = 0.00375
    anthropic_cache_r_price = 0.0003
    
    multiplier = 0.5 if use_batch else 1.0
    
    cost_in = (usage_stats['anthropic_in']/1000 * anthropic_in_price) * multiplier
    cost_out = (usage_stats['anthropic_out']/1000 * anthropic_out_price) * multiplier
    cost_cc = (usage_stats['cache_creation']/1000 * anthropic_cache_c_price)
    cost_cr = (usage_stats['cache_read']/1000 * anthropic_cache_r_price)
    total_cost = cost_in + cost_out + cost_cc + cost_cr

    # -------------------------------------------------------------------------
    # COMPILATION TO MARKDOWN
    # -------------------------------------------------------------------------
    print("\n[FINISHING] Compiling final Markdown report...")
    base_name = os.path.splitext(os.path.basename(ppt_path))[0]
    suffix = "_v3_batch_parsed.md" if use_batch else "_v3_realtime_parsed.md"
    out_dir = os.path.dirname(os.path.abspath(ppt_path))
    out_path = os.path.join(out_dir, f"{base_name}{suffix}")
    
    executive_summary = final_summary_data.get("executive_summary", "N/A")
    topics = final_summary_data.get("topics", [])
    
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Presentation Insights Report (v3 Anthropic 2-Prompt)\n")
        f.write(f"**File:** {os.path.basename(ppt_path)}\n")
        f.write(f"**Total Slides:** {len(slides_data)}\n")
        f.write(f"**Processing Mode:** {mode_str}\n\n")
        f.write("---\n\n")
        
        f.write(f"## 1. Overall Summary\n")
        f.write(f"{executive_summary}\n\n")
        f.write("---\n\n")
        
        f.write(f"## 2. Topic-wise Summaries\n")
        for ts in topics:
            f.write(f"### Topic: {ts.get('theme', 'Unknown')} (Slides: {', '.join(map(str, ts.get('slides', [])))})\n")
            f.write(f"{ts.get('comprehensive_summary', '')}\n\n")
        f.write("---\n\n")
        
        f.write(f"## 3. Per-Slide Breakdown\n")
        for slide in structured_slides_list:
            f.write(f"### Slide {slide.get('slide_num')}: {slide.get('title', 'Untitled')}\n")
            f.write(f"**Theme:** {slide.get('slide_theme', 'N/A')}\n\n")
            f.write(f"**Summary:**\n{slide.get('summary', 'N/A')}\n\n")
            
            takeaways = slide.get('key_takeaways', [])
            if takeaways:
                f.write("**Key Takeaways:**\n")
                for tk in takeaways:
                    f.write(f"- {tk}\n")
                f.write("\n")
                
            entities = slide.get('entities', [])
            if entities:
                f.write(f"**Entities/Metrics:** {', '.join(entities)}\n\n")
            f.write("\n")
            
        f.write("---\n\n")
        f.write(f"## 4. Cost & Token Analysis\n")
        f.write(f"| Model | Input Tokens | Cache Create | Cache Read | Output Tokens | Estimated Cost (USD) |\n")
        f.write(f"|---|---|---|---|---|---|\n")
        f.write(f"| Claude ({model}) | {usage_stats['anthropic_in']:,} | {usage_stats['cache_creation']:,} | {usage_stats['cache_read']:,} | {usage_stats['anthropic_out']:,} | ${total_cost:.4f} |\n\n")
        f.write(f"*Note: Batch processing is billed at 50% of real-time processing costs.*")

    print(f"[SUCCESS] Saved RAG-optimized report to: {out_path}")
    return {
        "output_path": out_path,
        "input_tokens": usage_stats["anthropic_in"],
        "output_tokens": usage_stats["anthropic_out"],
        "cost": total_cost
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parse PPTX into structured RAG Markdown using Anthropic 2-Prompt Architecture.")
    parser.add_argument("ppt_path", type=str, help="Path to the .pptx file")
    parser.add_argument("--anthropic-key", type=str, default=None, help="Anthropic API key")
    parser.add_argument("--model", type=str, default="claude-sonnet-4-6", help="Claude model version")
    parser.add_argument("--workers", type=int, default=3, help="Max concurrent workers (realtime)")
    parser.add_argument("--batch", action="store_true", default=True, help="Enable 50% cost Anthropic batch processing mode (now default)")
    
    args = parser.parse_args()
    
    anthropic_api_key = args.anthropic_key or os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_api_key:
        print("[ERROR] No Anthropic API key found. Use --anthropic-key or ANTHROPIC_API_KEY env var.")
        exit(1)
        
    process_pptx(
        ppt_path=args.ppt_path,
        anthropic_key=anthropic_api_key,
        model=args.model,
        max_workers=args.workers,
        use_batch=args.batch
    )
