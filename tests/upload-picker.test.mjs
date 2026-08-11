import assert from "node:assert/strict";
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
