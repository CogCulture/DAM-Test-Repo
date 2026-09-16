"""Chunk Markdown, create hosted Pinecone embeddings, and upsert them."""

import json
import os
import re
import sys
from urllib import error, request

API_VERSION = "2025-04"
EMBED_MODEL = os.environ.get("PINECONE_EMBED_MODEL", "llama-text-embed-v2")
EMBED_DIMENSION = 768

def _post_json(url, payload, api_key):
    req = request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={
        "Api-Key": api_key, "Content-Type": "application/json",
        "X-Pinecone-Api-Version": API_VERSION,
    }, method="POST")
    try:
        with request.urlopen(req, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Pinecone request failed ({exc.code}): {detail}") from exc

def chunk_text(text, chunk_words=350, overlap_words=70):
    words = re.findall(r"\S+", text)
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + chunk_words, len(words))
        chunks.append({"index": len(chunks), "text": " ".join(words[start:end])})
        if end >= len(words):
            break
        start = end - overlap_words
    return chunks

def embed_chunks(chunks, api_key):
    if not chunks:
        return chunks
    print(json.dumps({"type": "progress", "text": f"Embedding {len(chunks)} chunks with Pinecone...\n"}), flush=True)
    for start in range(0, len(chunks), 96):
        batch = chunks[start:start + 96]
        result = _post_json("https://api.pinecone.io/embed", {
            "model": EMBED_MODEL,
            "parameters": {"input_type": "passage", "truncate": "END", "dimension": EMBED_DIMENSION},
            "inputs": [{"text": chunk["text"]} for chunk in batch],
        }, api_key)
        vectors = result.get("data", [])
        if len(vectors) != len(batch):
            raise RuntimeError("Pinecone returned an unexpected number of embeddings")
        for chunk, vector in zip(batch, vectors):
            chunk["embedding"] = vector["values"]
    return chunks

def embed_markdown(md_path, file_id, file_name, media_type, client, org_id, user_id, user_role, department_id="global"):
    api_key = os.environ.get("PINECONE_API_KEY")
    index_host = os.environ.get("PINECONE_INDEX_HOST", "").strip().rstrip("/")
    if not api_key:
        raise RuntimeError("PINECONE_API_KEY is required")
    if not index_host:
        raise RuntimeError("PINECONE_INDEX_HOST is required")
    if not index_host.startswith(("http://", "https://")):
        index_host = f"https://{index_host}"
    if not os.path.exists(md_path):
        raise FileNotFoundError(f"Markdown file not found: {md_path}")

    with open(md_path, "r", encoding="utf-8") as source:
        chunks = chunk_text(source.read())
    if not chunks:
        raise RuntimeError("The parsed document contains no text to index")
    embed_chunks(chunks, api_key)

    vectors = [{
        "id": f"{file_id}_chunk-{chunk['index']}",
        "values": chunk["embedding"],
        "metadata": {
            "file_name": file_name, "media_type": media_type, "client": client,
            "text": chunk["text"], "chunk_index": chunk["index"],
            "user_id": user_id, "user_role": user_role, "organization_id": org_id,
            "department_id": department_id or "global",
        },
    } for chunk in chunks]

    print(json.dumps({"type": "progress", "text": "Uploading vectors to Pinecone...\n"}), flush=True)
    for start in range(0, len(vectors), 100):
        _post_json(f"{index_host}/vectors/upsert", {
            "vectors": vectors[start:start + 100], "namespace": org_id,
        }, api_key)
    print(json.dumps({"type": "progress", "text": f"Indexed {len(vectors)} chunks.\n"}), flush=True)
    result = {"success": True, "chunks": len(vectors)}
    print(json.dumps(result), flush=True)
    return result

def main():
    if len(sys.argv) < 9:
        print(json.dumps({"error": "Missing arguments"}))
        sys.exit(1)
    try:
        embed_markdown(*sys.argv[1:])
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
