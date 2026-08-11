import os
import sys
import argparse
import base64
import json
import cv2
from anthropic import Anthropic

def process_image_single(image_path: str, anthropic_key: str, model: str) -> dict:
    client = Anthropic(api_key=anthropic_key)
    
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
        model=model,
        max_tokens=2048,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": m_type, "data": b64}},
            {"type": "text", "text": "Describe and analyze this image in detail. Extract all visible text, data, and visual insights."}
        ]}]
    )
    
    out_dir = os.path.dirname(os.path.abspath(image_path))
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    out_path = os.path.join(out_dir, f"{base_name}_anthropic_parsed.md")
    
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Image Analysis\n\n{resp.content[0].text}")
        
    in_tokens = resp.usage.input_tokens
    out_tokens = resp.usage.output_tokens
    cost = (in_tokens * 3.0 + out_tokens * 15.0) / 1_000_000
    
    return {
        "output_path": out_path, 
        "input_tokens": in_tokens, 
        "output_tokens": out_tokens, 
        "cost": cost
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parse image using Anthropic Claude Vision")
    parser.add_argument("image_path", help="Path to the image file")
    parser.add_argument("--anthropic-key", type=str, help="API Key for Anthropic")
    parser.add_argument("--model", type=str, default="claude-sonnet-4-6", help="Claude model name")
    
    args = parser.parse_args()

    api_key = args.anthropic_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[ERROR] No Anthropic API key found.")
        sys.exit(1)

    try:
        res = process_image_single(
            image_path=args.image_path,
            anthropic_key=api_key,
            model=args.model
        )
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
