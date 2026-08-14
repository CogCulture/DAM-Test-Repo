import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(
  new URL("../app/pages/admin/nomenclature.vue", import.meta.url),
  "utf8",
);

test("the nomenclature editor normalizes legacy segments before rendering", () => {
  assert.match(
    pageSource,
    /segments\.value\s*=\s*normalizeNomenclatureSegments\(val\.segments\)/u,
    "legacy segments without allowedValues must be normalized before the template reads .length",
  );
});

test("the nomenclature editor never reads length from optional allowed values", () => {
  assert.doesNotMatch(
    pageSource,
    /seg\.allowedValues\.length/u,
    "allowedValues is optional on legacy records and must be guarded in the template",
  );
});

test("the nomenclature editor guards optional allowed extensions before rendering", () => {
  assert.doesNotMatch(
    pageSource,
    /allowedExtensions\.length/u,
    "allowedExtensions may be null or missing on unconfigured department policies",
  );
  assert.match(pageSource, /allowedExtensionsForEditor\(\)/u);
});

test("the nomenclature editor normalizes legacy folder segments before rendering", () => {
  assert.match(
    pageSource,
    /folderSegments\.value\s*=\s*normalizeNomenclatureSegments\(val\.folderSegments\)/u,
  );
  assert.match(pageSource, /Folder naming/u);
  assert.match(pageSource, /folderTemplatePreview/u);
});
