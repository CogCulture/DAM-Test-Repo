import assert from "node:assert/strict";
import test from "node:test";

import {
  planFileUpload,
  resolveFileCollision,
  stripCollisionSuffix,
} from "../shared/utils/file-collision.ts";

test("keeps a unique filename unchanged", () => {
  assert.deepEqual(
    resolveFileCollision({ requestedName: "brief.pdf", existingNames: [] }),
    { finalName: "brief.pdf", renamed: false },
  );
});

test("numbers a same-name upload before its extension", () => {
  assert.deepEqual(
    resolveFileCollision({ requestedName: "brief.pdf", existingNames: ["brief.pdf"] }),
    { finalName: "brief (1).pdf", renamed: true },
  );
});

test("uses the first available number without overwriting an existing copy", () => {
  assert.deepEqual(
    resolveFileCollision({
      requestedName: "brief.pdf",
      existingNames: ["brief.pdf", "brief (1).pdf", "brief (3).pdf"],
    }),
    { finalName: "brief (2).pdf", renamed: true },
  );
});

test("treats filename collisions as case-insensitive", () => {
  assert.deepEqual(
    resolveFileCollision({ requestedName: "BRIEF.PDF", existingNames: ["brief.pdf"] }),
    { finalName: "BRIEF (1).PDF", renamed: true },
  );
});

test("numbers extensionless and hidden filenames predictably", () => {
  assert.equal(
    resolveFileCollision({ requestedName: "README", existingNames: ["README"] }).finalName,
    "README (1)",
  );
  assert.equal(
    resolveFileCollision({ requestedName: ".env", existingNames: [".env"] }).finalName,
    ".env (1)",
  );
});

test("reuses the canonical binary when uploaded content already exists", () => {
  assert.deepEqual(
    planFileUpload({
      requestedName: "campaign-final.pdf",
      existingNames: ["campaign.pdf"],
      contentMatch: {
        id: "asset_01",
        name: "campaign.pdf",
        storagePath: "org/marketing/campaign.pdf",
      },
    }),
    {
      finalName: "campaign (1).pdf",
      renamed: true,
      duplicate: true,
      duplicateOfId: "asset_01",
      duplicateOfName: "campaign.pdf",
      reuseStoragePath: "org/marketing/campaign.pdf",
    },
  );
});

test("does not stack a collision suffix when numbering another copy", () => {
  assert.equal(stripCollisionSuffix("Report (1).pdf"), "Report.pdf");
  assert.equal(stripCollisionSuffix("Report (27).pdf"), "Report.pdf");
  assert.equal(stripCollisionSuffix("Report.pdf"), "Report.pdf");
});

test("uses the canonical filename for identical content even when the requested name is free", () => {
  const result = planFileUpload({
    requestedName: "invoice-v2-final.pdf",
    existingNames: ["invoice.pdf"],
    contentMatch: {
      id: "asset_invoice",
      name: "invoice.pdf",
      storagePath: "org/finance/invoice.pdf",
    },
  });

  assert.equal(result.finalName, "invoice (1).pdf");
  assert.equal(result.renamed, true);
  assert.equal(result.duplicate, true);
});

test("continues canonical numbering without stacking suffixes", () => {
  const result = planFileUpload({
    requestedName: "another-name.pdf",
    existingNames: ["Report.pdf", "Report (1).pdf", "Report (2).pdf"],
    contentMatch: {
      id: "asset_report_copy",
      name: "Report (1).pdf",
      storagePath: "org/reports/report.pdf",
    },
  });

  assert.equal(result.finalName, "Report (3).pdf");
});

test("renames a byte-identical same-name upload and reuses its binary", () => {
  assert.deepEqual(
    planFileUpload({
      requestedName: "campaign.pdf",
      existingNames: ["campaign.pdf"],
      contentMatch: {
        id: "asset_01",
        name: "campaign.pdf",
        storagePath: "org/marketing/campaign.pdf",
      },
    }),
    {
      finalName: "campaign (1).pdf",
      renamed: true,
      duplicate: true,
      duplicateOfId: "asset_01",
      duplicateOfName: "campaign.pdf",
      reuseStoragePath: "org/marketing/campaign.pdf",
    },
  );
});

test("keeps different same-name content as a separately stored numbered asset", () => {
  assert.deepEqual(
    planFileUpload({
      requestedName: "campaign.pdf",
      existingNames: ["campaign.pdf"],
      contentMatch: null,
    }),
    {
      finalName: "campaign (1).pdf",
      renamed: true,
      duplicate: false,
    },
  );
});