import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeUploadRelativePath,
  resolveSelectedFolderId,
  sortDirectoryChildren,
} from "../shared/utils/folder-upload-target.ts";

test("a directory upload preserves its top-level and nested folders", () => {
  assert.deepEqual(normalizeUploadRelativePath("Campaign Assets/Images/logo.png"), {
    directories: ["Campaign Assets", "Images"],
    fileName: "logo.png",
  });
});

test("unsafe or empty relative paths are rejected", () => {
  for (const value of ["", "../secret.pdf", "/absolute.pdf", "folder//file.pdf", "folder/./file.pdf"]) {
    assert.throws(() => normalizeUploadRelativePath(value));
  }
});

test("an explicit folder selection wins over route and root defaults", () => {
  assert.equal(resolveSelectedFolderId({ selectedFolderId: "chosen", routeFolderId: "route", rootFolderId: "root" }), "chosen");
  assert.equal(resolveSelectedFolderId({ routeFolderId: "route", rootFolderId: "root" }), "route");
});

test("directory children list folders first and then files by name", () => {
  assert.deepEqual(sortDirectoryChildren([
    { type: "file", name: "z.pdf" },
    { type: "folder", name: "Beta" },
    { type: "folder", name: "Alpha" },
    { type: "file", name: "a.pdf" },
  ]).map(item => item.name), ["Alpha", "Beta", "a.pdf", "z.pdf"]);
});

