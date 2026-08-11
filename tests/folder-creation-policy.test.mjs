import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionFolderRequest,
  isDuplicatePendingFolderRequest,
  canReviewFolderRequest,
  resolveFolderCreationMode,
} from "../shared/utils/folder-creation-policy.ts";

test("lower roles with folder permission must request approval", () => {
  for (const role of ["team_lead", "team_member", "intern"]) {
    assert.equal(
      resolveFolderCreationMode({ role, canCreateFolder: true }),
      "request",
      role,
    );
  }
});

test("administrators and department heads can create folders directly", () => {
  assert.equal(resolveFolderCreationMode({ role: "admin", canCreateFolder: true }), "direct");
  assert.equal(resolveFolderCreationMode({ role: "dept_head", canCreateFolder: true }), "direct");
});

test("users without folder permission cannot create or request folders", () => {
  assert.equal(resolveFolderCreationMode({ role: "team_lead", canCreateFolder: false }), "denied");
});

test("organization admins can review requests from every department", () => {
  assert.equal(canReviewFolderRequest({ role: "admin", departmentId: null }, "creative"), true);
});


test("pending folder request names compare case-insensitively", () => {
  assert.equal(isDuplicatePendingFolderRequest("Campaign", ["campaign"]), true);
  assert.equal(isDuplicatePendingFolderRequest("Campaign", ["Campaign 2026"]), false);
});

test("only pending folder requests can transition to a decision", () => {
  assert.equal(canTransitionFolderRequest("pending", "approve"), true);
  assert.equal(canTransitionFolderRequest("pending", "reject"), true);
  assert.equal(canTransitionFolderRequest("approved", "reject"), false);
  assert.equal(canTransitionFolderRequest("rejected", "approve"), false);
});
test("department heads can review only their own department", () => {
  assert.equal(canReviewFolderRequest({ role: "dept_head", departmentId: "creative" }, "creative"), true);
  assert.equal(canReviewFolderRequest({ role: "dept_head", departmentId: "creative" }, "finance"), false);
});
