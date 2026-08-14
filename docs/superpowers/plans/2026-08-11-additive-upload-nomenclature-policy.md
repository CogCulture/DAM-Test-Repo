# Additive Upload Nomenclature Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and harden the existing administrator-configurable nomenclature workflow without rewriting the working upload implementation.

**Architecture:** Treat the current nomenclature editor, wizard, shared validator, and upload endpoints as protected production code. Add contract and integration-coverage files first; modify protected code only if a new test fails because the requested behavior is genuinely absent, and stop for explicit approval before making that integration edit.

**Tech Stack:** Nuxt 3, Vue 3, Nitro/H3, TypeScript, Node test runner, existing Drizzle/SQLite policy storage.

## Global Constraints

- Do not refactor or replace existing upload, folder, Google Drive, RAG, search, preview, permission, or nomenclature modules.
- Add tests and verification artifacts without changing production behavior when the requested capability already passes.
- If a required behavior fails, report the exact failure before changing an existing production file.
- Guided filename correction remains the user experience; strict server validation remains authoritative.
- Enforcement applies to administrators, department heads, and members.

---

### Task 1: Complete nomenclature-policy contract coverage

**Files:**
- Modify: `tests/file-nomenclature.test.mjs`
- Test: `shared/utils/file-nomenclature.ts`

**Interfaces:**
- Consumes: `validateFileNomenclature(filename, segments)`, `validateFileExtension(filename, allowedExtensions)`, and `evaluateUploadGovernance(input)`.
- Produces: executable proof for arbitrary ordered templates, free-text segments, restricted values, extension rules, and actionable rejection messages.

- [ ] **Step 1: Add the four-segment business example**

Add this test before changing production code:

```js
test("supports an administrator-defined Brand_Project_MediaType_Version policy", () => {
  const policy = [
    { key: "Brand", label: "Brand", allowedValues: ["Acme"] },
    { key: "Project", label: "Project", allowedValues: [] },
    { key: "MediaType", label: "Media type", allowedValues: ["Video", "Image"] },
    { key: "Version", label: "Version", allowedValues: [] },
  ];
  assert.deepEqual(validateFileNomenclature("Acme_Launch_Video_v2.mp4", policy), { valid: true });
});
```

- [ ] **Step 2: Add strict rejection cases**

```js
test("rejects wrong shapes and administrator-restricted values", () => {
  const policy = [
    { key: "Brand", label: "Brand", allowedValues: ["Acme"] },
    { key: "MediaType", label: "Media type", allowedValues: ["Video"] },
  ];
  assert.match(validateFileNomenclature("Acme.pdf", policy).message, /Brand_MediaType/);
  assert.match(validateFileNomenclature("Other_Video.pdf", policy).message, /Brand/);
  assert.match(validateFileNomenclature("Acme_Image.pdf", policy).message, /Media type/);
});
```

- [ ] **Step 3: Run the focused contract tests**

Run:

```powershell
node --test --test-isolation=none tests/file-nomenclature.test.mjs tests/upload-governance.test.mjs
```

Expected: every test passes against the protected shared validator. If a test fails, stop and report the missing behavior before editing `shared/utils/file-nomenclature.ts`.

- [ ] **Step 4: Commit the additive coverage**

```powershell
git add -- tests/file-nomenclature.test.mjs
git commit -m "test: cover configurable upload nomenclature"
```

### Task 2: Prove every upload entry point retains server enforcement

**Files:**
- Create: `tests/nomenclature-integration-contract.test.mjs`
- Test: `server/api/gdrive/upload.post.ts`
- Test: `server/api/gdrive/import-url.post.ts`
- Test: `server/api/files/[bucket]/local-upload.post.ts`
- Test: `server/api/files/[bucket]/import-url.post.ts`

**Interfaces:**
- Consumes: each existing endpoint's call to `evaluateUploadGovernance` and its rejection before storage.
- Produces: a regression alarm if a future edit removes policy enforcement from any supported upload path.

- [ ] **Step 1: Add a source integration contract**

Create a test that reads the four endpoint modules and requires both the shared validator import and a validation call:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const endpoints = [
  "../server/api/gdrive/upload.post.ts",
  "../server/api/gdrive/import-url.post.ts",
  "../server/api/files/[bucket]/local-upload.post.ts",
  "../server/api/files/[bucket]/import-url.post.ts",
];

for (const endpoint of endpoints) {
  test(`${endpoint} enforces the shared nomenclature policy`, () => {
    const source = readFileSync(new URL(endpoint, import.meta.url), "utf8");
    assert.match(source, /evaluateUploadGovernance/);
    assert.match(source, /throw createError\(\{ status: 422/);
  });
}
```

- [ ] **Step 2: Run the integration contract**

Run:

```powershell
node --test --test-isolation=none tests/nomenclature-integration-contract.test.mjs
```

Expected: four tests pass. If an endpoint is missing enforcement, stop and report that endpoint before editing it.

- [ ] **Step 3: Commit the additive integration coverage**

```powershell
git add -- tests/nomenclature-integration-contract.test.mjs
git commit -m "test: protect upload nomenclature enforcement"
```

### Task 3: Verify the protected feature end to end

**Files:**
- Modify only a new test if verification itself needs correction.

**Interfaces:**
- Verifies: administrator configuration, guided correction, strict rejection, and compatibility with the existing application.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
npm.cmd run verify:gcp
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run production compilation**

Run:

```powershell
pnpm.cmd run build
```

Expected: Nuxt and Nitro build successfully with exit code 0.

- [ ] **Step 3: Validate the authenticated administrator flow**

At `/admin/nomenclature`:

1. Select a department.
2. Configure `Brand_Project_MediaType_Version`.
3. Restrict Brand to `Acme`, MediaType to `Video` and `Image`, and extension to `mp4`.
4. Enable enforcement and save.
5. Open the upload wizard with `wrong-name.mp4` and confirm it presents four fields and a compliant preview.
6. Confirm upload is disabled while a required free-text value is empty.
7. Upload `Acme_Launch_Video_v2.mp4` through the wizard and confirm it appears in the selected folder.
8. Submit an invalid direct upload and confirm the server returns `422` and no file appears.

- [ ] **Step 4: Report the protected-code result**

If every check passes, report that the requested feature was already implemented and is now regression-protected without production-code changes. If any check fails, report the exact gap and request permission for the smallest existing-file edit needed to correct it.
