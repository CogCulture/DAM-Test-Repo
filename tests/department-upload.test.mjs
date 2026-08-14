import assert from "node:assert/strict";
import test from "node:test";

const {
  buildDepartmentUploadOptions,
  buildDriveUploadUrl,
  resolveDriveUploadParent,
  resolveDepartmentUploadTarget,
  replaceFetchedFiles,
} = await import("../shared/utils/department-upload.ts");

const organizationId = "org-1";
const admin = {
  role: "admin",
  organizationId,
  accessibleDepartmentIds: [],
};
const member = {
  role: "team_member",
  organizationId,
  accessibleDepartmentIds: ["finance"],
};
const departments = [
  {
    id: "finance",
    organizationId,
    name: "Finance",
    gdriveFolderId: "drive-finance",
  },
  {
    id: "hr",
    organizationId,
    name: "HR",
    gdriveFolderId: null,
  },
  {
    id: "other-org",
    organizationId: "org-2",
    name: "Other",
    gdriveFolderId: "drive-other",
  },
];

test("admins receive root and every organization department without Drive IDs", () => {
  const options = buildDepartmentUploadOptions({ actor: admin, departments });

  assert.deepEqual(
    options.map(({ id, available }) => ({ id, available })),
    [
      { id: "root", available: true },
      { id: "finance", available: true },
      { id: "hr", available: false },
    ],
  );
  assert.equal("gdriveFolderId" in options[1], false);
});

test("members receive only effectively accessible departments", () => {
  const options = buildDepartmentUploadOptions({ actor: member, departments });

  assert.deepEqual(options.map((option) => option.id), ["finance"]);
});

test("a department without a Drive mapping fails without root fallback", () => {
  assert.throws(
    () => resolveDepartmentUploadTarget({ actor: admin, departments, departmentId: "hr" }),
    /not connected to Google Drive/i,
  );
});

test("explicit department resolution returns the mapped Drive folder", () => {
  const target = resolveDepartmentUploadTarget({
    actor: admin,
    departments,
    departmentId: "finance",
  });

  assert.deepEqual(target, {
    departmentId: "finance",
    departmentName: "Finance",
    gdriveFolderId: "drive-finance",
  });
});

test("inaccessible and cross-organization departments are rejected", () => {
  assert.throws(
    () => resolveDepartmentUploadTarget({ actor: member, departments, departmentId: "hr" }),
    /access/i,
  );
  assert.throws(
    () => resolveDepartmentUploadTarget({ actor: admin, departments, departmentId: "other-org" }),
    /not found/i,
  );
});

test("an explicit department target takes precedence over a raw parent id", () => {
  assert.equal(resolveDriveUploadParent({
    rawParentId: "untrusted-client-parent",
    departmentTarget: {
      departmentId: "finance",
      departmentName: "Finance",
      gdriveFolderId: "drive-finance",
    },
  }), "drive-finance");
  assert.equal(resolveDriveUploadParent({
    rawParentId: "current-route-folder",
    departmentTarget: null,
  }), "current-route-folder");
});

test("the Drive upload URL carries the selected department and encoded file path", () => {
  assert.equal(
    buildDriveUploadUrl({
      parentId: "route folder",
      relativePath: "briefs/Q3 plan.pdf",
      departmentId: "finance/team",
    }),
    "/api/gdrive/upload?parentId=route%20folder&relativePath=briefs%2FQ3%20plan.pdf&departmentId=finance%2Fteam",
  );
});

test("the Drive upload URL carries an explicit nested folder independently of department policy", () => {
  assert.equal(
    buildDriveUploadUrl({
      parentId: "route-folder",
      folderId: "nested folder",
      relativePath: "Campaign Assets/Images/logo.png",
      departmentId: "marketing",
    }),
    "/api/gdrive/upload?parentId=route-folder&relativePath=Campaign%20Assets%2FImages%2Flogo.png&folderId=nested%20folder&departmentId=marketing",
  );
});

test("a pending refresh keeps current cards until replacement data arrives", () => {
  assert.deepEqual(replaceFetchedFiles({
    current: [{ id: "old" }],
    incoming: [],
    reset: true,
    responseReady: false,
  }), [{ id: "old" }]);

  assert.deepEqual(replaceFetchedFiles({
    current: [{ id: "old" }],
    incoming: [{ id: "new" }],
    reset: true,
    responseReady: true,
  }), [{ id: "new" }]);
});

test("pagination appends to the current cards", () => {
  assert.deepEqual(replaceFetchedFiles({
    current: [{ id: "first" }],
    incoming: [{ id: "second" }],
    reset: false,
    responseReady: true,
  }), [{ id: "first" }, { id: "second" }]);
});
