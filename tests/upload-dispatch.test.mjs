import assert from "node:assert/strict";
import test from "node:test";

import { dispatchDroppedFiles } from "../shared/utils/upload-dispatch.ts";

test("dropped files are delivered to the active upload controller", async () => {
  const files = [{ name: "brief.pdf" }];
  let received = null;

  const result = await dispatchDroppedFiles(files, {
    processFiles: async (selected) => {
      received = selected;
    },
  });

  assert.deepEqual(received, files);
  assert.deepEqual(result, { ok: true });
});

test("a missing upload controller returns a visible failure reason", async () => {
  const result = await dispatchDroppedFiles([{ name: "brief.pdf" }], null);

  assert.deepEqual(result, {
    ok: false,
    message: "The upload controls are still loading. Please try again.",
  });
});

test("directory manifests are delivered without discarding empty folders", async () => {
  const selection = {
    files: [{ name: "brief.pdf", customPath: "Campaign/brief.pdf" }],
    directories: ["Campaign", "Campaign/Empty"],
  };
  let received = null;

  const result = await dispatchDroppedFiles(selection, {
    processFiles: async () => assert.fail("file-only fallback must not run"),
    processSelection: async (selected) => {
      received = selected;
    },
  });

  assert.deepEqual(received, selection);
  assert.deepEqual(result, { ok: true });
});
