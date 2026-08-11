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
    """Sends text and images to Claude Vision API for insights."""
    print(f"Sending data to Anthropic API ({model})...")
    client = Anthropic(api_key=api_key)
    
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
        requests_list = [
            {
                "custom_id": "docx_request_1",
                "params": {
                    "model": model,
                    "max_tokens": 4096,
                    "messages": [
                        {"role": "user", "content": content}
                    ]
                }
            }
        ]
        
        print(f"Submitting Batch API request (50% cost discount)...")
        # Note: Using .beta.messages.batches based on typical older SDK versions, 
        # may need to be .messages.batches in newer SDKs
        try:
            batch = client.beta.messages.batches.create(requests=requests_list)
        except AttributeError:
            batch = client.messages.batches.create(requests=requests_list)
            
        print(f"Batch Task ID: {batch.id}. Polling for completion...")
        
        import time
        while True:
            try:
                b_status = client.beta.messages.batches.retrieve(batch.id)
            except AttributeError:
                b_status = client.messages.batches.retrieve(batch.id)
                
            status = b_status.processing_status
            if status in ["ended", "canceled", "expired"]:
                break
            print(f"Status: {status}... (waiting 15s)")
            time.sleep(15)
            
        if status != "ended":
            print(f"Batch ended with non-success status: {status}")
            return None
            
        print("Batch complete. Downloading results...")
        
        try:
            results_iter = client.beta.messages.batches.results(batch.id)
        except AttributeError:
            results_iter = client.messages.batches.results(batch.id)
            
        for result in results_iter:
            if result.result.type == "succeeded":
                message = result.result.message
                
                # Calculate cost (Claude 3.5 Sonnet Batch pricing)
                in_tokens = message.usage.input_tokens
                out_tokens = message.usage.output_tokens
                # Standard: $3 / 1M in, $15 / 1M out
                # Batch: $1.50 / 1M in, $7.50 / 1M out
                cost = (in_tokens * 1.5 + out_tokens * 7.5) / 1_000_000
                
                print(f"\n--- Cost Breakdown (Claude 3.5 Sonnet Batch) ---")
                print(f"Input Tokens: {in_tokens}")
                print(f"Output Tokens: {out_tokens}")
                print(f"Total Cost: ${cost:.5f}")
                print(f"------------------------------------------------\n")
                
                return message.content[0].text
            else:
                print(f"Batch request failed: {result.result}")
                return None
                
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
        
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is required")
        
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
