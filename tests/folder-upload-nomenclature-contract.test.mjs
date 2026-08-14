import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("both upload endpoints validate relative folder paths server-side", async () => {
  const [localUpload, driveUpload] = await Promise.all([
    readSource("../server/api/files/[bucket]/local-upload.post.ts"),
    readSource("../server/api/gdrive/upload.post.ts"),
  ]);
  assert.match(localUpload, /requireValidFolderPath/u);
  assert.match(driveUpload, /requireValidFolderPath/u);
});

test("the folder preflight endpoint validates all paths before upload", async () => {
  const source = await readSource("../server/api/nomenclature/folder-upload-preflight.post.ts");
  assert.match(source, /requireValidFolderPaths/u);
  assert.match(source, /paths/u);
});

test("normal and guided upload flows run folder preflight before uploading bytes", async () => {
  const [upload, guidedUpload] = await Promise.all([
    readSource("../app/components/Upload.vue"),
    readSource("../app/components/NomenclatureUploadModal.vue"),
  ]);
  for (const source of [upload, guidedUpload]) {
    assert.match(source, /getUploadDirectoryPaths/u);
    assert.match(source, /folder-upload-preflight/u);
  }
});
