"""
processor.py - Routes files to the correct parser based on file type.
Integrates with job_store for pause/resume and error tracking.
"""
import os
import sys
import time

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
    ".txt", ".pdf", ".pptx", ".docx", ".xlsx", ".xls",
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

    if ext == ".txt":
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
        # parse_docx.py uses Batch API internally and returns usage
        from parse_docx import main as docx_main
        # parse_docx exposes analyze_with_claude; call it directly
        from parse_docx import extract_text_from_docx, extract_images_from_docx, analyze_with_claude
        text = extract_text_from_docx(file_path)
        images = extract_images_from_docx(file_path)
        result_text, usage = analyze_with_claude_with_usage(text, images, ANTHROPIC_API_KEY, CLAUDE_MODEL)
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
        # transcribe_and_tag.py doesn't use an LLM API (local models), no token cost
        out_path = os.path.splitext(file_path)[0] + "_transcript.txt"
        _run_transcribe(file_path, out_path)
        return {"output_path": out_path, "input_tokens": 0, "output_tokens": 0, "cost": 0.0}

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


def analyze_with_claude_with_usage(text_content, images, api_key, model):
    """Wrapper around parse_docx's analyze_with_claude that also returns usage."""
    import base64
    import time as _time
    from anthropic import Anthropic
    client = Anthropic(api_key=api_key)
    content = []
    if text_content:
        content.append({"type": "text", "text": f"Document text:\n\n{text_content}\n\n---"})
    for img in images:
        b64 = base64.b64encode(img["bytes"]).decode("utf-8")
        content.append({"type": "image", "source": {"type": "base64", "media_type": img["mime_type"], "data": b64}})
    content.append({"type": "text", "text": (
        "You are an expert document analyst. I have provided the raw text and all images from a Word document.\n\n"
        "Please provide the following EXACT format in Markdown:\n"
        "1. **Per-Page/Section Summary**: Divide content into logical sections, summarize each with visual insights.\n"
        "2. **Overall Summary**: At the end, a cohesive overall summary."
    )})

    requests_list = [{"custom_id": "docx_1", "params": {"model": model, "max_tokens": 4096, "messages": [{"role": "user", "content": content}]}}]
    try:
        batch = client.beta.messages.batches.create(requests=requests_list)
    except AttributeError:
        batch = client.messages.batches.create(requests=requests_list)

    while True:
        try:
            b_status = client.beta.messages.batches.retrieve(batch.id)
        except AttributeError:
            b_status = client.messages.batches.retrieve(batch.id)
        if b_status.processing_status in ["ended", "canceled", "expired"]:
            break
        _time.sleep(10)

    result_text = ""
    in_tokens, out_tokens = 0, 0
    try:
        results_iter = client.beta.messages.batches.results(batch.id)
    except AttributeError:
        results_iter = client.messages.batches.results(batch.id)

    for result in results_iter:
        if result.result.type == "succeeded":
            msg = result.result.message
            result_text = msg.content[0].text
            in_tokens = msg.usage.input_tokens
            out_tokens = msg.usage.output_tokens

    cost = (in_tokens * 1.5 + out_tokens * 7.5) / 1_000_000
    out_path_placeholder = None  # Will be set by caller
    return result_text, {"output_path": out_path_placeholder, "input_tokens": in_tokens, "output_tokens": out_tokens, "cost": cost}


def _process_image_single(image_path: str) -> dict:
    """Sends a single image to Claude Vision for a quick analysis (Synchronous)."""
    import base64
    import os
    import cv2
    from anthropic import Anthropic
    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    
    MAX_DIM = 768
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Failed to read image: {image_path}")
        
    h, w = img.shape[:2]
    if max(h, w) > MAX_DIM:
        scale = MAX_DIM / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    
    ext = os.path.splitext(image_path)[1].lower()
    m_type = "image/png" if ext == ".png" else ("image/webp" if ext == ".webp" else "image/jpeg")
    encode_ext = ".jpg" if m_type == "image/jpeg" else ext
    
    _, buffer = cv2.imencode(encode_ext, img, [cv2.IMWRITE_JPEG_QUALITY, 85] if encode_ext==".jpg" else [])
    b64 = base64.b64encode(buffer).decode("utf-8")

    resp = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": m_type, "data": b64}},
            {"type": "text", "text": "Describe and analyze this image in detail. Extract all visible text, data, and visual insights."}
        ]}]
    )
    out_path = os.path.splitext(image_path)[0] + "_parsed.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Image Analysis\n\n{resp.content[0].text}")
    in_tokens = resp.usage.input_tokens
    out_tokens = resp.usage.output_tokens
    cost = (in_tokens * 3.0 + out_tokens * 15.0) / 1_000_000
    return {"output_path": out_path, "input_tokens": in_tokens, "output_tokens": out_tokens, "cost": cost}


def _process_image_batch(job_id: str, image_files: list, progress_callback):
    """Processes multiple images as a single Anthropic batch."""
    import base64
    import cv2
    import json
    import time
    from anthropic import Anthropic
    
    print(f"[Job {job_id}] Packing {len(image_files)} images into an Anthropic batch...")
    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    
    requests_list = []
    MAX_DIM = 768
    
    # 1. Optimize and pack images
    for idx, file_item in enumerate(image_files):
        img_path = file_item["path"]
        try:
            img = cv2.imread(img_path)
            if img is not None:
                h, w = img.shape[:2]
                if max(h, w) > MAX_DIM:
                    scale = MAX_DIM / max(h, w)
                    img = cv2.resize(img, (int(w * scale), int(h * scale)))
                
                ext = os.path.splitext(img_path)[1].lower()
                m_type = "image/png" if ext == ".png" else ("image/webp" if ext == ".webp" else "image/jpeg")
                encode_ext = ".jpg" if m_type == "image/jpeg" else ext
                
                _, buffer = cv2.imencode(encode_ext, img, [cv2.IMWRITE_JPEG_QUALITY, 85] if encode_ext==".jpg" else [])
                b64 = base64.b64encode(buffer).decode("utf-8")
                
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
        print(f"[Job {job_id}] Batch error: {e}")
        # Mark remaining as failed
        for f in image_files:
            if js.get_job(job_id)["files"][f["index"]]["status"] == "processing":
                js.update_file_status(job_id, f["index"], "failed", error=str(e))
                if progress_callback: progress_callback(job_id, f, "failed", {"error": str(e)})


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
