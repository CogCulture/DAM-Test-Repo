export const FILE_PERMISSION_KEYS = [
  "canView",
  "canDownload",
  "canUpload",
  "canCreateFolder",
  "canRename",
  "canDelete",
  "canShare",
  "canEditMetadata",
  "canUseRag",
] as const;

export type FilePermissionKey = typeof FILE_PERMISSION_KEYS[number];
export type PermissionDecision = boolean | null | undefined;

export function resolvePermission(input: {
  isAdmin: boolean;
  individual?: PermissionDecision;
  departmentRole?: PermissionDecision;
  globalRole?: PermissionDecision;
}): boolean {
  if (input.isAdmin) return true;
  if (typeof input.individual === "boolean") return input.individual;
  if (typeof input.departmentRole === "boolean") return input.departmentRole;
  if (typeof input.globalRole === "boolean") return input.globalRole;
  return true;
}

export function getAccessibleDepartmentIds(input: {
  isAdmin: boolean;
  ownDepartmentId?: string | null;
  grantedDepartmentIds: string[];
  allDepartmentIds: string[];
  allDepartments: boolean;
}): string[] {
  if (input.isAdmin || input.allDepartments) {
    return [...new Set(input.allDepartmentIds)];
  }

  return [...new Set([
    ...(input.ownDepartmentId ? [input.ownDepartmentId] : []),
    ...input.grantedDepartmentIds,
  ])];
}


type HierarchyRole =
  | "admin"
  | "dept_head"
  | "team_lead"
  | "team_member"
  | "intern";

type HierarchyUser = {
  id: string;
  role: string;
  organizationId?: string | null;
  departmentId?: string | null;
};

export type UserManagementDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

const ROLE_RANK: Record<HierarchyRole, number> = {
  admin: 5,
  dept_head: 4,
  team_lead: 3,
  team_member: 2,
  intern: 1,
};

const denyManagement = (reason: string): UserManagementDecision => ({ allowed: false, reason });

export function canManageUser(
  actor: HierarchyUser,
  target: HierarchyUser,
  requestedRole: string,
  requestedDepartmentId?: string | null,
): UserManagementDecision {
  if (!actor.organizationId || actor.organizationId !== target.organizationId) {
    return denyManagement("Users must belong to the same organization.");
  }

  if (!(requestedRole in ROLE_RANK)) {
    return denyManagement("The requested role is invalid.");
  }

  if (actor.role === "admin") return { allowed: true };
  if (actor.role !== "dept_head") {
    return denyManagement("Only administrators and Department Heads can manage users.");
  }

  if (!actor.departmentId || target.departmentId !== actor.departmentId || requestedDepartmentId !== actor.departmentId) {
    return denyManagement("Department Heads can manage users only in their own department.");
  }

  const actorRank = ROLE_RANK.dept_head;
  const targetRank = ROLE_RANK[target.role as HierarchyRole] ?? Number.POSITIVE_INFINITY;
  const requestedRank = ROLE_RANK[requestedRole as HierarchyRole];
  if (targetRank >= actorRank) {
    return denyManagement("Department Heads cannot modify peer or higher-ranked users.");
  }
  if (requestedRank >= actorRank) {
    return denyManagement("Department Heads cannot assign peer or higher roles.");
  }
  return { allowed: true };
}
