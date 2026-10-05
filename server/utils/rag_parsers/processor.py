"""
processor.py - Routes files to the correct parser based on file type.
Integrates with job_store for pause/resume and error tracking.
"""
import os
import sys
import time
import json

# Add parent dir (RAGPush) to sys.path so we can import the parser scripts
PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PARENT_DIR not in sys.path:
    sys.path.insert(0, PARENT_DIR)

import job_store as js

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
USE_BATCH_API = os.environ.get("RAG_USE_BATCH", "false").strip().lower() in {
    "1", "true", "yes", "on"
}

SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".pdf", ".pptx", ".docx", ".xlsx", ".xls",
    ".mp4", ".mov", ".avi", ".mkv",
    ".mp3", ".wav", ".m4a",
    ".jpg", ".jpeg", ".png", ".webp"
}


def route_file(file_path: str, file_type: str = "") -> dict:
    """
    Routes a file using an explicit type when supplied, otherwise its path extension.
    Returns a dict with output_path, input_tokens, output_tokens, cost.
    """
    ext = (file_type or os.path.splitext(file_path)[1]).lower()
    if ext and not ext.startswith("."):
        ext = f".{ext}"

    if ext in (".txt", ".md", ".markdown"):
        return _process_text_file(file_path)

    elif ext == ".pdf":
        try:
            from parse_pdf_anthropic import process_pdf
        except ModuleNotFoundError as exc:
            dependency = exc.name or "unknown"
            raise RuntimeError(
                f"PDF RAG dependency '{dependency}' is missing. "
                "Install server/utils/rag_parsers/requirements.txt with the same Python used by the app."
            ) from exc
        return process_pdf(
            pdf_path=file_path,
            anthropic_key=ANTHROPIC_API_KEY,
            model=CLAUDE_MODEL,
            max_workers=3,
            use_batch=USE_BATCH_API
        )

    elif ext == ".pptx":
        from parse_pptx_v3 import process_pptx
        return process_pptx(
            ppt_path=file_path,
            anthropic_key=ANTHROPIC_API_KEY,
            model=CLAUDE_MODEL,
            max_workers=3,
            use_batch=USE_BATCH_API
        )

    elif ext == ".docx":
        try:
            from parse_docx import extract_text_from_docx, extract_images_from_docx
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "DOCX RAG dependency 'python-docx' is missing. Install "
                "server/utils/rag_parsers/requirements.txt with the same Python "
                "used by the app."
            ) from exc
        print(json.dumps({"type": "stage", "stage": "extracting", "message": "Extracting Word document content..."}), flush=True)
        text = extract_text_from_docx(file_path)
        images = extract_images_from_docx(file_path)
        print(json.dumps({"type": "stage", "stage": "analyzing", "message": "Analyzing document content..."}), flush=True)
        result_text, usage = analyze_with_claude_with_usage(
            text,
            images,
            ANTHROPIC_API_KEY,
            CLAUDE_MODEL,
            use_batch=USE_BATCH_API,
        )
        out_path = os.path.splitext(file_path)[0] + "_parsed.md"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(result_text or "")
        if isinstance(usage, dict):
            return {**usage, "output_path": out_path}
        return {"output_path": out_path, "input_tokens": 0, "output_tokens": 0, "cost": 0.0}

    elif ext in (".mp4", ".mov", ".avi", ".mkv"):
        from parse_video_anthropic import process_video_anthropic
        return process_video_anthropic(
            video_path=file_path,
            anthropic_key=ANTHROPIC_API_KEY,
            model=CLAUDE_MODEL,
            target_fps=4,
            workers=3,
            use_batch=USE_BATCH_API
        )

    elif ext in (".mp3", ".wav", ".m4a"):
        from parse_audio import process_audio
        return process_audio(file_path, ANTHROPIC_API_KEY, CLAUDE_MODEL)

    elif ext in (".xlsx", ".xls"):
        # parse_excel.py
        from parse_excel import process_excel_fast
        result = process_excel_fast(file_path, ANTHROPIC_API_KEY, CLAUDE_MODEL)
        return result if result else {"output_path": None, "input_tokens": 0, "output_tokens": 0, "cost": 0.0}

    elif ext in (".jpg", ".jpeg", ".png", ".webp"):
        # Single image — use a quick Claude vision call
        return _process_image_single(file_path)

    else:
        raise ValueError(f"Unsupported file type: {ext}")


def _process_text_file(file_path: str) -> dict:
    """Convert UTF-8 plain text into the Markdown artifact used by the embedder."""
    try:
        with open(file_path, "r", encoding="utf-8-sig") as source:
            text = source.read()
    except UnicodeDecodeError as exc:
        raise ValueError("Text files must use UTF-8 encoding") from exc

    if not text.strip():
        raise ValueError("Text file is empty")

    file_name = os.path.basename(file_path)
    out_path = os.path.splitext(file_path)[0] + "_parsed.md"
    with open(out_path, "w", encoding="utf-8") as output:
        output.write(f"# {file_name}\n\n{text}")

    return {
        "output_path": out_path,
        "input_tokens": 0,
        "output_tokens": 0,
        "cost": 0.0,
    }


def _run_transcribe(audio_path: str, out_path: str):
    """Runs the transcription pipeline as a subprocess-like call."""
    import subprocess
    script = os.path.join(PARENT_DIR, "transcribe_and_tag.py")
    subprocess.run(
        [sys.executable, script, audio_path, "--device", "cpu"],
        cwd=PARENT_DIR,
        check=True
    )


def run_anthropic_analysis(client, requests_list, use_batch):
    """Run one DOCX request interactively by default or through Batch when opted in."""
    if not use_batch:
        message = client.messages.create(**requests_list[0]["params"])
        return (
            message.content[0].text,
            message.usage.input_tokens,
            message.usage.output_tokens,
        )

    try:
        batches = client.beta.messages.batches
    except AttributeError:
        batches = client.messages.batches

    batch = batches.create(requests=requests_list)
    while True:
        status = batches.retrieve(batch.id)
        if status.processing_status in ["ended", "canceled", "expired"]:
            break
        time.sleep(10)

    result_text = ""
    input_tokens, output_tokens = 0, 0
    for result in batches.results(batch.id):
        if result.result.type == "succeeded":
            message = result.result.message
            result_text = message.content[0].text
            input_tokens = message.usage.input_tokens
            output_tokens = message.usage.output_tokens
    return result_text, input_tokens, output_tokens


def analyze_with_claude_with_usage(text_content, images, api_key, model, use_batch=False):
    """Wrapper around docx analysis with Claude/ChatGPT fallback that also returns usage."""
    import base64
    from llm_client import call_llm_with_fallback

    content = []
    if text_content:
        content.append({
            "type": "text",
            "text": f"Here is the text extracted from the document:\n\n{text_content}\n\n---"
        })
    for img in images:
        b64_encoded = base64.b64encode(img["bytes"]).decode("utf-8")
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img.get("mime_type", "image/jpeg"),
                "data": b64_encoded
            }
        })
    content.append({
        "type": "text",
        "text": (
            "You are an expert document analyst. I have provided the raw text extracted from a Word document, "
            "along with all the images and charts found inside it. Note that the text was extracted natively, so strict page numbers are missing.\n\n"
            "Please provide the following EXACT format in Markdown:\n"
            "1. **Per-Page/Section Summary**: Divide the content conceptually into logical chunks or simulated pages, and provide a detailed summary for each one. Include insights from any relevant images/charts.\n"
            "2. **Overall Summary**: At the very end, provide a cohesive overall summary of the entire document."
        )
    })

    resp = call_llm_with_fallback(
        messages=[{"role": "user", "content": content}],
        model=model,
        max_tokens=4096,
        anthropic_key=api_key,
        openai_model="gpt-4o"
    )
    result_text = resp.content[0].text
    in_tokens = getattr(resp.usage, "input_tokens", 0)
    out_tokens = getattr(resp.usage, "output_tokens", 0)
    cost = (in_tokens * 1.5 + out_tokens * 7.5) / 1_000_000
    out_path_placeholder = None  # Will be set by caller
    return result_text, {"output_path": out_path_placeholder, "input_tokens": in_tokens, "output_tokens": out_tokens, "cost": cost}



def _encode_image_b64(image_path: str, max_dim: int = 768) -> tuple[str, str]:
    import base64
    import io
    import logging
    import os

    ext = os.path.splitext(image_path)[1].lower()
    m_type = "image/png" if ext == ".png" else ("image/webp" if ext == ".webp" else "image/jpeg")

    # Strategy 1: PIL / Pillow (Primary - robust color conversion including CMYK, RGBA, EXIF transposition, and large print design formats)
    try:
        from PIL import Image, ImageFile, ImageOps
        Image.MAX_IMAGE_PIXELS = None  # Prevent DecompressionBombError on high-res design assets
        ImageFile.LOAD_TRUNCATED_IMAGES = True

        with Image.open(image_path) as img:
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            # Convert non-RGB/L modes (e.g. CMYK print files, palette P, RGBA to JPEG)
            if img.mode not in ("RGB", "L") or m_type == "image/jpeg":
                if img.mode in ("RGBA", "LA", "P"):
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    alpha_img = img.convert("RGBA")
                    bg.paste(alpha_img, mask=alpha_img.split()[3])
                    img = bg
                else:
                    img = img.convert("RGB")
                m_type = "image/jpeg"
                fmt = "JPEG"
            else:
                fmt = "PNG" if m_type == "image/png" else ("WEBP" if m_type == "image/webp" else "JPEG")

            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

            # Iterative downscale/compression to guarantee payload never exceeds Anthropic's 10 MB limit
            quality = 85
            current_dim = max_dim
            while True:
                buf = io.BytesIO()
                if fmt == "JPEG":
                    img.save(buf, format="JPEG", quality=quality, optimize=True)
                elif fmt == "PNG":
                    img.save(buf, format="PNG", optimize=True)
                else:
                    img.save(buf, format=fmt, quality=quality)

                data = buf.getvalue()
                # 4 MB binary yields ~5.3 MB base64, well under Anthropic's 10 MB (10,485,760 bytes) limit
                if len(data) <= 4 * 1024 * 1024 or quality <= 25:
                    return base64.b64encode(data).decode("utf-8"), m_type

                quality -= 20
                current_dim = int(current_dim * 0.75)
                img.thumbnail((current_dim, current_dim), Image.Resampling.LANCZOS)
    except Exception as e:
        logging.getLogger(__name__).warning("Pillow failed to encode %s: %s", image_path, e)

    # Strategy 2: OpenCV fallback
    try:
        import cv2
        img = cv2.imread(image_path)
        if img is not None:
            h, w = img.shape[:2]
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            encode_ext = ".jpg" if m_type == "image/jpeg" else ext
            params = [cv2.IMWRITE_JPEG_QUALITY, 80] if encode_ext == ".jpg" else []
            _, buffer = cv2.imencode(encode_ext, img, params)
            data = buffer.tobytes()
            if len(data) <= 4 * 1024 * 1024:
                return base64.b64encode(data).decode("utf-8"), m_type
    except Exception as e:
        logging.getLogger(__name__).warning("OpenCV failed to encode %s: %s", image_path, e)

    # Strategy 3: Safe binary read ONLY if file is small enough (< 5 MB binary -> < 6.7 MB base64)
    if os.path.exists(image_path):
        fsize = os.path.getsize(image_path)
        if fsize <= 5 * 1024 * 1024:
            with open(image_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8"), m_type
        raise ValueError(
            f"Image {os.path.basename(image_path)} ({fsize / (1024 * 1024):.2f} MB) could not be resized and exceeds Anthropic's 10 MB limit."
        )

    raise FileNotFoundError(f"Image file not found: {image_path}")


def _process_image_single(image_path: str) -> dict:
    """Sends a single image to Claude Vision (or ChatGPT fallback) for analysis."""
    import os
    from llm_client import call_llm_with_fallback
    
    b64, m_type = _encode_image_b64(image_path, max_dim=768)

    resp = call_llm_with_fallback(
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": m_type, "data": b64}},
            {"type": "text", "text": "Describe and analyze this image in detail. Extract all visible text, data, and visual insights."}
        ]}],
        model=CLAUDE_MODEL,
        max_tokens=2048,
        anthropic_key=ANTHROPIC_API_KEY,
        openai_model="gpt-4o"
    )
    out_path = os.path.splitext(image_path)[0] + "_parsed.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Image Analysis\n\n{resp.content[0].text}")
    in_tokens = getattr(resp.usage, "input_tokens", 0)
    out_tokens = getattr(resp.usage, "output_tokens", 0)
    cost = (in_tokens * 3.0 + out_tokens * 15.0) / 1_000_000
    return {"output_path": out_path, "input_tokens": in_tokens, "output_tokens": out_tokens, "cost": cost}


def _fallback_image_single_loop(job_id: str, image_files: list, progress_callback):
    """Processes images sequentially using call_llm_with_fallback (Claude/ChatGPT)."""
    for f in image_files:
        file_index = f["index"]
        curr = js.get_job(job_id)
        if curr and curr["files"][file_index]["status"] in ("pending", "processing"):
            try:
                js.update_file_status(job_id, file_index, "processing")
                if progress_callback: progress_callback(job_id, f, "processing")
                res = _process_image_single(f["path"])
                js.update_file_status(job_id, file_index, "done", **res)
                if progress_callback: progress_callback(job_id, f, "done", res)
            except Exception as single_err:
                js.update_file_status(job_id, file_index, "failed", error=str(single_err))
                if progress_callback: progress_callback(job_id, f, "failed", {"error": str(single_err)})


def _process_image_batch(job_id: str, image_files: list, progress_callback):
    """Processes multiple images as a single Anthropic batch with fallback."""
    import json
    import time
    
    if not ANTHROPIC_API_KEY:
        print(f"[Job {job_id}] Anthropic API key not provided for batch. Using individual processing with fallback...")
        _fallback_image_single_loop(job_id, image_files, progress_callback)
        return

    from anthropic import Anthropic
    
    print(f"[Job {job_id}] Packing {len(image_files)} images into an Anthropic batch...")
    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    
    requests_list = []
    
    # 1. Optimize and pack images
    for idx, file_item in enumerate(image_files):
        img_path = file_item["path"]
        try:
            b64, m_type = _encode_image_b64(img_path, max_dim=768)
            prompt = (
                f"You are an expert visual analyst. Analyze the following image: '{file_item['name']}'\n"
                "Provide a highly structured JSON response explaining everything happening in the image. "
                "Do not invent details. Output ONLY valid JSON, with no markdown wrappers.\n\n"
                "Generate a JSON object with EXACTLY these keys:\n"
                "{\n"
                "  \"summary\": \"<A detailed, accurate paragraph describing the core subject, action, and setting.>\",\n"
                "  \"tone_and_mood\": \"<1-2 sentences describing the emotional tone or vibe of the image.>\",\n"
                "  \"lighting_and_composition\": \"<Description of lighting (e.g., harsh, soft, studio, natural) and composition / framing.>\",\n"
                "  \"visual_style\": \"<e.g., photographic, 3d render, vector art, minimalist, cinematic>\",\n"
                "  \"entities\": [\"<list>\", \"<of>\", \"<objects>\", \"<people>\", \"<locations>\"]\n"
                "}"
            )
            
            requests_list.append({
                "custom_id": f"img_{idx}",
                "params": {
                    "model": CLAUDE_MODEL,
                    "max_tokens": 1024,
                    "messages": [{"role": "user", "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": m_type, "data": b64}},
                        {"type": "text", "text": prompt}
                    ]}]
                }
            })
        except Exception as e:
            err_msg = f"Failed to optimize image: {e}"
            js.update_file_status(job_id, file_item["index"], "failed", error=err_msg)
            if progress_callback: progress_callback(job_id, file_item, "failed", {"error": err_msg})
            
    if not requests_list:
        return

    # 2. Submit Batch
    try:
        batch = client.beta.messages.batches.create(requests=requests_list)
        batch_id = batch.id
        print(f"[Job {job_id}] Image Batch {batch_id} submitted. Polling...")
        
        while True:
            b_status = client.beta.messages.batches.retrieve(batch_id)
            if b_status.processing_status in ["ended", "canceled", "expired"]:
                break
            time.sleep(10)
            
        # 3. Process Results
        for result in client.beta.messages.batches.results(batch_id):
            cid = result.custom_id
            orig_idx = int(cid.split("_")[1])
            file_item = image_files[orig_idx]
            file_index = file_item["index"]
            
            if result.result.type == "succeeded":
                msg_text = result.result.message.content[0].text
                in_tokens = result.result.message.usage.input_tokens
                out_tokens = result.result.message.usage.output_tokens
                
                # Try parsing JSON
                try:
                    txt = msg_text.strip()
                    if txt.startswith("```json"): txt = txt[7:]
                    elif txt.startswith("```"): txt = txt[3:]
                    if txt.endswith("```"): txt = txt[:-3]
                    parsed = json.loads(txt.strip())
                    
                    out_path = os.path.splitext(file_item["path"])[0] + "_parsed.md"
                    with open(out_path, "w", encoding="utf-8") as f:
                        f.write(f"# Image Analysis: {file_item['name']}\n\n")
                        for k, v in parsed.items():
                            f.write(f"**{k.replace('_', ' ').title()}**: {v}\n\n")
                    
                    cost = (in_tokens * 1.5 + out_tokens * 7.5) / 1_000_000
                    result_dict = {"output_path": out_path, "input_tokens": in_tokens, "output_tokens": out_tokens, "cost": cost}
                    
                    js.update_file_status(job_id, file_index, "done", **result_dict)
                    if progress_callback: progress_callback(job_id, file_item, "done", result_dict)
                except Exception as e:
                    err_msg = f"JSON parse error: {e}"
                    js.update_file_status(job_id, file_index, "failed", error=err_msg)
                    if progress_callback: progress_callback(job_id, file_item, "failed", {"error": err_msg})
            else:
                err_msg = str(result.result)
                js.update_file_status(job_id, file_index, "failed", error=err_msg)
                if progress_callback: progress_callback(job_id, file_item, "failed", {"error": err_msg})
                
    except Exception as e:
        print(f"[Job {job_id}] Anthropic Batch error: {e}. Falling back to sequential single image processing...")
        _fallback_image_single_loop(job_id, image_files, progress_callback)



def run_job(job_id: str, progress_callback=None):
    """
    Main worker function. Processes all pending files in the job.
    Images are batched together asynchronously if > 1.
    """
    import threading
    js.update_job_status(job_id, "running")
    
    job = js.get_job(job_id)
    if not job: return
    
    # 1. Group images
    image_exts = (".jpg", ".jpeg", ".png", ".webp")
    image_files = [f for f in job["files"] if os.path.splitext(f["path"])[1].lower() in image_exts and f["status"] == "pending"]
    
    image_thread = None
    if len(image_files) > 1:
        # Mark them as processing immediately so the main loop skips them
        for f in image_files:
            js.update_file_status(job_id, f["index"], "processing")
            if progress_callback: progress_callback(job_id, f, "processing")
            
        image_thread = threading.Thread(target=_process_image_batch, args=(job_id, image_files, progress_callback))
        image_thread.start()

    # 2. Main loop for other files
    while True:
        if js.is_paused(job_id):
            print(f"[Job {job_id}] Paused.")
            return

        file_item = js.get_next_pending_file(job_id)
        if not file_item:
            break

        file_index = file_item["index"]
        file_path = file_item["path"]
        file_name = file_item["name"]
        ext = os.path.splitext(file_path)[1].lower()

        if ext not in SUPPORTED_EXTENSIONS:
            js.update_file_status(job_id, file_index, "skipped", error=f"Unsupported file type: {ext}")
            if progress_callback: progress_callback(job_id, file_item, "skipped")
            continue

        print(f"[Job {job_id}] Processing: {file_name}")
        js.update_file_status(job_id, file_index, "processing")
        if progress_callback: progress_callback(job_id, file_item, "processing")

        try:
            if ext in image_exts:
                # Fallback to single sync processing for 1 image
                result = _process_image_single(file_path)
            else:
                result = route_file(file_path)
                
            js.update_file_status(
                job_id, file_index, "done",
                output_path=result.get("output_path"),
                input_tokens=result.get("input_tokens", 0),
                output_tokens=result.get("output_tokens", 0),
                cost=result.get("cost", 0.0)
            )
            if progress_callback: progress_callback(job_id, file_item, "done", result)
            print(f"[Job {job_id}] Done: {file_name}")

        except Exception as e:
            import traceback
            err_msg = f"{type(e).__name__}: {str(e)}"
            print(f"[Job {job_id}] FAILED: {file_name} — {err_msg}")
            js.update_file_status(job_id, file_index, "failed", error=err_msg)
            if progress_callback: progress_callback(job_id, file_item, "failed", {"error": err_msg})
            
    # 3. Wait for image batch to finish before marking job as done
    if image_thread:
        print(f"[Job {job_id}] Waiting for image batch to finish...")
        image_thread.join()
        
    # Check if job is still considered running (in case it was paused during image thread wait)
    if js.get_job(job_id)["status"] == "running":
        js.update_job_status(job_id, "done")
        print(f"[Job {job_id}] All files complete.")
        if progress_callback: progress_callback(job_id, None, "done")
