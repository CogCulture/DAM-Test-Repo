# DAM Upload, RAG, Preview, and Nomenclature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve recursively selected folder trees, remove unintended DOCX batch latency, provide an unobstructed floating preview, and expose department nomenclature controls to superadmins while retaining server-side enforcement.

**Architecture:** Add a small directory-selection utility and pass a typed selection through the existing upload controller. Keep the current upload endpoints as the file path authority, add a tree endpoint only for directories not represented by files, route DOCX analysis according to `RAG_USE_BATCH`, and reuse the current nomenclature APIs and editor patterns from a superadmin-scoped endpoint.

**Tech Stack:** Nuxt 3.16, Vue 3, Nuxt UI 3, TypeScript, Nitro server routes, SQLite/Drizzle, Python, Anthropic SDK, Node test runner.

## Global Constraints

- Preserve unrelated working-tree changes.
- The browser owns native folder-picker double-click behavior; DAM starts recursion after folder confirmation.
- `webkitdirectory` remains the fallback when `showDirectoryPicker` is unavailable.
- Client validation assists users; server validation remains authoritative.
- Existing assets are not renamed when nomenclature changes.
- Batch RAG remains opt-in through `RAG_USE_BATCH=true`.

---

### Task 1: Recursive directory selection and manifest upload

**Files:**
- Create: `shared/utils/directory-upload.ts`
- Modify: `shared/utils/upload-dispatch.ts`
- Modify: `app/components/DropFiles.vue`
- Modify: `app/components/Upload.vue`
- Create: `server/api/folder/upload-tree.post.ts`
- Test: `tests/directory-upload.test.mjs`
- Test: `tests/upload-picker.test.mjs`

**Interfaces:**
- Produces: `DirectoryUploadSelection = { files: File[]; directories: string[] }`.
- Produces: `readDirectoryHandle(root): Promise<DirectoryUploadSelection>` with normalized paths beginning at `root.name`.
- Produces: upload controller method `processSelection(selection)`; `processFiles(files)` remains compatible.
- Produces: `POST /api/folder/upload-tree` body `{ paths, departmentId, destinationFolderId, storageTarget, bucket }`.

- [ ] **Step 1: Write failing traversal and dispatch tests**

```js
test("directory handles preserve nested files and empty directories", async () => {
  const selection = await readDirectoryHandle(mockDirectory("Campaign", {
    "Brief.docx": mockFile("Brief.docx"),
    Assets: mockDirectory("Assets", { Empty: mockDirectory("Empty", {}) }),
  }));
  assert.deepEqual(selection.directories, ["Campaign", "Campaign/Assets", "Campaign/Assets/Empty"]);
  assert.equal(selection.files[0].customPath, "Campaign/Brief.docx");
});
```

- [ ] **Step 2: Run the targeted tests and confirm the missing module/API failure**

Run: `node --experimental-strip-types --test tests/directory-upload.test.mjs tests/upload-picker.test.mjs`

- [ ] **Step 3: Implement recursive handle enumeration and cancellation-safe picker fallback**

```ts
export type DirectoryUploadSelection = { files: File[]; directories: string[] };
export async function readDirectoryHandle(root: DirectoryHandleLike): Promise<DirectoryUploadSelection>;
export async function chooseDirectory(win: DirectoryPickerWindow): Promise<DirectoryUploadSelection | null>;
```

`chooseDirectory` returns `null` only for `AbortError`. `DropFiles.vue` calls it when supported and clicks the legacy input otherwise.

- [ ] **Step 4: Pass directory selections through the upload controller**

`dispatchDroppedFiles` detects selection objects and calls `processSelection`. `Upload.vue` preflights the explicit manifest, calls `/api/folder/upload-tree` before file uploads, and keeps `processFiles` as `{ files, derivedDirectories }` compatibility behavior.

- [ ] **Step 5: Implement authorized tree creation**

The route verifies `canUpload`, normalizes each path, runs folder-nomenclature validation, resolves the selected destination, and uses existing `ensurePath` or `ensureGDrivePath` helpers in parent-before-child order. It returns `{ created: string[] }` and never stores placeholder files.

- [ ] **Step 6: Run targeted tests**

Run: `node --experimental-strip-types --test tests/directory-upload.test.mjs tests/upload-picker.test.mjs tests/folder-upload-target.test.mjs tests/folder-upload-nomenclature-contract.test.mjs`

---

### Task 2: Interactive DOCX RAG path

**Files:**
- Modify: `server/utils/rag_parsers/processor.py`
- Modify: `server/utils/rag_parsers/run_pipeline.py`
- Modify: `app/components/RagProgressModal.vue`
- Test: `tests/docx-rag-contract.test.mjs`

**Interfaces:**
- Produces: `analyze_with_claude_with_usage(..., use_batch: bool)`.
- Produces: newline progress records `{"type":"stage","stage":"extracting|analyzing|embedding|saving","message":"..."}`.

- [ ] **Step 1: Add failing contract tests**

```js
assert.match(processor, /if use_batch:/u);
assert.match(processor, /client\.messages\.create/u);
assert.match(processor, /USE_BATCH_API/u);
assert.match(pipeline, /"stage": "embedding"/u);
```

- [ ] **Step 2: Run the DOCX contract test and verify failure**

Run: `node --test tests/docx-rag-contract.test.mjs`

- [ ] **Step 3: Honor `RAG_USE_BATCH`**

When false, call `client.messages.create` with the same content and usage accounting. When true, retain the existing batch submission and polling. Emit extraction and analysis stage JSON before each operation.

- [ ] **Step 4: Emit and render pipeline stages**

Emit embedding from `run_pipeline.py`; let the existing SSE forwarding carry records to `RagProgressModal.vue`, which displays the latest user-facing stage without exposing raw JSON.

- [ ] **Step 5: Run DOCX and RAG tests**

Run: `node --test tests/docx-rag-contract.test.mjs tests/rag-artifact.test.mjs tests/rag-endpoint-contract.test.mjs`

---

### Task 3: Centered, correctly layered DAM preview

**Files:**
- Modify: `app/components/FilePreview.vue`
- Modify: `app/components/App/Files.vue`
- Test: `tests/file-preview-contract.test.mjs`

**Interfaces:**
- Consumes: existing `usePreview().showPreview(files, index)`.
- Produces: preview modal UI layers `overlay: z-[10000]` and `content: z-[10001]`.

- [ ] **Step 1: Add a failing preview contract test**

```js
assert.match(preview, /z-\[10001\]/u);
assert.match(preview, /max-w-\[min\(92rem,92vw\)\]/u);
assert.match(files, /closeActions\(\);\s*showPreview/u);
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test tests/file-preview-contract.test.mjs`

- [ ] **Step 3: Replace fullscreen content with a floating responsive modal**

Pass explicit `ui` classes to `UModal`, remove `fullscreen`, constrain the shell to `92vw × 90dvh`, retain the document canvas and metadata sidebar, and provide a download fallback for rendering failures.

- [ ] **Step 4: Close competing workspace layers before preview**

Call `closeActions()` immediately before `showPreview(...)` in `onOpen`.

- [ ] **Step 5: Run the preview contract test**

Run: `node --test tests/file-preview-contract.test.mjs`

---

### Task 4: Superadmin nomenclature configuration

**Files:**
- Create: `app/components/NomenclatureEditor.vue`
- Modify: `app/pages/admin/nomenclature.vue`
- Modify: `app/pages/superadmin/organizations/[orgId].vue`
- Create: `server/api/superadmin/organizations/[orgId]/nomenclature/[dept].get.ts`
- Create: `server/api/superadmin/organizations/[orgId]/nomenclature/[dept].put.ts`
- Modify: `server/utils/nomenclature.ts`
- Test: `tests/superadmin-nomenclature-contract.test.mjs`
- Test: `tests/nomenclature-integration-contract.test.mjs`

**Interfaces:**
- Produces: reusable editor props `{ modelValue, enforcementEnabled, saving }` and emits `update:modelValue`, `update:enforcementEnabled`, `save`.
- Produces: superadmin GET/PUT routes scoped by both organization and department.
- Consumes: existing normalized file/folder segment types and shared validators.

- [ ] **Step 1: Add failing route and UI contract tests**

```js
assert.match(page, /NomenclatureEditor/u);
assert.match(getRoute, /requireSuperAdmin/u);
assert.match(putRoute, /organizationId/u);
assert.match(putRoute, /normalizeNomenclatureSegments/u);
```

- [ ] **Step 2: Run nomenclature tests and verify failure**

Run: `node --experimental-strip-types --test tests/superadmin-nomenclature-contract.test.mjs tests/nomenclature-integration-contract.test.mjs`

- [ ] **Step 3: Extract the existing editor without changing semantics**

Move segment, allowed-value, extension, folder-segment, preview, and enforcement controls into `NomenclatureEditor.vue`. Keep the admin page responsible for department selection and API calls.

- [ ] **Step 4: Add organization-scoped superadmin APIs**

Require the superadmin role, verify that the department belongs to `orgId`, return/update the nomenclature row, and update the organization's enforcement rule without impersonating an organization admin.

- [ ] **Step 5: Add the editor to the superadmin organization view**

Load the organization departments already returned by the page API, select one department, fetch its policy, and save through the new scoped endpoint.

- [ ] **Step 6: Verify all upload ingress contracts still enforce the shared policy**

Run: `node --experimental-strip-types --test tests/file-nomenclature.test.mjs tests/upload-governance.test.mjs tests/nomenclature-integration-contract.test.mjs tests/superadmin-nomenclature-contract.test.mjs`

---

### Task 5: Full verification

**Files:**
- Modify only files needed to resolve failures caused by Tasks 1–4.

- [ ] **Step 1: Run the full Node test suite**

Run: `node --test --test-isolation=none tests/*.test.mjs`

- [ ] **Step 2: Run the production build**

Run: `npm run build`

- [ ] **Step 3: Review the final diff and working-tree ownership**

Run: `git diff --check` and `git status --short`. Confirm unrelated pre-existing modifications remain untouched.

