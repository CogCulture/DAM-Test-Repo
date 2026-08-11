import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageUser,
  getAccessibleDepartmentIds,
  resolvePermission,
} from "../shared/utils/access-control.ts";

test("an explicit user deny overrides an allowed department role", () => {
  assert.equal(resolvePermission({
    isAdmin: false,
    individual: false,
    departmentRole: true,
    globalRole: true,
  }), false);
});

test("an explicit user allow overrides a denied department role", () => {
  assert.equal(resolvePermission({
    isAdmin: false,
    individual: true,
    departmentRole: false,
    globalRole: false,
  }), true);
});

test("department role takes precedence over the global role", () => {
  assert.equal(resolvePermission({
    isAdmin: false,
    individual: null,
    departmentRole: false,
    globalRole: true,
  }), false);
});

test("missing permission configuration fails closed", () => {
  assert.equal(resolvePermission({
    isAdmin: false,
    individual: null,
    departmentRole: null,
    globalRole: null,
  }), false);
});

test("organization admins always retain access", () => {
  assert.equal(resolvePermission({
    isAdmin: true,
    individual: false,
    departmentRole: false,
    globalRole: false,
  }), true);
});

test("users receive their own department plus explicitly granted departments", () => {
  assert.deepEqual(
    getAccessibleDepartmentIds({
      isAdmin: false,
      ownDepartmentId: "design",
      grantedDepartmentIds: ["sales", "design", "finance"],
      allDepartmentIds: ["design", "sales", "finance", "legal"],
      allDepartments: false,
    }),
    ["design", "sales", "finance"],
  );
});

test("all-department access expands to every organization department", () => {
  assert.deepEqual(
    getAccessibleDepartmentIds({
      isAdmin: false,
      ownDepartmentId: "design",
      grantedDepartmentIds: [],
      allDepartmentIds: ["design", "sales", "finance"],
      allDepartments: true,
    }),
    ["design", "sales", "finance"],
  );
});

const admin = { id: "admin-1", role: "admin", organizationId: "org-1", departmentId: null };
const designHead = { id: "head-1", role: "dept_head", organizationId: "org-1", departmentId: "design" };
const designMember = { id: "member-1", role: "team_member", organizationId: "org-1", departmentId: "design" };

test("department heads cannot promote a user to administrator", () => {
  assert.equal(canManageUser(designHead, designMember, "admin", "design").allowed, false);
});

test("department heads cannot manage users outside their department", () => {
  const financeMember = { ...designMember, id: "member-2", departmentId: "finance" };
  assert.equal(
    canManageUser(designHead, financeMember, "team_lead", "finance").allowed,
    false,
  );
});

test("department heads can promote lower-ranked users inside their department", () => {
  assert.equal(
    canManageUser(designHead, designMember, "team_lead", "design").allowed,
    true,
  );
});

test("organization administrators cannot manage users in another organization", () => {
  const outsideUser = { ...designMember, organizationId: "org-2" };
  assert.equal(
    canManageUser(admin, outsideUser, "team_lead", "design").allowed,
    false,
  );
});

test("organization administrators can assign any valid role in their organization", () => {
  assert.equal(canManageUser(admin, designMember, "dept_head", "design").allowed, true);
});

