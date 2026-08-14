# Department-Targeted Google Drive Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make device uploads visibly reliable and allow an authorized department to be selected as the real Google Drive destination.

**Architecture:** Put destination filtering and resolution in a pure shared utility, expose safe authorized options through a read endpoint, and let the upload endpoint resolve department IDs to Drive folder IDs server-side. Reuse the selected destination in both governed and ungoverned upload clients, and keep the last successful file list visible during Drive refreshes.

**Tech Stack:** Nuxt 3, Vue 3, Nitro API handlers, Drizzle ORM, Google Drive API, Node test runner.

## Global Constraints

- Modify only upload destination selection, upload authorization/routing, upload progress, and post-upload refresh behavior.
- Do not modify Search, RAG, previews, sharing, publishing, renaming, deletion, favorites, or unrelated workspace behavior.
- Never expose a department's `gdriveFolderId` to the browser.
- Admins may select organization root or any department in their organization.
- Other users may select only departments in their effective `accessibleDepartmentIds`.
- An unavailable department mapping must fail closed; it must not fall back to organization root.
- Preserve existing root/current-route upload behavior when no explicit department is selected.

---

### Task 1: Pure destination authorization and routing

**Files:**
- Create: `shared/utils/department-upload.ts`
- Create: `tests/department-upload.test.mjs`

**Interfaces:**
- Consumes: department rows `{ id, organizationId, name, gdriveFolderId }` and actor scope `{ role, organizationId, accessibleDepartmentIds }`.
- Produces: `buildDepartmentUploadOptions(input): UploadDestination[]` and `resolveDepartmentUploadTarget(input): { departmentId, departmentName, gdriveFolderId }`.

- [ ] **Step 1: Write failing authorization and resolution tests**

```js
test("admins receive root and every organization department without Drive IDs", async () => {
  const options = buildDepartmentUploadOptions({ actor: admin, departments });
  assert.deepEqual(options.map(({ id, available }) => ({ id, available })), [
    { id: "root", available: true },
    { id: "finance", available: true },
    { id: "hr", available: false },
  ]);
  assert.equal("gdriveFolderId" in options[1], false);
});

test("members receive only accessible departments", async () => {
  const options = buildDepartmentUploadOptions({
    actor: { ...member, accessibleDepartmentIds: ["finance"] },
    departments,
  });
  assert.deepEqual(options.map((option) => option.id), ["finance"]);
});

test("an unavailable mapping fails without root fallback", async () => {
  assert.throws(
    () => resolveDepartmentUploadTarget({ actor: admin, departments, departmentId: "hr" }),
    /not connected to Google Drive/i,
  );
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test --test-isolation=none tests/department-upload.test.mjs`

Expected: FAIL because `shared/utils/department-upload.ts` does not exist.

- [ ] **Step 3: Implement the pure utility**

```ts
export type UploadDestination = {
  id: "root" | string;
  name: string;
  type: "organization" | "department";
  available: boolean;
  unavailableReason?: string;
};

export const buildDepartmentUploadOptions = ({ actor, departments }) => {
  const visible = actor.role === "admin"
    ? departments
    : departments.filter((department) => actor.accessibleDepartmentIds.includes(department.id));
  return [
    ...(actor.role === "admin" ? [{ id: "root", name: "Organization root", type: "organization", available: true }] : []),
    ...visible.map(toSafeOption),
  ];
};
```

`resolveDepartmentUploadTarget` must verify organization equality, effective access, and a non-empty mapping before returning the server-only folder ID.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --test-isolation=none tests/department-upload.test.mjs`

Expected: all department-upload tests pass.

### Task 2: Safe destination API and server-side Drive routing

**Files:**
- Create: `server/api/gdrive/upload-destinations.get.ts`
- Modify: `server/api/gdrive/upload.post.ts`
- Modify: `server/utils/db.ts` only if an existing exported department query cannot supply the required rows.
- Test: `tests/department-upload.test.mjs`

**Interfaces:**
- Consumes: Task 1 option builder/resolver, `requireFilePermission(event, "canUpload")`, `getOrgDepartments(orgId)`.
- Produces: `GET /api/gdrive/upload-destinations` and upload responses with `{ destination: { id, name, route } }`.

- [ ] **Step 1: Extend the failing tests for explicit precedence and governance scope**

```js
test("explicit department routing wins over a raw parent id", () => {
  const target = resolveDepartmentUploadTarget({ actor: admin, departments, departmentId: "finance" });
  assert.equal(target.gdriveFolderId, "drive-finance");
});

test("cross-organization and inaccessible departments are rejected", () => {
  assert.throws(() => resolveDepartmentUploadTarget({ actor: member, departments, departmentId: "hr" }), /access/i);
});
```

- [ ] **Step 2: Run focused tests and verify RED for the new cases**

Run: `node --test --test-isolation=none tests/department-upload.test.mjs`

Expected: the new assertions fail until all target validation is implemented.

- [ ] **Step 3: Add the safe read endpoint**

```ts
export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canUpload");
  const departments = await getOrgDepartments(user.organizationId);
  return buildDepartmentUploadOptions({ actor: user, departments });
});
```

- [ ] **Step 4: Route explicit departments in the upload endpoint**

Read `departmentId` from the query. When it is present and not `root`, call `resolveDepartmentUploadTarget`, use its `gdriveFolderId` as `parentId`, and call `getNomenclatureForDept(orgId, departmentId)`. Ignore a conflicting raw `parentId`. Return a safe route such as `/org/${encodeURIComponent(gdriveFolderId)}` without adding the Drive ID to the destination-list endpoint.

- [ ] **Step 5: Run focused and complete server tests**

Run: `npm run verify:gcp`

Expected: all tests pass, including the new destination cases.

### Task 3: Destination selector shared by governed and ungoverned uploads

**Files:**
- Modify: `app/components/Upload.vue`
- Modify: `app/components/NomenclatureUploadModal.vue`

**Interfaces:**
- Consumes: `GET /api/gdrive/upload-destinations` and Task 2 upload query/response.
- Produces: selected `departmentId`, visible destination/progress labels, and post-success navigation.

- [ ] **Step 1: Add a failing upload URL contract test**

Add a real behavior assertion for `buildDriveUploadUrl({ parentId, relativePath, departmentId })`. Require the returned URL to encode and include all three values. Both Vue upload paths must consume this tested builder so removing department forwarding breaks their shared boundary contract.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-isolation=none tests/department-upload.test.mjs`

Expected: FAIL because neither component currently forwards an explicit department.

- [ ] **Step 3: Add the selector and upload-state copy**

Load options only for Drive organizations. Bind a `USelect` to `selectedDestinationId`, disable unavailable items, preserve current defaults, and render `Uploading to <name>` followed by `Syncing with Google Drive`. Keep file and folder picker behavior unchanged.

- [ ] **Step 4: Forward destination through both upload paths**

Append `departmentId` to both Google Drive upload URLs. Pass the selected destination into `NomenclatureUploadModal`. After a successful batch, refresh the file/sidebar state and navigate to `response.destination.route` when the selection is a department.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test --test-isolation=none tests/department-upload.test.mjs`

Expected: component contracts pass.

### Task 4: Preserve existing cards during Drive refresh and verify end to end

**Files:**
- Modify: `app/composables/useFiles.ts`
- Modify: `shared/utils/department-upload.ts`
- Test: `tests/department-upload.test.mjs`

**Interfaces:**
- Consumes: `replaceFetchedFiles(current, incoming, reset)`.
- Produces: stable current cards until the replacement page succeeds.

- [ ] **Step 1: Write the failing list-replacement test**

```js
test("a reset keeps current cards until replacement data arrives", () => {
  assert.deepEqual(replaceFetchedFiles([{ id: "old" }], [], { pending: true }), [{ id: "old" }]);
  assert.deepEqual(replaceFetchedFiles([{ id: "old" }], [{ id: "new" }], { pending: false, reset: true }), [{ id: "new" }]);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test --test-isolation=none tests/department-upload.test.mjs`

Expected: FAIL because `replaceFetchedFiles` is not implemented.

- [ ] **Step 3: Implement stable replacement semantics**

Do not assign `files.value = []` when a reset begins. Replace the array only after the first reset response succeeds; append only for later pagination pages. Ignore stale responses with a monotonically increasing request token.

- [ ] **Step 4: Run all automated tests**

Run: `npm run verify:gcp`

Expected: all tests pass with no failures.

- [ ] **Step 5: Run browser verification**

Upload a uniquely named small file to Finance. Verify existing cards remain visible, the UI says `Uploading to Finance`, the file appears under Finance in the DAM, and the Drive-backed route contains the returned file. Move the test artifact to Trash and verify the original workspace assets remain unchanged.

- [ ] **Step 6: Review the final diff scope**

Run: `git diff -- shared/utils/department-upload.ts tests/department-upload.test.mjs server/api/gdrive/upload-destinations.get.ts server/api/gdrive/upload.post.ts app/components/Upload.vue app/components/NomenclatureUploadModal.vue app/composables/useFiles.ts`

Expected: only the approved upload files and tests contain implementation changes.
