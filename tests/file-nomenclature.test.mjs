import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAllowedExtensions,
  normalizeNomenclatureSegments,
  validateFileExtension,
  validateFileNomenclature,
} from "../shared/utils/file-nomenclature.ts";

const segments = [
  { key: "Brand", label: "Brand", allowedValues: ["Acme"] },
  { key: "Asset", label: "Asset type", allowedValues: ["Photo", "Video"] },
];

test("normalizes extensions without dots and removes duplicates", () => {
  assert.deepEqual(
    normalizeAllowedExtensions([".PDF", "pdf", " jpg ", ".JPG"]),
    ["pdf", "jpg"],
  );
});

test("an empty extension selection means unrestricted", () => {
  assert.equal(normalizeAllowedExtensions([]), null);
  assert.equal(normalizeAllowedExtensions(null), null);
});

test("rejects malformed extension configuration", () => {
  assert.throws(() => normalizeAllowedExtensions(["tar.gz"]), /extension/i);
  assert.throws(() => normalizeAllowedExtensions(["p df"]), /extension/i);
});

test("validates nomenclature segment values", () => {
  assert.deepEqual(validateFileNomenclature("Acme_Photo.pdf", segments), { valid: true });
  assert.match(validateFileNomenclature("Other_Photo.pdf", segments).message, /Brand/i);
});

test("validates extensions case-insensitively", () => {
  assert.deepEqual(validateFileExtension("Acme_Photo.PDF", ["pdf"]), { valid: true });
  const rejected = validateFileExtension("Acme_Photo.exe", ["pdf", "jpg"]);
  assert.equal(rejected.valid, false);
  assert.match(rejected.message, /pdf, jpg/i);
});

test("normalizes nomenclature input without mutating the source", () => {
  const input = [{ key: " Brand ", label: " Brand name ", allowedValues: [" Acme ", ""] }];
  assert.deepEqual(normalizeNomenclatureSegments(input), [
    { key: "Brand", label: "Brand name", allowedValues: ["Acme"] },
  ]);
  assert.equal(input[0].key, " Brand ");
});
