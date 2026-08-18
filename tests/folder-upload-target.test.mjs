import assert from "node:assert/strict";
import test from "node:test";

import {
  getUploadDirectoryPaths,
  normalizeDirectoryManifest,
  normalizeUploadRelativePath,
  resolveAuthorizedFolderId,
  resolveSelectedFolderId,
  replaceDirectoryBranch,
  sortDirectoryChildren,
} from "../shared/utils/folder-upload-target.ts";

test("directory manifests are normalized, deduplicated, and ordered parent first", () => {
  assert.deepEqual(normalizeDirectoryManifest([
    "Campaign\\Assets\\Empty",
    "Campaign",
    "Campaign/Assets",
    "Campaign/Assets",
  ]), [
    "Campaign",
    "Campaign/Assets",
    "Campaign/Assets/Empty",
  ]);
});

test("directory manifests reject traversal", () => {
  assert.throws(() => normalizeDirectoryManifest(["Campaign/../Secrets"]), /Invalid upload path/u);
});

test("derives every unique parent directory from uploaded file paths", () => {
  assert.deepEqual(getUploadDirectoryPaths([
    "Acme_Launch/Acme_Images/logo.png",
    "Acme_Launch/Acme_Docs/brief.docx",
    "Acme_Launch/Acme_Images/banner.png",
  ]), [
    "Acme_Launch",
    "Acme_Launch/Acme_Images",
    "Acme_Launch/Acme_Docs",
  ]);
});

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
  assert.equal(resolveSelectedFolderId({ selectedFolderId: "   ", routeFolderId: "route", rootFolderId: "root" }), "route");
});

test("directory children list folders first and then files by name", () => {
  assert.deepEqual(sortDirectoryChildren([
    { type: "file", name: "z.pdf" },
    { type: "folder", name: "Beta" },
    { type: "folder", name: "Alpha" },
    { type: "file", name: "a.pdf" },
  ]).map(item => item.name), ["Alpha", "Beta", "a.pdf", "z.pdf"]);
});

test("a selected nested folder must belong to the authorized Drive hierarchy", () => {
  const allowed = new Set(["drive-root", "marketing", "campaigns"]);
  assert.equal(resolveAuthorizedFolderId({ requestedId: "campaigns", allowedIds: allowed }), "campaigns");
  assert.throws(
    () => resolveAuthorizedFolderId({ requestedId: "foreign", allowedIds: allowed }),
    /not authorized/i,
  );
});

test("tree refresh retains a loaded branch until replacement data is ready", () => {
  const current = [{ id: "folder-a", type: "folder", name: "A" }];
  const next = [{ id: "folder-b", type: "folder", name: "B" }];
  assert.deepEqual(replaceDirectoryBranch(current, next, false), current);
  assert.deepEqual(replaceDirectoryBranch(current, next, true), next);
});
