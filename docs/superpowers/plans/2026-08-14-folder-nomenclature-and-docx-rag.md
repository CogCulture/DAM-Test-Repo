# Folder Nomenclature and DOCX RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add administrator-configurable folder nomenclature across every folder creation/upload path and restore advertised DOCX-to-RAG processing.

**Architecture:** Extend the existing per-department nomenclature row with independent folder segments, then reuse a shared validator at UI preflight and every server-side creation boundary. Directory uploads derive all folder path components before uploading bytes. DOCX keeps the existing processor and embedding pipeline, with its missing Python dependency declared and reported clearly.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, Nitro server routes, Drizzle ORM with SQLite migrations, Node test runner, Python RAG parsers, Google Drive API.

## Global Constraints

- Existing file nomenclature behavior and allowed-extension enforcement must remain unchanged.
- Existing folders must not be renamed or retroactively rejected.
- Folder validation applies to manual local/Drive creation, folder requests and approvals, and every non-empty directory represented by uploaded files.
- The server is the final enforcement layer; client preflight prevents ordinary partial uploads.
- Completely empty browser-selected directories remain unsupported because the browser supplies no `File` entry for them.
- DOCX artifact names, Pinecone metadata, upload destinations, and search behavior must not change.
- Do not push the repository.

---

### Task 1: Shared Folder Nomenclature Model and Persistence

**Files:**
- Modify: `shared/utils/file-nomenclature.ts`
- Modify: `server/database/schema.ts`
- Create: `server/database/migrations/0029_add_folder_nomenclature.sql`
- Modify: `server/utils/db.ts`
- Test: `tests/file-nomenclature.test.mjs`
- Test: `tests/gcp-sqlite.test.mjs`

**Interfaces:**
- Produces: `validateFolderNomenclature(folderName, segments): GovernanceResult`.
- Produces: `validateFolderPathNomenclature(relativePath, segments): GovernanceResult`.
- Extends nomenclature records with `folderTemplate: string | null` and `folderSegments: NomenclatureSegment[] | null`.
- Extends `upsertNomenclature(...)` with normalized folder fields.

- [ ] **Step 1: Write failing validator and migration tests**

```js
test("validates every directory component against folder nomenclature", () => {
  const segments = [
    { key: "Brand", label: "Brand", allowedValues: ["Acme"] },
    { key: "Project", label: "Project", allowedValues: [] },
  ];
  assert.deepEqual(validateFolderPathNomenclature("Acme_Launch/Acme_Images", segments), { valid: true });
  assert.match(validateFolderPathNomenclature("Acme_Launch/Misc", segments).message, /Misc/);
});

test("folder nomenclature columns survive migrations", async () => {
  assert.equal(columns.includes("folder_template"), true);
  assert.equal(columns.includes("folder_segments"), true);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --test --test-isolation=none tests/file-nomenclature.test.mjs tests/gcp-sqlite.test.mjs`

Expected: failure because folder validators and database columns do not exist.

- [ ] **Step 3: Add minimal shared validation and additive persistence**

```ts
export const validateFolderNomenclature = (
  folderName: string,
  segments: NomenclatureSegment[],
): GovernanceResult => validateNomenclatureStem(folderName, segments, "folder");

export const validateFolderPathNomenclature = (
  relativePath: string,
  segments: NomenclatureSegment[],
): GovernanceResult => {
  for (const folderName of normalizeDirectoryComponents(relativePath)) {
    const result = validateFolderNomenclature(folderName, segments);
    if (!result.valid) return { valid: false, message: `Folder "${folderName}": ${result.message}` };
  }
  return { valid: true };
};
```

Migration SQL:

```sql
ALTER TABLE `nomenclatures` ADD `folder_template` text;
ALTER TABLE `nomenclatures` ADD `folder_segments` text;
```

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `node --test --test-isolation=none tests/file-nomenclature.test.mjs tests/gcp-sqlite.test.mjs`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the isolated model change**

```bash
git add shared/utils/file-nomenclature.ts server/database/schema.ts server/database/migrations/0029_add_folder_nomenclature.sql server/utils/db.ts tests/file-nomenclature.test.mjs tests/gcp-sqlite.test.mjs
git commit -m "feat: add folder nomenclature model"
```

### Task 2: Admin Folder Template Editor and API

**Files:**
- Modify: `server/api/nomenclature/[dept].get.ts`
- Modify: `server/api/nomenclature/[dept].put.ts`
- Modify: `server/api/nomenclature/effective.get.ts`
- Modify: `app/pages/admin/nomenclature.vue`
- Test: `tests/nomenclature-page-contract.test.mjs`
- Test: `tests/nomenclature-folder-api-contract.test.mjs`

**Interfaces:**
- Consumes: folder fields and normalization from Task 1.
- Produces: GET/PUT payload properties `folderTemplate` and `folderSegments`.
- Produces: an admin Folder naming editor with independent ordered segments and preview.

- [ ] **Step 1: Write failing API and page contract tests**

```js
test("nomenclature API persists independent folder segments", () => {
  assert.match(putSource, /folderSegments/);
  assert.match(putSource, /normalizeNomenclatureSegments\(folderSegments\)/);
  assert.match(getSource, /folderTemplate/);
});

test("admin page renders a separate folder naming editor", () => {
  assert.match(pageSource, /Folder naming/);
  assert.match(pageSource, /folderSegments/);
  assert.match(pageSource, /folderTemplatePreview/);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test --test-isolation=none tests/nomenclature-page-contract.test.mjs tests/nomenclature-folder-api-contract.test.mjs`

Expected: folder payload and editor assertions fail.

- [ ] **Step 3: Extend API normalization and the existing editor**

```ts
const normalizedFolderSegments = normalizeNomenclatureSegments(folderSegments || []);
await upsertNomenclature(
  dept,
  orgId,
  normalizedSegments.map((segment) => segment.key).join("_"),
  normalizedSegments,
  normalizedExtensions,
  normalizedFolderSegments.map((segment) => segment.key).join("_") || null,
  normalizedFolderSegments,
  user.id,
);
```

The Vue page must maintain separate `segments` and `folderSegments` refs, normalize both from API responses, render separate previews, and submit both without changing the existing extension editor.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `node --test --test-isolation=none tests/nomenclature-page-contract.test.mjs tests/nomenclature-folder-api-contract.test.mjs`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the admin/API change**

```bash
git add server/api/nomenclature app/pages/admin/nomenclature.vue tests/nomenclature-page-contract.test.mjs tests/nomenclature-folder-api-contract.test.mjs
git commit -m "feat: configure folder nomenclature"
```

### Task 3: Enforce Manual Folder Creation and Requests

**Files:**
- Create: `server/utils/folderNomenclature.ts`
- Modify: `server/api/folder/[bucket]/[id].post.ts`
- Modify: `server/api/gdrive/folder/create.post.ts`
- Modify: `server/api/folder-requests/index.post.ts`
- Modify: `server/api/folder-requests/[id].post.ts`
- Test: `tests/folder-nomenclature-enforcement-contract.test.mjs`

**Interfaces:**
- Consumes: `validateFolderNomenclature` from Task 1.
- Produces: `requireValidFolderName({ user, folderName, departmentId? }): Promise<void>`.
- Throws HTTP 400 with the shared validation message only when effective enforcement and folder segments are configured.

- [ ] **Step 1: Write failing enforcement contract tests**

```js
for (const endpoint of endpoints) {
  test(`${endpoint} enforces folder nomenclature`, () => {
    assert.match(source(endpoint), /requireValidFolderName/);
  });
}

test("approval validates the reviewer supplied final folder name", () => {
  assert.match(approvalSource, /finalFolderName/);
  assert.match(approvalSource, /requireValidFolderName/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test --test-isolation=none tests/folder-nomenclature-enforcement-contract.test.mjs`

Expected: all endpoint enforcement assertions fail.

- [ ] **Step 3: Implement one shared server policy resolver and call it at all boundaries**

```ts
export async function requireValidFolderName(input: {
  user: ApprovedUser;
  folderName: string;
  departmentId?: string | null;
}) {
  const [features, rules, nomenclature] = await Promise.all([
    getOrgFeatures(input.user.organizationId),
    getGDriveRules(input.user.organizationId),
    getNomenclatureForDept(input.user.organizationId, input.departmentId ?? input.user.departmentId),
  ]);
  const segments = Array.isArray(nomenclature?.folderSegments) ? nomenclature.folderSegments : [];
  if (features.nomenclature === false || !rules.enforceNomenclature || !segments.length) return;
  const result = validateFolderNomenclature(input.folderName, segments);
  if (!result.valid) throw createError({ status: 400, message: result.message });
}
```

Call it before storage mutation, request insertion, and approval-side folder creation.

- [ ] **Step 4: Run enforcement and existing folder-policy tests**

Run: `node --test --test-isolation=none tests/folder-nomenclature-enforcement-contract.test.mjs tests/folder-creation-policy.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit manual enforcement**

```bash
git add server/utils/folderNomenclature.ts server/api/folder server/api/gdrive/folder server/api/folder-requests tests/folder-nomenclature-enforcement-contract.test.mjs
git commit -m "feat: enforce folder naming policy"
```

### Task 4: Preflight and Enforce Nested Directory Uploads

**Files:**
- Modify: `shared/utils/folder-upload-target.ts`
- Create: `server/api/nomenclature/folder-upload-preflight.post.ts`
- Modify: `server/api/files/[bucket]/local-upload.post.ts`
- Modify: `server/api/gdrive/upload.post.ts`
- Modify: `app/components/Upload.vue`
- Modify: `app/components/NomenclatureUploadModal.vue`
- Test: `tests/folder-upload-target.test.mjs`
- Test: `tests/folder-upload-nomenclature-contract.test.mjs`

**Interfaces:**
- Produces: `getUploadDirectoryPaths(files): string[]`, returning unique parent directory paths in parent-first order.
- Produces: preflight body `{ paths: string[], departmentId?: string, destinationFolderId?: string }`.
- Preflight returns `{ valid: true }` or HTTP 400 `{ message, violations: { path, message }[] }`.

- [ ] **Step 1: Write failing directory derivation and endpoint contract tests**

```js
test("derives every unique parent directory from uploaded file paths", () => {
  assert.deepEqual(getUploadDirectoryPaths([
    "Acme_Launch/Acme_Images/logo.png",
    "Acme_Launch/Acme_Docs/brief.docx",
  ]), ["Acme_Launch", "Acme_Launch/Acme_Images", "Acme_Launch/Acme_Docs"]);
});

test("both upload endpoints validate relative folder paths server-side", () => {
  assert.match(localUploadSource, /requireValidFolderPath/);
  assert.match(driveUploadSource, /requireValidFolderPath/);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs tests/folder-upload-nomenclature-contract.test.mjs`

Expected: helper/export and enforcement assertions fail.

- [ ] **Step 3: Implement path derivation, preflight, and server backstops**

```ts
const directoryPaths = getUploadDirectoryPaths(
  files.map((file) => file.customPath || file.webkitRelativePath || file.name),
);
if (directoryPaths.length) {
  await $fetch("/api/nomenclature/folder-upload-preflight", {
    method: "POST",
    body: { paths: directoryPaths, departmentId: selectedDepartmentId, destinationFolderId },
  });
}
```

The preflight loads the authorized effective policy and validates every path component. Local and Drive upload endpoints validate their incoming `relativePath` before creating any intermediate directory.

- [ ] **Step 4: Run upload tests and confirm GREEN**

Run: `node --test --test-isolation=none tests/folder-upload-target.test.mjs tests/folder-upload-nomenclature-contract.test.mjs tests/department-upload.test.mjs tests/drop-files-dispatch.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit directory upload governance**

```bash
git add shared/utils/folder-upload-target.ts server/api/nomenclature/folder-upload-preflight.post.ts server/api/files server/api/gdrive/upload.post.ts app/components/Upload.vue app/components/NomenclatureUploadModal.vue tests/folder-upload-target.test.mjs tests/folder-upload-nomenclature-contract.test.mjs
git commit -m "feat: validate uploaded folder trees"
```

### Task 5: Repair DOCX RAG Dependency Handling

**Files:**
- Modify: `server/utils/rag_parsers/requirements.txt`
- Modify: `server/utils/rag_parsers/processor.py`
- Create: `tests/docx-rag-contract.test.mjs`

**Interfaces:**
- Keeps: `route_file(file_path, ".docx") -> { output_path, input_tokens, output_tokens, cost }`.
- Produces: actionable `RuntimeError` naming `python-docx` when `docx` cannot import.

- [ ] **Step 1: Write failing dependency contract tests**

```js
test("RAG requirements declare python-docx", () => {
  assert.match(requirements, /^python-docx(?:[<>=].*)?$/m);
});

test("DOCX route reports its missing dependency clearly", () => {
  assert.match(processor, /DOCX RAG dependency/);
  assert.match(processor, /python-docx/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test --test-isolation=none tests/docx-rag-contract.test.mjs`

Expected: both assertions fail.

- [ ] **Step 3: Declare and guard the dependency**

```text
python-docx>=1.2.0
```

```py
try:
    from parse_docx import extract_text_from_docx, extract_images_from_docx
except ModuleNotFoundError as exc:
    raise RuntimeError(
        "DOCX RAG dependency 'python-docx' is missing. Install server/utils/rag_parsers/requirements.txt with the same Python used by the app."
    ) from exc
```

- [ ] **Step 4: Install requirements with the active application Python and verify imports**

Run: `python -m pip install -r server/utils/rag_parsers/requirements.txt`

Run: `python -c "import docx; print(docx.__version__)"`

Expected: import succeeds and prints an installed version.

- [ ] **Step 5: Run DOCX contract tests and commit**

Run: `node --test --test-isolation=none tests/docx-rag-contract.test.mjs`

Expected: all tests pass.

```bash
git add server/utils/rag_parsers/requirements.txt server/utils/rag_parsers/processor.py tests/docx-rag-contract.test.mjs
git commit -m "fix: restore docx rag dependency"
```

### Task 6: Full Verification and Handoff

**Files:**
- Verify all files changed by Tasks 1-5.

**Interfaces:**
- Confirms the complete implementation against the approved design.

- [ ] **Step 1: Run the entire repository test suite**

Run: `npm.cmd run verify:gcp`

Expected: every test passes with zero failures.

- [ ] **Step 2: Run whitespace and production compilation checks**

Run: `git diff --check`

Run: `node_modules/.bin/nuxt.cmd build`

Expected: no whitespace errors and Nuxt exits successfully. If the existing NuxtHub migration cleanup race or startup stall recurs, record the exact output without claiming a successful build.

- [ ] **Step 3: Review the scoped diff and working tree**

Run: `git status --short`

Run: `git diff --stat HEAD~5..HEAD`

Expected: only intended feature files are committed; pre-existing unrelated dirty files remain untouched.

- [ ] **Step 4: Report behavior and remaining limitations**

Report the admin steps to configure file and folder naming, the all-or-nothing browser preflight behavior, the server enforcement boundaries, DOCX deployment dependency, verification evidence, and the browser limitation for completely empty directories.
