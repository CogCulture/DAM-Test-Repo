# Folder-Targeted Uploads and Directory Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized users select an existing workspace folder, upload files or preserved nested directories into it, and browse folders and child files as an expandable sidebar hierarchy mirrored in Google Drive.

**Architecture:** Add shared, testable folder-destination and relative-path contracts; expose authorized Google Drive folder destinations from the server; validate every chosen folder before recursive path creation; and bind one active upload-folder state to navigation, upload controls, and the lazy directory tree. Reuse the existing Drive list, upload, collision, nomenclature, RAG, preview, and refresh flows rather than replacing them.

**Tech Stack:** Nuxt 3, Vue 3 Composition API, Nitro/H3 API routes, Google Drive API v3, Drizzle/SQLite metadata, Node test runner.

## Global Constraints

- Preserve the selected uploaded directory as a child and recreate its complete nested structure.
- Administrators may select organization root and authorized folders; other users see only folders allowed by effective access rules.
- Server-side organization and folder authorization is mandatory; client folder IDs are untrusted.
- Existing nomenclature, extension, collision, duplicate, RAG, preview, search, and permissions behavior must remain unchanged.
- Empty browser directories are not created.
- Large Drive hierarchies load immediate children lazily rather than through one recursive listing.
- Existing asset cards and expanded tree nodes remain visible while refreshed data is pending.

---

### Task 1: Shared folder-target and relative-path contracts

**Files:**
- Create: `shared/utils/folder-upload-target.ts`
- Create: `tests/folder-upload-target.test.mjs`

**Interfaces:**
- Produces: `normalizeUploadRelativePath(path: string): { directories: string[]; fileName: string }`
- Produces: `resolveSelectedFolderId(input: { selectedFolderId?: string | null; routeFolderId?: string | null; rootFolderId: string }): string`
- Produces: `sortDirectoryChildren<T extends { type: string; name: string }>(items: T[]): T[]`

- [ ] **Step 1: Write failing contract tests**

```js
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
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `folder-upload-target.ts`.

- [ ] **Step 3: Implement the shared contracts**

```ts
const INVALID_SEGMENTS = new Set(["", ".", ".."]);

export const normalizeUploadRelativePath = (value: string) => {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error("Invalid upload path.");
  }
  const parts = normalized.split("/");
  if (parts.some(part => INVALID_SEGMENTS.has(part) || /[\u0000-\u001f]/.test(part))) {
    throw new Error("Invalid upload path.");
  }
  const fileName = parts.pop();
  if (!fileName) throw new Error("Invalid upload path.");
  return { directories: parts, fileName };
};

export const resolveSelectedFolderId = ({ selectedFolderId, routeFolderId, rootFolderId }: {
  selectedFolderId?: string | null;
  routeFolderId?: string | null;
  rootFolderId: string;
}) => selectedFolderId || routeFolderId || rootFolderId;

export const sortDirectoryChildren = <T extends { type: string; name: string }>(items: T[]) =>
  [...items].sort((a, b) => Number(b.type === "folder") - Number(a.type === "folder") || a.name.localeCompare(b.name));
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs`

Expected: 4 tests pass.

- [ ] **Step 5: Commit the isolated contract**

```bash
git add shared/utils/folder-upload-target.ts tests/folder-upload-target.test.mjs
git commit -m "feat: add folder upload path contracts"
```

### Task 2: Authorized Drive folder destinations and upload enforcement

**Files:**
- Create: `server/api/gdrive/upload-folders.get.ts`
- Modify: `server/api/gdrive/upload.post.ts`
- Modify: `server/utils/gdrive.ts`
- Modify: `tests/folder-upload-target.test.mjs`

**Interfaces:**
- Consumes: `normalizeUploadRelativePath(path)` from Task 1.
- Produces: `GET /api/gdrive/upload-folders?parentId=<id>` returning `{ id, name, parentId, path, type: "folder" }[]` for authorized immediate child folders.
- Produces: `requireAuthorizedDriveUploadFolder(user, folderId): Promise<{ id: string; name: string; path: string }>`.
- Preserves: `POST /api/gdrive/upload?parentId=<id>&relativePath=<path>` response and collision semantics.

- [ ] **Step 1: Add failing authorization and folder-resolution tests**

```js
test("a selected nested folder is required to belong to the organization Drive hierarchy", async () => {
  const allowed = new Set(["drive-root", "marketing", "campaigns"]);
  assert.equal(resolveAuthorizedFolderId({ requestedId: "campaigns", allowedIds: allowed }), "campaigns");
  assert.throws(() => resolveAuthorizedFolderId({ requestedId: "foreign", allowedIds: allowed }), /not authorized/i);
});

test("relative directory segments are resolved beneath the chosen folder", () => {
  const parsed = normalizeUploadRelativePath("Campaign Assets/Images/logo.png");
  assert.deepEqual(parsed.directories, ["Campaign Assets", "Images"]);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs`

Expected: FAIL because `resolveAuthorizedFolderId` is not exported.

- [ ] **Step 3: Implement server-side folder authorization**

Add `resolveAuthorizedFolderId({ requestedId, allowedIds })` to the shared contract for deterministic validation. In the server helper, resolve the approved Drive connection root, walk parent links or an authorized folder index, and reject any requested folder that is outside the organization root or the user's effective department access. Never replace an invalid requested folder with root.

```ts
export const resolveAuthorizedFolderId = ({ requestedId, allowedIds }: {
  requestedId: string;
  allowedIds: Set<string>;
}) => {
  if (!allowedIds.has(requestedId)) throw new Error("Upload folder is not authorized.");
  return requestedId;
};
```

- [ ] **Step 4: Implement the immediate-child upload-folder endpoint**

Return folders only, sorted by name, with normalized paths. Use the existing Drive connection and access helpers; return `403` for an inaccessible parent and never expose raw folders outside the authorized hierarchy.

```ts
return sortDirectoryChildren(children)
  .filter(item => item.type === "folder")
  .map(item => ({ id: item.id, name: item.name, parentId, path: `${parentPath}/${item.name}`, type: "folder" }));
```

- [ ] **Step 5: Enforce the selected parent and preserve uploaded directory paths**

In `upload.post.ts`, authorize `query.parentId` before listing or creating anything. Replace ad-hoc path splitting with `normalizeUploadRelativePath(relativePath)`, pass `directories` to the existing `ensureGDrivePath`, and use `fileName` only as the uploaded leaf name. Continue running nomenclature and collision checks after the final leaf folder is resolved.

- [ ] **Step 6: Run focused and existing upload tests**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs tests/department-upload.test.mjs tests/file-collision.test.mjs`

Expected: all focused tests pass.

- [ ] **Step 7: Commit server enforcement**

```bash
git add shared/utils/folder-upload-target.ts tests/folder-upload-target.test.mjs server/api/gdrive/upload-folders.get.ts server/api/gdrive/upload.post.ts server/utils/gdrive.ts
git commit -m "feat: authorize folder-targeted Drive uploads"
```

### Task 3: Active workspace folder and upload selector

**Files:**
- Create: `app/composables/useUploadDestination.ts`
- Modify: `app/components/Upload.vue`
- Modify: `app/components/App/DirectoryNode.vue`
- Modify: `app/components/App/Files.vue`
- Test: `tests/folder-upload-target.test.mjs`

**Interfaces:**
- Produces: shared state `active-upload-folder` with `{ id, name, path } | null`.
- Produces: `selectUploadFolder(folder)` and `syncUploadFolderFromRoute(folder)`.
- Consumes: `GET /api/gdrive/upload-folders` for lazy folder choices.
- Consumes: existing `Upload.processFiles(files)` public component method.

- [ ] **Step 1: Add failing selection-precedence tests**

Extend the Task 1 test so explicit selection, current route, and root fallback are covered independently, including an empty selection.

- [ ] **Step 2: Run the focused tests and verify RED for any missing case**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs`

Expected: new empty-selection assertion fails until the resolver handles whitespace and null consistently.

- [ ] **Step 3: Implement `useUploadDestination`**

```ts
export const useUploadDestination = () => {
  const activeFolder = useState<{ id: string; name: string; path: string } | null>("active-upload-folder", () => null);
  const selectUploadFolder = (folder: { id: string; name: string; path: string }) => { activeFolder.value = folder; };
  return { activeFolder, selectUploadFolder };
};
```

Synchronize it when a directory node is opened and when the current route folder changes.

- [ ] **Step 4: Replace department-only upload targeting with folder targeting**

Keep department policy selection separate from physical folder selection. The upload UI shows the active path, opens a lazy authorized folder selector, and builds the Drive upload URL with the selected physical folder as `parentId`. Pass the selected department only for nomenclature policy; it must not override an explicitly authorized nested `parentId`.

- [ ] **Step 5: Keep central drop-zone dispatch robust**

Use the existing awaited `dispatchDroppedFiles` flow. Before opening the device picker, require an active authorized destination. After selection, open the controls, display the chosen path, and surface preparation or policy errors through existing toasts.

- [ ] **Step 6: Run focused tests and Nuxt preparation**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs tests/upload-dispatch.test.mjs`

Run: `node_modules\.bin\nuxi.CMD prepare`

Expected: focused tests pass and Nuxt generates types without errors. Do not run `prepare` while the active dev server is serving verification; restart it afterward if required.

- [ ] **Step 7: Commit the client destination flow**

```bash
git add app/composables/useUploadDestination.ts app/components/Upload.vue app/components/App/DirectoryNode.vue app/components/App/Files.vue tests/folder-upload-target.test.mjs
git commit -m "feat: select workspace upload folders"
```

### Task 4: Expandable folder-and-file directory tree

**Files:**
- Modify: `app/components/App/DirectoryTree.vue`
- Modify: `app/components/App/DirectoryNode.vue`
- Modify: `app/composables/usePreview.ts` only if the existing preview API cannot accept a child-file list.
- Test: `tests/folder-upload-target.test.mjs`

**Interfaces:**
- Consumes: `sortDirectoryChildren(items)` from Task 1.
- Consumes: existing immediate-child list endpoints.
- Produces: lazy expanded nodes with folder and file children.

- [ ] **Step 1: Add failing tree-order and stable-refresh tests**

```js
test("tree refresh replaces a loaded branch without clearing it first", () => {
  const current = [{ id: "folder-a", type: "folder", name: "A" }];
  const next = [{ id: "folder-b", type: "folder", name: "B" }];
  assert.deepEqual(replaceDirectoryBranch(current, next, false), next);
  assert.deepEqual(replaceDirectoryBranch(current, [], true), current);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs`

Expected: FAIL because `replaceDirectoryBranch` is not exported.

- [ ] **Step 3: Implement stable branch replacement**

Export `replaceDirectoryBranch(current, incoming, pending)` from the shared contract. Return `current` while pending and `sortDirectoryChildren(incoming)` after success.

- [ ] **Step 4: Render immediate child folders and files**

Update `DirectoryNode.vue` to retain all child items instead of filtering folders only. Render child folders recursively and child files as indented leaf rows. Folder clicks navigate/select upload destination; file clicks call the existing preview flow. Keep expansion state local and refresh loaded branches when `files-refresh-trigger` changes.

- [ ] **Step 5: Preserve root tree content during refresh**

Update `DirectoryTree.vue` so reset requests replace `files` only after a successful response. Sort root children with the shared helper and keep current rows visible during pending fetches.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs`

Run: `npm.cmd run verify:gcp`

Expected: all tests pass with zero failures.

- [ ] **Step 7: Commit the directory tree**

```bash
git add shared/utils/folder-upload-target.ts tests/folder-upload-target.test.mjs app/components/App/DirectoryTree.vue app/components/App/DirectoryNode.vue app/composables/usePreview.ts
git commit -m "feat: render nested workspace directory contents"
```

### Task 5: End-to-end verification and handoff

**Files:**
- Modify only files required to correct defects found by verification.

**Interfaces:**
- Verifies the complete specification without introducing a new interface.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm.cmd run verify:gcp`

Expected: all tests pass and zero tests fail.

- [ ] **Step 2: Run Nuxt/build validation without disturbing the active server**

Run: `node_modules\.bin\nuxi.CMD prepare`

Run: `git diff --check -- shared/utils/folder-upload-target.ts tests/folder-upload-target.test.mjs server/api/gdrive/upload-folders.get.ts server/api/gdrive/upload.post.ts server/utils/gdrive.ts app/composables/useUploadDestination.ts app/components/Upload.vue app/components/App/DirectoryTree.vue app/components/App/DirectoryNode.vue app/components/App/Files.vue`

Expected: both commands exit 0. Restart the dev server after `prepare` before browser validation so Nuxt's generated manifest and running process remain coherent.

- [ ] **Step 3: Validate the rendered file flow**

Using the connected browser:

1. Open `/org` as an administrator.
2. Expand an existing folder and select it.
3. Confirm the upload controls display that folder path.
4. Upload one uniquely named small file and verify it appears beneath that folder in the grid and tree.
5. Upload a temporary nested directory `codex-folder-upload-check/Subfolder/proof.txt`.
6. Verify the tree renders the folder, nested subfolder, and file as indented children.
7. Verify the same hierarchy exists in the connected Google Drive folder.
8. Confirm relevant browser console and server logs contain no errors.

- [ ] **Step 4: Remove verification artifacts recoverably**

Move only `codex-folder-upload-check` and the uniquely named proof file created in Step 3 to Google Drive Trash through the application's normal delete action. Confirm the original user assets remain untouched.

- [ ] **Step 5: Review scoped diff and report limitations**

Confirm no unrelated files were intentionally modified. Report any unavailable compiler, browser, or external Drive checks explicitly rather than claiming them as passed.

