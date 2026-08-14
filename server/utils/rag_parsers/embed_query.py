"""Generate a 768-dimensional query embedding with Pinecone hosted inference."""

import json
import os
import sys
from urllib import error, request

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No query provided"}))
        sys.exit(1)
    api_key = os.environ.get("PINECONE_API_KEY")
    if not api_key:
        print(json.dumps({"error": "PINECONE_API_KEY is required"}))
        sys.exit(1)
    payload = {
        "model": os.environ.get("PINECONE_EMBED_MODEL", "llama-text-embed-v2"),
        "parameters": {"input_type": "query", "truncate": "END", "dimension": 768},
        "inputs": [{"text": sys.argv[1]}],
    }
    req = request.Request("https://api.pinecone.io/embed",
        data=json.dumps(payload).encode("utf-8"), headers={
            "Api-Key": api_key, "Content-Type": "application/json",
            "X-Pinecone-Api-Version": "2025-04",
        }, method="POST")
    try:
        with request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
        print(json.dumps(result["data"][0]["values"]))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(json.dumps({"error": f"Pinecone request failed ({exc.code}): {detail}"}))
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
