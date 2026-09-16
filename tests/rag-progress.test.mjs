import assert from "node:assert/strict";
import test from "node:test";

import { resolveRagProgressMessage } from "../shared/utils/rag-progress.ts";

test("RAG stage records show their human-readable message", () => {
  assert.equal(resolveRagProgressMessage(
    '{"type":"stage","stage":"embedding","message":"Embedding document for RAG search..."}\n',
  ), "Embedding document for RAG search...");
});

test("plain parser output still displays its last non-empty line", () => {
  assert.equal(resolveRagProgressMessage("Loading\nParsed 4 pages\n"), "Parsed 4 pages");
});
