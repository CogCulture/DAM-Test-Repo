# DAM Five-Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and verify universal nomenclature enforcement, folder approval, hierarchical access control, actual-file link import, and deterministic duplicate handling across DAM storage backends.

**Architecture:** Centralize governance and collision decisions in pure shared utilities, then make each server ingestion route use those utilities before backend-specific persistence. Keep authorization and department scoping at API boundaries, and make the Vue UI a faithful client of server-enforced behavior rather than a security boundary.

**Tech Stack:** Nuxt 3, Nitro/H3, TypeScript, Vue 3, Drizzle ORM, SQLite/Cloudflare D1, local blob/BYOS, Google Drive API, Node test runner.

## Global Constraints

- Preserve unrelated and overlapping uncommitted work in the current feature branch.
- Nomenclature and extension enforcement applies to every role, including `admin` and `dept_head`.
- Link import stores the actual source bytes in managed organization storage; shortcut-only records are forbidden.
- Server endpoints are the authorization boundary; UI checks do not replace server checks.
- Filename checks are case-insensitive within a destination folder and never deduplicate across organizations.
- Implement production behavior only after a focused test has failed for the intended missing behavior.

---

### Task 1: Shared governance, collision, hierarchy, and URL-safety rules

**Files:**
- Modify: `shared/utils/file-collision.ts`
- Modify: `shared/utils/access-control.ts`
- Create: `shared/utils/file-nomenclature.ts`
- Create: `shared/utils/remote-file-url.ts`
- Modify: `tests/file-collision.test.mjs`
- Modify: `tests/access-control.test.mjs`
- Create: `tests/file-nomenclature.test.mjs`
- Create: `tests/remote-file-url.test.mjs`

**Interfaces:**
- Produces: `stripCollisionSuffix(filename: string): string`
- Produces: `planFileUpload(input): FileUploadPlan` where duplicate content derives `finalName` from the canonical existing file name.
- Produces: `normalizeAllowedExtensions(values): string[] | null`, `validateFileNomenclature(...)`, and `validateFileExtension(...)`.
- Produces: `canManageUser(actor, target, requestedRole, requestedDepartmentId)` for privilege-escalation checks.
- Produces: `validateRemoteFileUrl(url, resolvedAddresses)` and address-range predicates for SSRF protection.

- [ ] **Step 1: Add failing collision tests**

```js
test("names identical content after the canonical file", () => {
  const result = planFileUpload({
    requestedName: "invoice-v2.pdf",
    existingNames: ["invoice.pdf"],
    contentMatch: { id: "f1", name: "invoice.pdf", storagePath: "org/invoice.pdf" },
  });
  assert.equal(result.finalName, "invoice (1).pdf");
});

test("does not stack an existing numeric suffix", () => {
  assert.equal(stripCollisionSuffix("Report (1).pdf"), "Report.pdf");
});
```

- [ ] **Step 2: Run collision tests and verify the new expectations fail**

Run: `node --experimental-strip-types --test tests/file-collision.test.mjs`
Expected: FAIL because canonical naming and suffix stripping are not implemented.

- [ ] **Step 3: Implement minimal collision behavior**

Update `planFileUpload` so a content match chooses the canonical match name as the collision base and passes it through the case-insensitive next-name resolver. Export suffix stripping and use it before adding ` (n)`.

- [ ] **Step 4: Add failing nomenclature, hierarchy, and URL-safety tests**

```js
test("normalizes extensions without dots and duplicates", () => {
  assert.deepEqual(normalizeAllowedExtensions([".PDF", "pdf", " jpg "]), ["pdf", "jpg"]);
});

test("rejects an extension outside the allow-list", () => {
  assert.equal(validateFileExtension("asset.exe", ["pdf"]).valid, false);
});

test("a department head cannot assign admin", () => {
  assert.equal(canManageUser(deptHead, teamMember, "admin", "design").allowed, false);
});

test("rejects metadata and loopback destinations", () => {
  assert.equal(validateRemoteFileUrl("http://169.254.169.254/latest", ["169.254.169.254"]).valid, false);
  assert.equal(validateRemoteFileUrl("http://localhost/file", ["127.0.0.1"]).valid, false);
});
```

- [ ] **Step 5: Run the new focused tests and verify RED**

Run: `node --experimental-strip-types --test tests/file-nomenclature.test.mjs tests/access-control.test.mjs tests/remote-file-url.test.mjs`
Expected: FAIL because the new interfaces do not exist.

- [ ] **Step 6: Implement the pure rule modules and rerun focused tests**

Run the same command.
Expected: PASS with canonical literals, invalid extensions, privilege escalation, loopback, private, link-local, and IPv6-local cases covered.

### Task 2: Persist and universally enforce nomenclature and extensions

**Files:**
- Modify: `server/database/schema.ts`
- Create: `server/database/migrations/0027_add_nomenclature_extensions.sql`
- Modify: `server/database/migrations/meta/_journal.json`
- Modify: `server/utils/db.ts`
- Modify: `server/utils/nomenclature.ts`
- Modify: `server/api/nomenclature/[dept].get.ts`
- Modify: `server/api/nomenclature/[dept].put.ts`
- Modify: `server/routes/upload/[bucket]/[id]/[action]/[...pathname].ts`
- Modify: `server/api/files/[bucket]/local-upload.post.ts`
- Modify: `server/api/gdrive/upload.post.ts`
- Modify: `app/pages/admin/nomenclature.vue`
- Modify: `app/components/Upload.vue`
- Create: `tests/upload-governance.test.mjs`

**Interfaces:**
- Consumes: shared nomenclature normalization and validation from Task 1.
- Produces: `allowedExtensions: string[] | null` in schema and nomenclature API responses.
- Produces: a pure `evaluateUploadGovernance(...)` helper used by local, BYOS, Drive, and URL ingestion.

- [ ] **Step 1: Write failing universal-enforcement tests**

```js
for (const role of ["admin", "dept_head", "team_member"]) {
  test(`${role} cannot bypass an enabled naming rule`, () => {
    assert.equal(evaluateUploadGovernance({ role, filename: "wrong.pdf", enabled: true, segments }).valid, false);
  });
}
```

- [ ] **Step 2: Run the governance test and verify RED**

Run: `node --experimental-strip-types --test tests/upload-governance.test.mjs`
Expected: FAIL because the shared evaluator does not exist.

- [ ] **Step 3: Add schema, migration, CRUD normalization, and shared evaluator**

The PUT API accepts `{ template, segments, allowedExtensions }`; it stores normalized lowercase extensions or `null`. The GET fallback includes `allowedExtensions: null`. No evaluator branch checks the uploader's role.

- [ ] **Step 4: Wire every existing upload route to the evaluator**

Validate the requested name before persistence and the numbered final name after collision resolution. Return HTTP 422 and clean up any just-written object on failure.

- [ ] **Step 5: Add the extension editor and aligned client feedback**

The admin page edits extensions as normalized tags/text values. Upload UI displays server validation and final-name results; it does not bypass administrators or department heads.

- [ ] **Step 6: Run governance and collision tests**

Run: `node --experimental-strip-types --test tests/file-nomenclature.test.mjs tests/upload-governance.test.mjs tests/file-collision.test.mjs`
Expected: PASS.

### Task 3: Complete the folder-request workflow

**Files:**
- Modify: `server/database/schema.ts`
- Create: `server/database/migrations/0028_complete_folder_requests.sql`
- Modify: `server/utils/db.ts`
- Modify: `shared/utils/folder-creation-policy.ts`
- Modify: `server/api/folder-requests/index.post.ts`
- Modify: `server/api/folder-requests/index.get.ts`
- Modify: `server/api/folder-requests/[id].post.ts`
- Modify: `server/api/folder/[bucket]/[id].post.ts`
- Modify: `server/api/gdrive/folder/create.post.ts`
- Modify: `app/components/NewFile.vue`
- Modify: `app/pages/admin/folder-requests.vue`
- Modify: `tests/folder-creation-policy.test.mjs`

**Interfaces:**
- Consumes: `resolveFolderCreationMode` and case-insensitive collision resolution.
- Produces: requester-visible decision state including `reviewNote`, `reviewedBy`, `reviewedAt`, and `finalFolderName`.

- [ ] **Step 1: Add failing tests for duplicate requests and stale decisions**

```js
test("pending requests compare names case-insensitively", () => {
  assert.equal(isDuplicatePendingFolderRequest("Campaign", ["campaign"]), true);
});

test("only a pending request can transition", () => {
  assert.equal(canTransitionFolderRequest("approved", "reject"), false);
});
```

- [ ] **Step 2: Run folder-policy tests and verify RED**

Run: `node --experimental-strip-types --test tests/folder-creation-policy.test.mjs`
Expected: FAIL because duplicate and transition helpers do not exist.

- [ ] **Step 3: Implement request creation, scoped listing, and atomic review rules**

Reject a duplicate pending request with 409. Admins can review any organization request; department heads can review only their department. Persist the review result only after successful folder creation, and reject repeated decisions with 409.

- [ ] **Step 4: Handle approval-time name collisions**

Resolve the actual folder name at approval time and store it as `finalFolderName`, for both local/BYOS and Google Drive destinations.

- [ ] **Step 5: Update requester and reviewer UI states**

Lower roles submit requests; direct create remains limited to admin and department head. Queue and status views expose decision notes and final folder names.

- [ ] **Step 6: Run folder tests**

Run: `node --experimental-strip-types --test tests/folder-creation-policy.test.mjs`
Expected: PASS.

### Task 4: Enforce hierarchy and granular permissions at mutation boundaries

**Files:**
- Modify: `shared/utils/access-control.ts`
- Modify: `server/api/admin/users/[id].put.ts`
- Modify: `server/utils/permission.ts`
- Modify: relevant mutating routes under `server/api/files/[bucket]/`
- Modify: `server/api/admin/access-control.get.ts`
- Modify: `server/api/admin/access-control.put.ts`
- Modify: `app/pages/admin/access-control.vue`
- Modify: `tests/access-control.test.mjs`

**Interfaces:**
- Consumes: `canManageUser`, `resolvePermission`, `requireFilePermission`, and department access guards.
- Produces: validated role updates and consistent permission checks for upload, folder creation, rename, move, delete, share, publish, metadata, and RAG operations.

- [ ] **Step 1: Expand failing hierarchy tests**

Cover cross-organization targets, cross-department department-head edits, peer/higher-rank edits, invalid roles, and admin success.

- [ ] **Step 2: Run access-control tests and verify RED**

Run: `node --experimental-strip-types --test tests/access-control.test.mjs`
Expected: FAIL on the new hierarchy cases.

- [ ] **Step 3: Guard user updates before database mutation**

Load the target user, validate organization, actor rank, requested rank, and department scope, then update only validated `role` and `departmentId` values.

- [ ] **Step 4: Audit all file mutation endpoints**

Map each action to its permission key and require both the effective permission and accessible department before performing storage or database changes.

- [ ] **Step 5: Align the admin access-control API and page**

Validate payload keys against `FILE_PERMISSION_KEYS`; preserve nullable user overrides and make the role/department hierarchy visible in one screen.

- [ ] **Step 6: Run access-control tests**

Run: `node --experimental-strip-types --test tests/access-control.test.mjs`
Expected: PASS.

### Task 5: Import actual files from safe links through the shared pipeline

**Files:**
- Create: `server/utils/remoteFile.ts`
- Create: `server/api/files/[bucket]/import-url.post.ts`
- Create: `server/api/gdrive/import-url.post.ts`
- Modify or remove shortcut behavior from: `server/api/files/[bucket]/gdrive-link.post.ts`
- Modify: `server/utils/gdrive.ts`
- Replace behavior in: `app/components/GoogleDriveLinkImport.vue`
- Modify: `app/components/Upload.vue`
- Modify: `tests/remote-file-url.test.mjs`
- Create: `tests/remote-file-response.test.mjs`

**Interfaces:**
- Consumes: URL safety, upload governance, hash/collision planning, and backend storage adapters.
- Produces: `fetchRemoteFile({ url, maxBytes, timeoutMs, resolveHost, fetchImpl })` returning `{ bytes, filename, contentType, finalUrl }`.
- Produces: POST bodies `{ url, parentId, filename? }` and standard upload result metadata.

- [ ] **Step 1: Add failing remote-response tests**

Test filename derivation, missing length, declared oversize, streamed oversize, unsafe redirect, redirect limit, timeout, and successful bounded bytes.

- [ ] **Step 2: Run remote-file tests and verify RED**

Run: `node --experimental-strip-types --test tests/remote-file-url.test.mjs tests/remote-file-response.test.mjs`
Expected: FAIL because bounded fetching is not implemented.

- [ ] **Step 3: Implement the bounded fetcher**

Use manual redirects so every hop is revalidated. Resolve and reject unsafe addresses before each request. Abort on timeout and while streaming beyond `maxBytes`. Sanitize the derived filename.

- [ ] **Step 4: Implement local/BYOS actual-byte import**

Require upload and department access, fetch bytes, run governance and collision planning, persist through the configured backend, insert the file record, and compensate on failure.

- [ ] **Step 5: Implement Google Drive actual-file import**

For recognizable Drive links, use authenticated Drive metadata/content or `files.copy` into the selected folder. For generic public links, use the bounded fetcher and upload the buffer to Drive. Apply the same governance and collision result.

- [ ] **Step 6: Replace shortcut UI/API behavior**

The modal says “Import from link,” calls the appropriate import endpoint, and reports the final managed filename. No `.gdrive-link` object or internet shortcut is created.

- [ ] **Step 7: Run remote import and shared policy tests**

Run: `node --experimental-strip-types --test tests/remote-file-url.test.mjs tests/remote-file-response.test.mjs tests/file-collision.test.mjs tests/upload-governance.test.mjs`
Expected: PASS.

### Task 6: Full verification and live feature-test links

**Files:**
- Modify only files required by verification findings.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a running local Nuxt instance and direct URLs for nomenclature, folder approvals, access control, and the DAM upload surface.

- [ ] **Step 1: Run all unit tests**

Run: `node --experimental-strip-types --test tests/*.test.mjs`
Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint and production build**

Run: `pnpm lint`
Expected: zero new lint errors in feature files.

Run: `pnpm build`
Expected: exit code 0.

- [ ] **Step 3: Start the local app with required local environment values**

Run the Nuxt dev server on an unused loopback port and wait until `/auth/signin` responds.

- [ ] **Step 4: Perform browser smoke tests**

Verify desktop and mobile rendering for `/auth/signin`; after signing in with an available local test account, verify `/admin/nomenclature`, `/admin/folder-requests`, `/admin/access-control`, and `/org` upload/import controls. If authentication data is unavailable, provide the reachable URLs and state the sign-in prerequisite explicitly.

- [ ] **Step 5: Report exact live URLs and verification evidence**

Include the loopback base URL, each direct feature URL, test/build results, and any external prerequisite such as Google OAuth or a public test file URL.
