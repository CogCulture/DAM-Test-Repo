"""
run_batch_pipeline.py
Processes a batch of files in a single Python process.
Batches all Pinecone embeddings at the end to minimize API round-trips and cost.

Usage:
  python run_batch_pipeline.py <json_manifest_path>

Manifest JSON format (written by the Node.js server):
[
  {
    "file_path": "/abs/path/to/file.pdf",
    "file_id":   "01J...",
    "file_name":  "report.pdf",
    "ext":        ".pdf",
    "org_id":     "org_acme",
    "user_id":    "usr_123",
    "user_role":  "admin",
    "dept_id":    "dept_marketing"
  },
  ...
]

Each processed file emits SSE-style JSON lines to stdout:
  {"type": "file_start",    "index": 0, "total": 5, "file_id": "...", "file_name": "..."}
  {"type": "file_progress", "index": 0, "text": "..."}
  {"type": "file_done",     "index": 0, "file_id": "...", "cost": 0.0012, "chunks": 7}
  {"type": "file_skip",     "index": 0, "file_id": "...", "reason": "already indexed"}
  {"type": "file_error",    "index": 0, "file_id": "...", "error": "..."}
  {"type": "batch_embed",   "total_chunks": 142, "message": "Embedding all chunks together..."}
  {"type": "batch_upsert",  "total_vectors": 142}
  {"type": "summary",       "total_cost": 0.0087, "processed": 4, "skipped": 1, "failed": 0}
"""

import sys
import os
import json
import time

RAGPUSH_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, RAGPUSH_DIR)


def emit(obj: dict):
    """Print a JSON line to stdout immediately (SSE-friendly)."""
    print(json.dumps(obj), flush=True)


def parse_file_to_md(file_path: str, ext: str, index: int, total: int, file_name: str) -> tuple[str | None, float]:
    """
    Run the appropriate parser for this file type and return (md_text, cost).
    Returns (None, 0.0) on failure — caller handles the error event.
    """
    try:
        from processor import route_file
        result = route_file(file_path, ext)
        md_path = result.get("output_path")
        cost = result.get("cost", 0.0) or 0.0

        if not md_path or not os.path.exists(md_path):
            return None, 0.0

        with open(md_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
        return text, cost

    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None, 0.0


def chunk_text(text: str, chunk_words: int = 350, overlap_words: int = 70) -> list[dict]:
    import re
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


def batch_embed(all_texts: list[str], api_key: str) -> list[list[float]]:
    """
    Embed all texts in batches of 96 using Pinecone's hosted embedding endpoint.
    Returns a flat list of embedding vectors in the same order as all_texts.
    """
    from urllib import request, error as url_error
    import json as _json

    API_VERSION = "2025-04"
    EMBED_MODEL = os.environ.get("PINECONE_EMBED_MODEL", "llama-text-embed-v2")
    EMBED_DIMENSION = 768
    BATCH_SIZE = 96

    all_embeddings: list[list[float]] = []
    total_batches = (len(all_texts) + BATCH_SIZE - 1) // BATCH_SIZE

    emit({"type": "batch_embed", "total_chunks": len(all_texts),
          "message": f"Embedding {len(all_texts)} chunks in {total_batches} batch(es) with Pinecone..."})

    for start in range(0, len(all_texts), BATCH_SIZE):
        batch = all_texts[start: start + BATCH_SIZE]
        payload = _json.dumps({
            "model": EMBED_MODEL,
            "parameters": {"input_type": "passage", "truncate": "END", "dimension": EMBED_DIMENSION},
            "inputs": [{"text": t} for t in batch],
        }).encode("utf-8")

        req = request.Request(
            "https://api.pinecone.io/embed",
            data=payload,
            headers={
                "Api-Key": api_key,
                "Content-Type": "application/json",
                "X-Pinecone-Api-Version": API_VERSION,
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=120) as resp:
                result = _json.loads(resp.read().decode("utf-8"))
        except url_error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Pinecone embed failed ({exc.code}): {detail}") from exc

        vectors = result.get("data", [])
        if len(vectors) != len(batch):
            raise RuntimeError(f"Pinecone returned {len(vectors)} embeddings for {len(batch)} inputs")
        all_embeddings.extend(v["values"] for v in vectors)

    return all_embeddings


def batch_upsert(vectors: list[dict], api_key: str, index_host: str, namespace: str):
    """Upsert all vectors in batches of 100."""
    from urllib import request, error as url_error
    import json as _json

    API_VERSION = "2025-04"
    UPSERT_BATCH = 100

    if not index_host.startswith(("http://", "https://")):
        index_host = f"https://{index_host}"
    index_host = index_host.rstrip("/")

    emit({"type": "batch_upsert", "total_vectors": len(vectors),
          "message": f"Upserting {len(vectors)} vectors to Pinecone namespace '{namespace}'..."})

    for start in range(0, len(vectors), UPSERT_BATCH):
        batch = vectors[start: start + UPSERT_BATCH]
        payload = _json.dumps({"vectors": batch, "namespace": namespace}).encode("utf-8")
        req = request.Request(
            f"{index_host}/vectors/upsert",
            data=payload,
            headers={
                "Api-Key": api_key,
                "Content-Type": "application/json",
                "X-Pinecone-Api-Version": API_VERSION,
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=120) as resp:
                resp.read()
        except url_error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Pinecone upsert failed ({exc.code}): {detail}") from exc


def main():
    if len(sys.argv) < 2:
        emit({"error": "Missing manifest path argument"})
        sys.exit(1)

    manifest_path = sys.argv[1]
    if not os.path.exists(manifest_path):
        emit({"error": f"Manifest file not found: {manifest_path}"})
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest: list[dict] = json.load(f)

    if not manifest:
        emit({"error": "Empty manifest — no files to process"})
        sys.exit(1)

    pinecone_key = os.environ.get("PINECONE_API_KEY", "")
    pinecone_host = os.environ.get("PINECONE_INDEX_HOST", "").strip().rstrip("/")

    if not pinecone_key:
        emit({"error": "PINECONE_API_KEY is required"})
        sys.exit(1)
    if not pinecone_host:
        emit({"error": "PINECONE_INDEX_HOST is required"})
        sys.exit(1)

    total = len(manifest)
    # ── Phase 1: Parse each file and collect chunks ───────────────────────────
    # Structure: per_file_chunks[i] = list of {"text": "...", "meta": {...}}
    per_file_result: list[dict] = []  # {file_id, file_name, org_id, dept_id, user_id, user_role, chunks, cost, error}
    all_texts: list[str] = []         # flat list for batch embed

    for index, item in enumerate(manifest):
        file_id = item["file_id"]
        file_name = item.get("file_name", file_id)
        file_path = item["file_path"]
        ext = item.get("ext", "").lower()
        org_id = item.get("org_id", "org_default")
        user_id = item.get("user_id", "system")
        user_role = item.get("user_role", "user")
        dept_id = item.get("dept_id", "global")

        emit({"type": "file_start", "index": index, "total": total,
              "file_id": file_id, "file_name": file_name})

        if not os.path.exists(file_path):
            emit({"type": "file_error", "index": index, "file_id": file_id,
                  "error": f"File not found on disk: {file_path}"})
            per_file_result.append({"file_id": file_id, "error": "File not found"})
            continue

        emit({"type": "file_progress", "index": index,
              "text": f"Parsing {file_name} ({ext})..."})

        md_text, parse_cost = parse_file_to_md(file_path, ext, index, total, file_name)
        if md_text is None:
            emit({"type": "file_error", "index": index, "file_id": file_id,
                  "error": "Parser returned no text"})
            per_file_result.append({"file_id": file_id, "error": "Parse failed"})
            continue

        chunks = chunk_text(md_text)
        if not chunks:
            emit({"type": "file_error", "index": index, "file_id": file_id,
                  "error": "Document contained no indexable text after parsing"})
            per_file_result.append({"file_id": file_id, "error": "No text"})
            continue

        emit({"type": "file_progress", "index": index,
              "text": f"Parsed {file_name} → {len(chunks)} chunks (cost: ${parse_cost:.4f})"})

        # Record the starting offset of this file's chunks in the flat list
        start_offset = len(all_texts)
        all_texts.extend(c["text"] for c in chunks)

        per_file_result.append({
            "file_id":   file_id,
            "file_name": file_name,
            "org_id":    org_id,
            "dept_id":   dept_id,
            "user_id":   user_id,
            "user_role": user_role,
            "chunks":    chunks,
            "cost":      parse_cost,
            "start_offset": start_offset,
            "error":     None,
        })

    # ── Phase 2: Single batch embed for ALL chunks ────────────────────────────
    successful = [r for r in per_file_result if not r.get("error")]

    if not all_texts:
        emit({"type": "summary", "total_cost": 0.0, "processed": 0,
              "skipped": 0, "failed": len(per_file_result), "error": "No text to embed"})
        sys.exit(1)

    try:
        all_embeddings = batch_embed(all_texts, pinecone_key)
    except Exception as exc:
        emit({"type": "fatal", "error": f"Batch embedding failed: {exc}"})
        sys.exit(1)

    # ── Phase 3: Build Pinecone vectors using file-level offsets ──────────────
    pinecone_vectors: list[dict] = []
    total_cost = 0.0

    for result in successful:
        chunks = result["chunks"]
        offset = result["start_offset"]
        file_id = result["file_id"]
        org_id = result["org_id"]

        for i, chunk in enumerate(chunks):
            embedding = all_embeddings[offset + i]
            pinecone_vectors.append({
                "id": f"{file_id}_chunk-{chunk['index']}",
                "values": embedding,
                "metadata": {
                    "file_name":      result["file_name"],
                    "text":           chunk["text"],
                    "chunk_index":    chunk["index"],
                    "user_id":        result["user_id"],
                    "user_role":      result["user_role"],
                    "organization_id": org_id,
                    "department_id":  result["dept_id"],
                },
            })
        total_cost += result.get("cost", 0.0)

    # ── Phase 4: Single batch upsert ─────────────────────────────────────────
    # All files share the same org namespace for upsert
    # (Grouped by org_id; for multi-org batches, upsert per-namespace)
    from collections import defaultdict
    vectors_by_namespace: dict[str, list[dict]] = defaultdict(list)
    for vec in pinecone_vectors:
        ns = vec["metadata"].get("organization_id", "org_default")
        vectors_by_namespace[ns].append(vec)

    try:
        for namespace, ns_vectors in vectors_by_namespace.items():
            batch_upsert(ns_vectors, pinecone_key, pinecone_host, namespace)
    except Exception as exc:
        emit({"type": "fatal", "error": f"Batch upsert failed: {exc}"})
        sys.exit(1)

    # ── Phase 5: Emit per-file completion signals (for Node.js DB updates) ───
    for result in successful:
        emit({
            "type":    "file_done",
            "file_id": result["file_id"],
            "cost":    result.get("cost", 0.0),
            "chunks":  len(result["chunks"]),
        })

    failed_count = sum(1 for r in per_file_result if r.get("error"))

    emit({
        "type":        "summary",
        "total_cost":  round(total_cost, 6),
        "total_chunks": len(pinecone_vectors),
        "processed":   len(successful),
        "failed":      failed_count,
    })

    sys.exit(0)


if __name__ == "__main__":
    main()
