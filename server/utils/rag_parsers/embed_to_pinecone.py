"""Chunk Markdown, extract structured metadata, create hosted Pinecone embeddings, and upsert them."""

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

def extract_document_metadata(text: str) -> dict:
    """Extract top-level executive summary, themes, entities, and audio transcript from parsed markdown."""
    meta = {
        "executive_summary": None,
        "primary_themes": [],
        "entities": [],
        "audio_transcript": None,
        "page_count": None,
        "slide_count": None,
        "scene_count": None,
    }

    # 1. Executive / Overall Summary
    sum_match = re.search(
        r"##\s+(?:1\.\s*)?(?:Executive\s+Summary|Overall\s+(?:Video\s+|Presentation\s+)?Summary)\s*\n+([\s\S]*?)(?=\n##|\n---|$)",
        text, re.IGNORECASE
    )
    if sum_match:
        meta["executive_summary"] = sum_match.group(1).strip()

    # 2. Primary Themes
    theme_match = re.search(r"\*\*Primary Themes:\*\*\s*([^\n]+)", text)
    if theme_match:
        themes = [t.strip() for t in theme_match.group(1).split(",") if t.strip()]
        meta["primary_themes"] = themes

    # 3. Overall Entities
    entity_matches = re.findall(r"\*\*Entities(?:/Metrics)?:\*\*\s*([^\n]+)", text)
    entities = set()
    for em in entity_matches:
        for item in em.split(","):
            cleaned = item.strip().strip('"').strip("'")
            if cleaned and len(cleaned) < 80:
                entities.add(cleaned)
    meta["entities"] = sorted(list(entities))[:30]

    # 4. Audio Transcript
    audio_match = re.search(r"##\s+Audio Transcript\s*\n+([\s\S]*?)(?=\n##|\n---|$)", text, re.IGNORECASE)
    if audio_match:
        meta["audio_transcript"] = audio_match.group(1).strip()

    # 5. Counts from headers
    pages = re.findall(r"###\s+Page\s+(\d+)", text)
    if pages:
        meta["page_count"] = max(map(int, pages))
    slides = re.findall(r"###\s+Slide\s+(\d+)", text)
    if slides:
        meta["slide_count"] = max(map(int, slides))
    scenes = re.findall(r"###\s+Scene\s+(\d+)", text)
    if scenes:
        meta["scene_count"] = max(map(int, scenes))

    return meta

def chunk_text(text: str, chunk_words: int = 350, overlap_words: int = 70):
    """
    Section-aware and offset-tracking chunker.
    Keeps track of:
      - char_start, char_end (exact character offsets in source)
      - token_count (estimated tokens)
      - page_or_slide_num (attribution to page/slide)
      - scene_start_sec, scene_end_sec (video timestamps)
      - theme & entities local to the section
    """
    # Identify major section boundaries (### Page/Slide/Scene or ## Section)
    section_pattern = re.compile(r"(?=(?:\n|^)###?\s+(?:Page|Slide|Scene|Section|\d+\.))")
    raw_sections = section_pattern.split(text)

    chunks = []
    current_char_offset = 0

    for sec in raw_sections:
        if not sec.strip():
            continue

        sec_start_pos = text.find(sec, current_char_offset)
        if sec_start_pos == -1:
            sec_start_pos = current_char_offset
        current_char_offset = sec_start_pos + len(sec)

        # Extract section metadata
        page_or_slide = None
        ps_match = re.search(r"###?\s+(?:Page|Slide)\s+(\d+)", sec, re.IGNORECASE)
        if ps_match:
            page_or_slide = int(ps_match.group(1))

        scene_start, scene_end = None, None
        scene_match = re.search(r"###?\s+Scene\s+\d+\s*\(([\d.]+)s?\s*-\s*([\d.]+)s?\)", sec, re.IGNORECASE)
        if scene_match:
            scene_start = float(scene_match.group(1))
            scene_end = float(scene_match.group(2))

        local_theme = None
        theme_m = re.search(r"\*\*Theme:\*\*\s*([^\n]+)", sec)
        if theme_m:
            local_theme = theme_m.group(1).strip()

        local_entities = []
        ent_m = re.search(r"\*\*Entities(?:/Metrics)?:\*\*\s*([^\n]+)", sec)
        if ent_m:
            local_entities = [e.strip() for e in ent_m.group(1).split(",") if e.strip()][:10]

        words = re.findall(r"\S+", sec)
        if not words:
            continue

        # If section fits within chunk limit, keep as single chunk
        if len(words) <= (chunk_words + 50):
            chunk_str = sec.strip()
            c_start = text.find(chunk_str, sec_start_pos)
            if c_start == -1:
                c_start = sec_start_pos
            c_end = c_start + len(chunk_str)
            chunks.append({
                "index": len(chunks),
                "text": chunk_str,
                "token_count": int(len(words) * 1.3),
                "char_start": c_start,
                "char_end": c_end,
                "page_or_slide_num": page_or_slide,
                "scene_start_sec": scene_start,
                "scene_end_sec": scene_end,
                "theme": local_theme,
                "entities": local_entities,
            })
        else:
            # Sub-chunk with overlap
            w_idx = 0
            while w_idx < len(words):
                w_end = min(w_idx + chunk_words, len(words))
                sub_text = " ".join(words[w_idx:w_end])
                c_start = text.find(sub_text[:50], sec_start_pos) if len(sub_text) >= 50 else sec_start_pos
                if c_start == -1:
                    c_start = sec_start_pos
                c_end = c_start + len(sub_text)

                chunks.append({
                    "index": len(chunks),
                    "text": sub_text,
                    "token_count": int((w_end - w_idx) * 1.3),
                    "char_start": c_start,
                    "char_end": c_end,
                    "page_or_slide_num": page_or_slide,
                    "scene_start_sec": scene_start,
                    "scene_end_sec": scene_end,
                    "theme": local_theme,
                    "entities": local_entities,
                })
                if w_end >= len(words):
                    break
                w_idx = w_end - overlap_words

    # Fallback if no structured sections were split
    if not chunks:
        words = re.findall(r"\S+", text)
        start = 0
        while start < len(words):
            end = min(start + chunk_words, len(words))
            sub_text = " ".join(words[start:end])
            c_start = text.find(sub_text[:40]) if len(sub_text) >= 40 else 0
            if c_start == -1:
                c_start = 0
            chunks.append({
                "index": len(chunks),
                "text": sub_text,
                "token_count": int((end - start) * 1.3),
                "char_start": c_start,
                "char_end": c_start + len(sub_text),
                "page_or_slide_num": None,
                "scene_start_sec": None,
                "scene_end_sec": None,
                "theme": None,
                "entities": [],
            })
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

def embed_markdown(md_path, file_id, file_name, media_type, client, org_id, user_id, user_role, department_id="global", file_path=None):
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
        content = source.read()

    doc_meta = extract_document_metadata(content)
    chunks = chunk_text(content)
    if not chunks:
        raise RuntimeError("The parsed document contains no text to index")

    embed_chunks(chunks, api_key)

    total_chunks = len(chunks)
    vectors = []
    for chunk in chunks:
        vec_meta = {
            "file_id": str(file_id),
            "file_name": str(file_name),
            "media_type": str(media_type),
            "client": str(client or "Unknown"),
            "organization_id": str(org_id),
            "department_id": str(department_id or "global"),
            "chunk_index": int(chunk["index"]),
            "total_chunks": int(total_chunks),
            "token_count": int(chunk.get("token_count", 0)),
            "char_start": int(chunk.get("char_start", 0)),
            "char_end": int(chunk.get("char_end", 0)),
            "text": chunk["text"],
        }
        if file_path:
            vec_meta["file_path"] = str(file_path)
        if chunk.get("page_or_slide_num") is not None:
            vec_meta["page_or_slide_num"] = int(chunk["page_or_slide_num"])
        if chunk.get("scene_start_sec") is not None:
            vec_meta["scene_start_sec"] = float(chunk["scene_start_sec"])
        if chunk.get("scene_end_sec") is not None:
            vec_meta["scene_end_sec"] = float(chunk["scene_end_sec"])
        if chunk.get("theme"):
            vec_meta["theme"] = str(chunk["theme"])
        if chunk.get("entities"):
            vec_meta["entities"] = chunk["entities"][:15]

        vectors.append({
            "id": f"{file_id}_chunk-{chunk['index']}",
            "values": chunk["embedding"],
            "metadata": vec_meta,
        })

    print(json.dumps({"type": "progress", "text": "Uploading vectors to Pinecone...\n"}), flush=True)
    for start in range(0, len(vectors), 100):
        _post_json(f"{index_host}/vectors/upsert", {
            "vectors": vectors[start:start + 100], "namespace": org_id,
        }, api_key)
    print(json.dumps({"type": "progress", "text": f"Indexed {len(vectors)} chunks.\n"}), flush=True)

    result = {
        "success": True,
        "chunks": total_chunks,
        "total_chunks": total_chunks,
        "executive_summary": doc_meta.get("executive_summary"),
        "primary_themes": doc_meta.get("primary_themes", []),
        "entities": doc_meta.get("entities", []),
        "audio_transcript": doc_meta.get("audio_transcript"),
        "page_count": doc_meta.get("page_count"),
        "slide_count": doc_meta.get("slide_count"),
        "scene_count": doc_meta.get("scene_count"),
    }
    return result

def main():
    if len(sys.argv) < 9:
        print(json.dumps({"error": "Missing arguments"}))
        sys.exit(1)
    try:
        res = embed_markdown(*sys.argv[1:])
        print(json.dumps(res), flush=True)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
