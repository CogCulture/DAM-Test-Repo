"""
run_pipeline.py
Wraps processor.py (to generate MD) and then calls embed_to_pinecone.py.

Usage:
  python run_pipeline.py <file_path> <file_id> <file_name> <media_type> <client> <org_id> <user_id> <user_role>
"""

import sys
import os
import json

def main():
    if len(sys.argv) < 9:
        print(json.dumps({"error": "Missing arguments to run_pipeline.py"}))
        sys.exit(1)
        
    file_path = sys.argv[1]
    
    # 1. Run processor
    try:
        from processor import route_file
        result = route_file(file_path, sys.argv[4])
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": f"Processor failed: {str(e)}"}))
        sys.exit(1)
        
    md_path = result.get("output_path")
    if not md_path or not os.path.exists(md_path):
        print(json.dumps({"error": "Processor did not generate an MD file"}))
        sys.exit(1)
        
    # 2. Embed and upload without putting credentials in process arguments.
    try:
        print(json.dumps({"type": "stage", "stage": "embedding", "message": "Embedding document for RAG search..."}), flush=True)
        from embed_to_pinecone import embed_markdown
        embed_markdown(md_path, *sys.argv[2:])
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": f"Embedding step failed: {str(e)}"}))
        sys.exit(1)
        
    # Print the final result from the processor so the Node.js server gets the cost and output_path
    print(json.dumps(result))
    sys.exit(0)

if __name__ == "__main__":
    main()
