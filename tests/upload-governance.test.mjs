import assert from "node:assert/strict";
import test from "node:test";

import { evaluateUploadGovernance } from "../shared/utils/file-nomenclature.ts";

const segments = [
  { key: "Brand", label: "Brand", allowedValues: ["Acme"] },
  { key: "Asset", label: "Asset type", allowedValues: ["Photo"] },
];

for (const role of ["admin", "dept_head", "team_member"]) {
  test(`${role} cannot bypass an enabled nomenclature rule`, () => {
    const result = evaluateUploadGovernance({
      role,
      enabled: true,
      filename: "wrong-name.pdf",
      segments,
      allowedExtensions: ["pdf"],
    });
    assert.equal(result.valid, false);
  });
}

test("an enabled extension rule rejects a correctly named disallowed file type", () => {
  const result = evaluateUploadGovernance({
    enabled: true,
    filename: "Acme_Photo.exe",
    segments,
    allowedExtensions: ["pdf", "jpg"],
  });
  assert.equal(result.valid, false);
  assert.match(result.message, /pdf, jpg/i);
});

test("disabled governance accepts a filename without a configured template", () => {
  assert.deepEqual(
    evaluateUploadGovernance({
      enabled: false,
      filename: "anything.exe",
      segments: [],
      allowedExtensions: ["pdf"],
    }),
    { valid: true },
  );
});

test("enabled governance accepts a valid name and extension", () => {
  assert.deepEqual(
    evaluateUploadGovernance({
      enabled: true,
      filename: "Acme_Photo.PDF",
      segments,
      allowedExtensions: ["pdf"],
    }),
    { valid: true },
  );
});
