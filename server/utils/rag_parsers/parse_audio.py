import os
import sys
import json
import wave

def process_audio(audio_path: str, anthropic_key: str = None, model: str = "claude-sonnet-4-6") -> dict:
    file_name = os.path.basename(audio_path)
    ext = os.path.splitext(audio_path)[1].lower()
    file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
    
    metadata = {
        "file_name": file_name,
        "format": ext,
        "file_size_mb": round(file_size_mb, 2),
    }

    # Extract wave properties if wav
    if ext == ".wav":
        try:
            with wave.open(audio_path, "rb") as wf:
                channels = wf.getnchannels()
                sample_width = wf.getsampwidth()
                framerate = wf.getframerate()
                nframes = wf.getnframes()
                duration = round(nframes / float(framerate), 2)
                metadata["channels"] = channels
                metadata["sample_rate_hz"] = framerate
                metadata["duration_seconds"] = duration
        except Exception:
            pass

    out_dir = os.path.dirname(os.path.abspath(audio_path))
    base_name = os.path.splitext(os.path.basename(audio_path))[0]
    out_path = os.path.join(out_dir, f"{base_name}_parsed.md")

    # Attempt speech recognition if available and wav format
    transcript = ""
    try:
        import speech_recognition as sr
        r = sr.Recognizer()
        if ext == ".wav":
            with sr.AudioFile(audio_path) as source:
                audio_data = r.record(source, duration=180)
                transcript = r.recognize_google(audio_data)
    except Exception:
        transcript = ""

    md_content = f"# Audio Intelligence Report\n\n"
    md_content += f"**File Name:** {file_name}\n"
    md_content += f"**Format:** {ext.upper().replace('.', '')}\n"
    md_content += f"**Size:** {metadata['file_size_mb']} MB\n"
    if "duration_seconds" in metadata:
        md_content += f"**Duration:** {metadata['duration_seconds']} seconds\n"
    if "channels" in metadata:
        md_content += f"**Channels:** {metadata['channels']}\n"
    if "sample_rate_hz" in metadata:
        md_content += f"**Sample Rate:** {metadata['sample_rate_hz']} Hz\n"
    md_content += "\n---\n\n"

    if transcript:
        md_content += f"## Audio Transcription\n\n{transcript}\n"
    else:
        md_content += f"## Audio Asset Overview\n\nThis audio file is cataloged in the DAM workspace. Its metadata, technical properties, and filename are indexed for semantic search and retrieval.\n"

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    return {
        "output_path": out_path,
        "input_tokens": 0,
        "output_tokens": 0,
        "cost": 0.0
    }
