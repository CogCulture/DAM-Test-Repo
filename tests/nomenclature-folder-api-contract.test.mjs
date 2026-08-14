import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const getSource = await readFile(
  new URL("../server/api/nomenclature/[dept].get.ts", import.meta.url),
  "utf8",
);
const putSource = await readFile(
  new URL("../server/api/nomenclature/[dept].put.ts", import.meta.url),
  "utf8",
);
const effectiveSource = await readFile(
  new URL("../server/api/nomenclature/effective.get.ts", import.meta.url),
  "utf8",
);

test("nomenclature API persists independent folder segments", () => {
  assert.match(putSource, /folderSegments/u);
  assert.match(
    putSource,
    /normalizeNomenclatureSegments\(\s*Array\.isArray\(folderSegments\)/u,
  );
  assert.match(getSource, /folderTemplate/u);
});

test("effective nomenclature exposes normalized folder configuration", () => {
  assert.match(effectiveSource, /folderSegments/u);
  assert.match(effectiveSource, /folderTemplate/u);
});
