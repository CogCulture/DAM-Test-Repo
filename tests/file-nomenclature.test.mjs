import assert from "node:assert/strict";
import test from "node:test";

import {
  findUploadGovernanceViolation,
  findEffectiveUploadGovernanceViolation,
  normalizeAllowedExtensions,
  normalizeNomenclatureSegments,
  validateFileExtension,
  validateFileNomenclature,
  validateFolderNomenclature,
  validateFolderPathNomenclature,
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

test("supports an administrator-defined Brand_Project_MediaType_Version policy", () => {
  const policy = [
    { key: "Brand", label: "Brand", allowedValues: ["Acme"] },
    { key: "Project", label: "Project", allowedValues: [] },
    { key: "MediaType", label: "Media type", allowedValues: ["Video", "Image"] },
    { key: "Version", label: "Version", allowedValues: [] },
  ];

  assert.deepEqual(
    validateFileNomenclature("Acme_Launch_Video_v2.mp4", policy),
    { valid: true },
  );
});

test("rejects wrong shapes and administrator-restricted values", () => {
  const policy = [
    { key: "Brand", label: "Brand", allowedValues: ["Acme"] },
    { key: "MediaType", label: "Media type", allowedValues: ["Video"] },
  ];

  assert.match(validateFileNomenclature("Acme.pdf", policy).message, /Brand_MediaType/);
  assert.match(validateFileNomenclature("Other_Video.pdf", policy).message, /Brand/);
  assert.match(validateFileNomenclature("Acme_Image.pdf", policy).message, /Media type/);
});

test("strict upload preflight rejects the first original filename that violates policy", () => {
  const violation = findUploadGovernanceViolation({
    filenames: ["Acme_Photo.pdf", "tanishgahlot_resume-1.pdf"],
    enabled: true,
    segments,
    allowedExtensions: ["pdf"],
  });

  assert.equal(violation?.filename, "tanishgahlot_resume-1.pdf");
  assert.match(violation?.message || "", /Brand/);
});

test("strict upload preflight accepts compliant original filenames", () => {
  assert.equal(findUploadGovernanceViolation({
    filenames: ["Acme_Photo.pdf", "Acme_Video.pdf"],
    enabled: true,
    segments,
    allowedExtensions: ["pdf"],
  }), null);
});

test("strict preflight reads the effective API's nested nomenclature payload", () => {
  const policy = {
    enforced: true,
    nomenclature: {
      segments,
      allowedExtensions: ["pdf"],
    },
  };

  assert.equal(findEffectiveUploadGovernanceViolation(["Acme_Photo.pdf"], policy), null);
  assert.equal(
    findEffectiveUploadGovernanceViolation(["tanishgahlot_resume-1.pdf"], policy)?.filename,
    "tanishgahlot_resume-1.pdf",
  );
});

test("validates folder names with the same segment model as files", () => {
  assert.deepEqual(validateFolderNomenclature("Acme_Photo", segments), { valid: true });
  assert.match(validateFolderNomenclature("Other_Photo", segments).message, /Brand/i);
  assert.match(validateFolderNomenclature("Acme", segments).message, /Brand_Asset/i);
});

test("validates every directory component against folder nomenclature", () => {
  const folderSegments = [
    { key: "Brand", label: "Brand", allowedValues: ["Acme"] },
    { key: "Project", label: "Project", allowedValues: [] },
  ];

  assert.deepEqual(
    validateFolderPathNomenclature("Acme_Launch/Acme_Images", folderSegments),
    { valid: true },
  );
  const rejected = validateFolderPathNomenclature("Acme_Launch/Misc", folderSegments);
  assert.equal(rejected.valid, false);
  assert.match(rejected.message, /Misc/);
});
