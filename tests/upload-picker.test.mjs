import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveUploadPickerMode } from "../shared/utils/upload-picker.ts";

test("a folder uploader opens the directory picker by default", () => {
  assert.equal(resolveUploadPickerMode("folder"), "folder");
});

test("the upload picker defaults invalid or missing modes to files", () => {
  assert.equal(resolveUploadPickerMode("files"), "files");
  assert.equal(resolveUploadPickerMode(undefined), "files");
  assert.equal(resolveUploadPickerMode("unexpected"), "files");
});

test("the main workspace upload area exposes a folder picker", async () => {
  const source = await readFile(
    new URL("../app/components/DropFiles.vue", import.meta.url),
    "utf8",
  );

  assert.match(source, /webkitdirectory/);
  assert.match(source, />\s*Upload folder\s*</);
  assert.match(source, /@click="handleFolderClick"/);
  assert.match(source, /@change="handleFileSelect"/);
});
