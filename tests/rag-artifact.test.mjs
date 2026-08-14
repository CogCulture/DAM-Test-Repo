import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRagArtifactMetadata,
  resolveRagArtifactState,
} from "../shared/utils/rag-artifact.ts";

const source = {
  id: "source-1",
  md5: "abc123",
  name: "report.pdf",
  path: "local/root/report.pdf",
};

test("reuses the oldest parsed artifact and identifies repeated rows for cleanup", () => {
  const state = resolveRagArtifactState(source, [
    {
      id: "parsed-new",
      name: "report_anthropic_parsed.md",
      path: "local/root/report_anthropic_parsed.md",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      assetMetadata: buildRagArtifactMetadata(source),
    },
    {
      id: "parsed-old",
      name: "report_anthropic_parsed.md",
      path: "local/root/report_anthropic_parsed.md",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      assetMetadata: buildRagArtifactMetadata(source),
    },
  ]);

  assert.equal(state.canonical?.id, "parsed-old");
  assert.deepEqual(state.duplicateIds, ["parsed-new"]);
  assert.equal(state.canReuseContent, true);
});

test("recognizes legacy parsed rows by their derived path", () => {
  const state = resolveRagArtifactState(source, [
    {
      id: "legacy",
      name: "report_anthropic_parsed.md",
      path: "local/root/report_anthropic_parsed.md",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      assetMetadata: null,
    },
    {
      id: "unrelated",
      name: "another_anthropic_parsed.md",
      path: "local/root/another_anthropic_parsed.md",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      assetMetadata: null,
    },
  ]);

  assert.equal(state.canonical?.id, "legacy");
  assert.deepEqual(state.duplicateIds, []);
  assert.equal(state.canReuseContent, true);
});

test("does not reuse parsed content when the source checksum changed", () => {
  const state = resolveRagArtifactState(
    { ...source, md5: "new-checksum" },
    [{
      id: "parsed-old",
      name: "report_anthropic_parsed.md",
      path: "local/root/report_anthropic_parsed.md",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      assetMetadata: buildRagArtifactMetadata(source),
    }],
  );

  assert.equal(state.canonical?.id, "parsed-old");
  assert.equal(state.canReuseContent, false);
});

test("records the original filename and path for search result resolution", () => {
  assert.deepEqual(buildRagArtifactMetadata(source), {
    source: "rag",
    ragSourceFileId: "source-1",
    ragSourceMd5: "abc123",
    ragSourceName: "report.pdf",
    ragSourcePath: "local/root/report.pdf",
  });
});
