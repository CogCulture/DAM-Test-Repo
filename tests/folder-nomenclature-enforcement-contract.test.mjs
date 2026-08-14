import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

const endpoints = [
  "../server/api/folder/[bucket]/[id].post.ts",
  "../server/api/gdrive/folder/create.post.ts",
  "../server/api/folder-requests/index.post.ts",
  "../server/api/folder-requests/[id].post.ts",
];

for (const endpoint of endpoints) {
  test(`${endpoint} enforces folder nomenclature`, async () => {
    assert.match(await readSource(endpoint), /requireValidFolderName/u);
  });
}

test("approval validates the collision-resolved final folder name", async () => {
  const source = await readSource("../server/api/folder-requests/[id].post.ts");
  assert.match(source, /finalFolderName/u);
  assert.match(source, /requireValidFolderName\([\s\S]*finalFolderName/u);
});

test("shared folder enforcement respects organization governance switches", async () => {
  const source = await readSource("../server/utils/folderNomenclature.ts");
  assert.match(source, /features\.nomenclature/u);
  assert.match(source, /rules\.enforceNomenclature/u);
  assert.match(source, /folderSegments/u);
  assert.match(source, /validateFolderNomenclature/u);
});
