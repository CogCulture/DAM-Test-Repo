import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requirements = await readFile(
  new URL("../server/utils/rag_parsers/requirements.txt", import.meta.url),
  "utf8",
);
const processor = await readFile(
  new URL("../server/utils/rag_parsers/processor.py", import.meta.url),
  "utf8",
);

test("RAG requirements declare python-docx", () => {
  assert.match(requirements, /^python-docx(?:[<>=].*)?$/mu);
});

test("DOCX routing reports its missing dependency clearly", () => {
  assert.match(processor, /DOCX RAG dependency/u);
  assert.match(processor, /python-docx/u);
  assert.match(processor, /requirements\.txt/u);
});
