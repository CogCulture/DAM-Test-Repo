import os
import argparse
import base64
import time
import json
import traceback
import cv2
from concurrent.futures import ThreadPoolExecutor, as_completed
import anthropic

from scenedetect import open_video, SceneManager
from scenedetect.detectors import ContentDetector

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
# PySceneDetect
# =============================================================================
def detect_scenes(video_path: str, threshold: float = 27.0):
    print(f"Running PySceneDetect (threshold={threshold})...")
    try:
        video = open_video(video_path)
        scene_manager = SceneManager()
        scene_manager.add_detector(ContentDetector(threshold=threshold))
        scene_manager.detect_scenes(video, show_progress=False)
        scene_list = scene_manager.get_scene_list()
    except Exception as e:
        print(f"[WARNING] PySceneDetect failed: {e}. Treating video as one scene.")
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps else 0
        cap.release()
        return [{"scene_num": 1, "start_sec": 0.0, "end_sec": duration, "duration_sec": duration}]

    scenes = []
    for i, (start_tc, end_tc) in enumerate(scene_list):
        start_sec = start_tc.get_seconds()
        end_sec = end_tc.get_seconds()
        scenes.append({
            "scene_num": i + 1,
            "start_sec": round(start_sec, 2),
            "end_sec": round(end_sec, 2),
            "duration_sec": round(end_sec - start_sec, 2),
        })

    print(f"Detected {len(scenes)} scene(s).")
    return scenes

# =============================================================================
# Frame Extraction
# =============================================================================
def _encode_frame_b64(frame) -> str:
    """Resize a cv2 frame to max 768px on the longest side and return base64 JPEG."""
    height, width = frame.shape[:2]
    max_dim = 768
    if max(height, width) > max_dim:
        scale = max_dim / max(height, width)
        frame = cv2.resize(frame, (int(width * scale), int(height * scale)))
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buffer).decode("utf-8")


def extract_scene_frames(video_path: str, start_sec: float, end_sec: float, target_fps: int = 4):
    """Extract exactly 3 keyframes per scene: first, middle, and last frame.
    
    ``target_fps`` is kept in the signature for API compatibility but is no
    longer used — we always return exactly 3 frames to minimise token cost.
    """
    cap = cv2.VideoCapture(video_path)
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    if video_fps == 0:
        video_fps = 30.0

    duration = max(end_sec - start_sec, 0.0)
    # Three keyframe timestamps: start, middle, end (clamp end slightly back to avoid overrun)
    mid_sec = start_sec + duration / 2.0
    # Keep end frame 1 frame before the true end so we don't overshoot the scene boundary
    end_frame_sec = max(end_sec - (1.0 / video_fps), start_sec)
    timestamps = [start_sec, mid_sec, end_frame_sec]

    frames_b64 = []
    for ts in timestamps:
        frame_num = int(ts * video_fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()
        if ret:
            frames_b64.append(_encode_frame_b64(frame))

    cap.release()
    return frames_b64

# =============================================================================
# Anthropic API Helpers
# =============================================================================

def call_anthropic_with_retry(client, model, messages, max_tokens=4096, temperature=0.1, max_retries=5):
    for attempt in range(max_retries):
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=messages
            )
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
    """Helper to strip markdown block ticks if present."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()

# =============================================================================
# Main Pipeline
# =============================================================================

@traceable(name="Video Parsing Pipeline")
def process_video_anthropic(video_path, anthropic_key, model="claude-sonnet-4-6", target_fps=4, workers=3, use_batch=False):
    mode_str = "BATCH" if use_batch else "REAL-TIME"
    print(f"\n--- Starting Video Parsing Pipeline (Anthropic - {mode_str} Mode) on: {os.path.basename(video_path)} ---")
    
    # Check for audio transcription support
    _whisper_model = None
    try:
        from faster_whisper import WhisperModel
        print("    -> [INFO] faster-whisper available. Audio transcription enabled.")
        _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    except ImportError:
        try:
            import whisper as _whisper_lib
            print("    -> [INFO] openai-whisper available. Audio transcription enabled.")
            _whisper_model = _whisper_lib.load_model("base")
        except ImportError:
            print("    -> [WARNING] No whisper library found. Audio transcription disabled. Install faster-whisper or openai-whisper.")

    client = anthropic.Anthropic(api_key=anthropic_key)
    if LANGSMITH_AVAILABLE and os.environ.get("LANGCHAIN_TRACING_V2", "").lower() == "true":
        print(f"    -> [INFO] LangSmith tracing is ENABLED.")
        client = wrap_anthropic(client)
        
    usage_stats = {"anthropic_in": 0, "anthropic_out": 0}
    
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

    # 1. Scene Detection
    scenes = detect_scenes(video_path)
    if not scenes:
        print("[ERROR] No scenes detected. Exiting.")
        return

    print(f"\n[PHASE 1] Analyzing {len(scenes)} scenes at {target_fps} FPS using {model}...")
    
    scene_prompt_text = (
        "You are an expert video analyst. These images represent frames from a single continuous scene of a video. "
        "Please analyze these frames and provide a structured JSON response with the following keys exactly:\n"
        "{\n"
        '  "summary": "<Detailed summary of what is happening in the scene>",\n'
        '  "keywords": ["<keyword1>", "<keyword2>"],\n'
        '  "entities": ["<object1>", "<location1>", "<person1>"],\n'
        '  "visual_style": "<Lighting, camera angles, colors, overall aesthetic>",\n'
        '  "celebrities_or_faces": ["<Name or description of important faces/people visible>"]\n'
        "}\n\n"
        "Output ONLY valid JSON. Do not include markdown wrappers."
    )

    scene_results = {}
    
    if use_batch:
        requests_list = []
        for s in scenes:
            s_num = s["scene_num"]
            frames = extract_scene_frames(video_path, s["start_sec"], s["end_sec"], target_fps)
            
            content = []
            for b64 in frames:
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": b64
                    }
                })
            content.append({"type": "text", "text": scene_prompt_text})
            
            requests_list.append({
                "custom_id": f"scene_{s_num}",
                "params": {
                    "model": model,
                    "max_tokens": 4096,
                    "temperature": 0.1,
                    "messages": [{"role": "user", "content": content}]
                }
            })
            
        batch_res = run_anthropic_batch_task(client, requests_list)
        
        for s in scenes:
            s_num = s["scene_num"]
            cid = f"scene_{s_num}"
            if cid in batch_res and "error" not in batch_res[cid]:
                add_usage(batch_res[cid].get("usage", {}))
                try:
                    parsed = json.loads(extract_json(batch_res[cid]["content"]))
                    parsed["scene_num"] = s_num
                    parsed["start_sec"] = s["start_sec"]
                    parsed["end_sec"] = s["end_sec"]
                    scene_results[s_num] = parsed
                except Exception as e:
                    scene_results[s_num] = {"scene_num": s_num, "error": f"JSON Parse error: {e}"}
            else:
                err = batch_res.get(cid, {}).get("error", "Unknown batch error")
                scene_results[s_num] = {"scene_num": s_num, "error": err}
    else:
        def analyze_scene(scene):
            s_num = scene["scene_num"]
            frames = extract_scene_frames(video_path, scene["start_sec"], scene["end_sec"], target_fps)
            
            content = []
            for b64 in frames:
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": b64
                    }
                })
            content.append({"type": "text", "text": scene_prompt_text})
            
            try:
                resp = call_anthropic_with_retry(client, model, [{"role": "user", "content": content}])
                add_usage(resp.usage)
                parsed = json.loads(extract_json(resp.content[0].text))
                parsed["scene_num"] = s_num
                parsed["start_sec"] = scene["start_sec"]
                parsed["end_sec"] = scene["end_sec"]
                return s_num, parsed
            except Exception as e:
                return s_num, {"scene_num": s_num, "error": str(e)}

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(analyze_scene, s): s["scene_num"] for s in scenes}
            for future in as_completed(futures):
                s_num, data = future.result()
                scene_results[s_num] = data
                print(f" -> Completed Scene {s_num}")

    sorted_scenes = [scene_results[i] for i in range(1, len(scenes) + 1)]
    
    # 3. Overall Summary Generation
    print("\n[PHASE 2] Generating overall video summary (REAL-TIME)...")
    overall_prompt = (
        "You are an expert video summarizer. Below is the per-scene metadata extracted from a video.\n\n"
        f"--- SCENE METADATA ---\n{json.dumps(sorted_scenes, indent=2)}\n\n"
        "Based on all these scenes, write a comprehensive overall summary of the entire video. "
        "Include the overall narrative, primary entities involved, the general aesthetic/visual style, and the main takeaways."
    )
    
    try:
        resp = call_anthropic_with_retry(client, model, [{"role": "user", "content": overall_prompt}])
        add_usage(resp.usage)
        overall_summary = resp.content[0].text.strip()
    except Exception as e:
        print(f"[ERROR] Failed to generate overall summary: {e}")
        overall_summary = "Failed to generate overall summary."

    # 3b. Audio Transcription
    audio_transcript = ""
    if _whisper_model is not None:
        print("\n[PHASE 3] Transcribing audio with Whisper...")
        try:
            # faster-whisper API
            if hasattr(_whisper_model, "transcribe") and "WhisperModel" in type(_whisper_model).__name__:
                segments, _ = _whisper_model.transcribe(video_path, beam_size=5)
                audio_transcript = " ".join(seg.text.strip() for seg in segments)
            else:
                # openai-whisper API
                result = _whisper_model.transcribe(video_path)
                audio_transcript = result.get("text", "").strip()
            print(f"    -> Transcription complete ({len(audio_transcript)} chars).")
        except Exception as e:
            print(f"    -> [WARNING] Audio transcription failed: {e}")
            audio_transcript = ""
    else:
        print("\n[PHASE 3] Skipping audio transcription (no whisper library installed).")

    # 4. Save to Markdown

    print("\n[FINISHING] Compiling final Markdown report...")
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    out_dir = os.path.dirname(os.path.abspath(video_path))
    out_path = os.path.join(out_dir, f"{base_name}_anthropic_parsed.md")
    
    cost_in = (usage_stats["anthropic_in"] / 1_000_000) * 3.00
    cost_out = (usage_stats["anthropic_out"] / 1_000_000) * 15.00
    if use_batch:
        cost_in /= 2
        cost_out /= 2
    total_cost = cost_in + cost_out
    
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Video Analysis Report (Anthropic)\n")
        f.write(f"**File:** {os.path.basename(video_path)}\n")
        f.write(f"**Model Used:** {model}\n")
        f.write(f"**Frame Strategy:** 3 keyframes per scene (first / middle / last)\n")
        f.write(f"**Processing Mode:** {mode_str}\n\n")
        f.write("---\n\n")
        
        f.write(f"## Overall Video Summary\n")
        f.write(f"{overall_summary}\n\n")
        f.write("---\n\n")

        if audio_transcript:
            f.write(f"## Audio Transcript\n")
            f.write(f"{audio_transcript}\n\n")
            f.write("---\n\n")
        
        f.write(f"## Per-Scene Breakdown\n")
        for s in sorted_scenes:
            f.write(f"### Scene {s.get('scene_num')} ({s.get('start_sec', 0.0)}s - {s.get('end_sec', 0.0)}s)\n")
            if "error" in s:
                f.write(f"**Error:** {s['error']}\n\n")
                continue
                
            f.write(f"**Summary:** {s.get('summary', 'N/A')}\n\n")
            f.write(f"**Keywords:** {', '.join(s.get('keywords', []))}\n\n")
            f.write(f"**Entities:** {', '.join(s.get('entities', []))}\n\n")
            f.write(f"**Visual Style:** {s.get('visual_style', 'N/A')}\n\n")
            f.write(f"**Celebrities/Faces:** {', '.join(s.get('celebrities_or_faces', []))}\n\n")
            f.write("---\n")
            
        f.write(f"## Cost & Token Analysis\n")
        f.write(f"| Model | Input Tokens | Output Tokens | Estimated Cost (USD) |\n")
        f.write(f"|---|---|---|---|\n")
        f.write(f"| {model} | {usage_stats['anthropic_in']:,} | {usage_stats['anthropic_out']:,} | ${total_cost:.4f} |\n\n")
        f.write(f"*Note: Batch processing is billed at 50% of real-time processing costs.*\n")

    print(f"[SUCCESS] Saved Anthropic analysis report to: {out_path}")
    return {
        "output_path": out_path,
        "input_tokens": usage_stats["anthropic_in"],
        "output_tokens": usage_stats["anthropic_out"],
        "cost": total_cost
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parse video using Anthropic Claude and PySceneDetect.")
    parser.add_argument("video_path", help="Path to the video file")
    parser.add_argument("--anthropic-key", type=str, help="API Key for Anthropic")
    parser.add_argument("--model", type=str, default="claude-sonnet-4-6", help="Claude model name")
    parser.add_argument("--fps", type=int, default=4, help="Frames per second to extract per scene")
    parser.add_argument("--workers", type=int, default=3, help="Max concurrent workers for real-time mode")
    parser.add_argument("--batch", action="store_true", default=True, help="Use Anthropic Message Batches API (now default)")
    
    args = parser.parse_args()

    api_key = args.anthropic_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[ERROR] No Anthropic API key found. Use --anthropic-key or set ANTHROPIC_API_KEY env var.")
        exit(1)

    process_video_anthropic(
        video_path=args.video_path,
        anthropic_key=api_key,
        model=args.model,
        target_fps=args.fps,
        workers=args.workers,
        use_batch=args.batch
    )
