import os
import sys
import argparse
import base64
import json
from anthropic import Anthropic
def _encode_image_b64(image_path: str, max_dim: int = 768) -> tuple[str, str]:
    import io
    import logging
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

from llm_client import call_llm_with_fallback

def process_image_single(image_path: str, anthropic_key: str, model: str) -> dict:
    b64, m_type = _encode_image_b64(image_path, max_dim=768)

    resp = call_llm_with_fallback(
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": m_type, "data": b64}},
            {"type": "text", "text": "Describe and analyze this image in detail. Extract all visible text, data, and visual insights."}
        ]}],
        model=model,
        max_tokens=2048,
        anthropic_key=anthropic_key,
        openai_model="gpt-4o"
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
