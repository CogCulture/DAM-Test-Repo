import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const preview = await readFile(new URL("../app/components/FilePreview.vue", import.meta.url), "utf8");
const files = await readFile(new URL("../app/components/App/Files.vue", import.meta.url), "utf8");

test("the document preview is a floating layer above workspace overlays", () => {
  assert.match(preview, /z-\[10000\]/u);
  assert.match(preview, /z-\[10001\]/u);
  assert.match(preview, /max-w-\[min\(92rem,92vw\)\]/u);
  assert.doesNotMatch(preview, /<UModal[^>]*\sfullscreen/u);
});

test("opening a preview closes the competing asset-actions layer", () => {
  assert.match(files, /closeActions\(\);\s*showPreview\(safeFiles\.value, index\)/u);
});
