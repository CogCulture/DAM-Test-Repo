import assert from "node:assert/strict";
import test from "node:test";

import {
  loadAllDirectoryPages,
  loadCompleteAssetView,
} from "../shared/utils/directory-pagination.ts";

test("the asset view resolves every server page before rendering", async () => {
  const requestedPages = [];
  const result = await loadCompleteAssetView(async (page) => {
    requestedPages.push(page);
    return page === 1
      ? { data: [{ id: "asset-a" }], nextPage: 2 }
      : { data: [{ id: "asset-b" }], nextPage: null };
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(result.map(asset => asset.id), ["asset-a", "asset-b"]);
});

test("directory loading follows every next-page token and returns each entry once", async () => {
  const requestedPages = [];
  const pages = new Map([
    [1, {
      data: [
        { id: "folder-a", name: "Folder A" },
        { id: "drive-file", name: "Drive file" },
      ],
      nextPage: 4,
    }],
    [4, {
      data: [
        { id: "drive-file", name: "Drive file" },
        { id: "local-file", name: "Local file" },
      ],
      nextPage: 9,
    }],
    [9, {
      data: [{ id: "folder-z", name: "Folder Z" }],
      nextPage: null,
    }],
  ]);

  const result = await loadAllDirectoryPages(async (page) => {
    requestedPages.push(page);
    return pages.get(page);
  });

  assert.deepEqual(requestedPages, [1, 4, 9]);
  assert.deepEqual(result.map((entry) => entry.id), [
    "folder-a",
    "drive-file",
    "local-file",
    "folder-z",
  ]);
});

test("directory loading rejects a repeated next-page token instead of looping forever", async () => {
  await assert.rejects(
    loadAllDirectoryPages(async () => ({ data: [], nextPage: 1 })),
    /repeated page token/i,
  );
});
