import os
import argparse
import base64
import mimetypes
import zipfile
import docx
from anthropic import Anthropic

def extract_text_from_docx(docx_path):
    """Extracts all text natively from the docx file."""
    print("Extracting text from document...")
    try:
        doc = docx.Document(docx_path)
        text_content = []
        for para in doc.paragraphs:
            if para.text.strip():
                text_content.append(para.text.strip())
        
        # Extract table text as well
        for table in doc.tables:
            for row in table.rows:
                row_data = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_data:
                    text_content.append(" | ".join(row_data))
                    
        return "\n".join(text_content)
    except Exception as e:
        print(f"Error extracting text: {e}")
        return ""

def extract_images_from_docx(docx_path):
    """Extracts all images from the docx ZIP structure."""
    print("Extracting images from document...")
    images = []
    try:
        with zipfile.ZipFile(docx_path, 'r') as docx_zip:
            for info in docx_zip.infolist():
                if info.filename.startswith('word/media/'):
                    image_bytes = docx_zip.read(info.filename)
                    # Get filename and guess mime type
                    filename = os.path.basename(info.filename)
                    mime_type, _ = mimetypes.guess_type(filename)
                    
                    if not mime_type:
                        # Default fallback
                        mime_type = "image/jpeg"
                        
                    images.append({
                        "filename": filename,
                        "mime_type": mime_type,
                        "bytes": image_bytes
                    })
    except Exception as e:
        print(f"Error extracting images: {e}")
        
    print(f"Found {len(images)} images.")
    return images

def analyze_with_claude(text_content, images, api_key, model):
    """Sends text and images to Claude Vision API (or ChatGPT fallback) for insights."""
    from llm_client import call_llm_with_fallback
    
    content = []
    
    # 1. Add the extracted text
    if text_content:
        content.append({
            "type": "text",
            "text": f"Here is the text extracted from the document:\n\n{text_content}\n\n---"
        })
    
    # 2. Add all extracted images (Base64 encoded)
    for img in images:
        b64_encoded = base64.b64encode(img["bytes"]).decode("utf-8")
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img["mime_type"],
                "data": b64_encoded
            }
        })
        
    # 3. Add the prompt
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
    
    try:
        resp = call_llm_with_fallback(
            messages=[{"role": "user", "content": content}],
            model=model,
            max_tokens=4096,
            anthropic_key=api_key,
            openai_model="gpt-4o"
        )
        return resp.content[0].text
    except Exception as e:
        print(f"API Error: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Extract insights from a DOCX file using Anthropic Claude.")
    parser.add_argument("docx_path", help="Path to the .docx file")
    parser.add_argument("--model", default="claude-sonnet-4-6", help="Anthropic model to use")
    args = parser.parse_args()
    
    docx_path = args.docx_path
    
    if not os.path.exists(docx_path):
        print(f"Error: File '{docx_path}' not found.")
        return
        
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY or OPENAI_API_KEY is required")
        
    # Step 1: Extract Text
    text_content = extract_text_from_docx(docx_path)
    
    # Step 2: Extract Images
    images = extract_images_from_docx(docx_path)
    
    # Step 3: Send to Claude
    insights = analyze_with_claude(text_content, images, api_key, args.model)
    
    if insights:
        # Step 4: Save Output
        output_path = os.path.splitext(docx_path)[0] + "_parsed.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(insights)
        print(f"\nSuccess! Insights saved to {output_path}")

if __name__ == "__main__":
    main()
