export type UserRole =
  | "admin"
  | "dept_head"
  | "team_lead"
  | "team_member"
  | "intern";

export type ApprovalStatus = "pending" | "active" | "rejected";

export const ROLES: { id: UserRole; label: string; level: number }[] = [
  { id: "admin", label: "Admin", level: 5 },
  { id: "dept_head", label: "Department Head", level: 4 },
  { id: "team_lead", label: "Team Lead", level: 3 },
  { id: "team_member", label: "Team Member", level: 2 },
  { id: "intern", label: "Intern", level: 1 },
];

export const ROLE_MAP = Object.fromEntries(
  ROLES.map((r) => [r.id, r])
) as Record<UserRole, (typeof ROLES)[0]>;

export const ROLE_LEVEL: Record<UserRole, number> = Object.fromEntries(
  ROLES.map((r) => [r.id, r.level])
) as Record<UserRole, number>;

/** Returns true if `role` meets or exceeds the `minimum` role */
export const hasMinRole = (role: UserRole, minimum: UserRole): boolean =>
  ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];

export const getRoleLabel = (role: UserRole): string =>
  ROLE_MAP[role]?.label ?? role;

// The name of the single shared organizational bucket
export const ORG_BUCKET_NAME = "org";
