import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const endpoints = [
  "../server/api/gdrive/upload.post.ts",
  "../server/api/files/[bucket]/local-upload.post.ts",
];

for (const endpoint of endpoints) {
  test(`${endpoint} enforces the shared nomenclature policy`, () => {
    const source = readFileSync(new URL(endpoint, import.meta.url), "utf8");
    assert.match(source, /evaluateUploadGovernance/);
    assert.match(source, /throw createError\(\{ status: 422/);
  });
}
