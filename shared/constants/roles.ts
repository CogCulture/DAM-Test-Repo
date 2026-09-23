export type UserRole =
  | "admin"
  | "dept_head"
  | "team_lead"
  | "team_member"
  | "guest"
  | "intern";

export type ApprovalStatus = "pending" | "active" | "rejected";

export const ROLES: { id: UserRole; label: string; level: number }[] = [
  { id: "admin", label: "Admin", level: 5 },
  { id: "dept_head", label: "Department Head", level: 4 },
  { id: "team_lead", label: "Team Lead", level: 3 },
  { id: "team_member", label: "Team Member", level: 2 },
  { id: "guest", label: "Guest", level: 1 },
];

export const ALL_ROLES: { id: UserRole; label: string; level: number }[] = [
  ...ROLES,
  { id: "intern", label: "Guest", level: 1 },
];

export const ROLE_MAP = Object.fromEntries(
  ALL_ROLES.map((r) => [r.id, r])
) as Record<UserRole, (typeof ALL_ROLES)[0]>;

export const ROLE_LEVEL: Record<UserRole, number> = Object.fromEntries(
  ALL_ROLES.map((r) => [r.id, r.level])
) as Record<UserRole, number>;

/** Returns true if `role` meets or exceeds the `minimum` role */
export const hasMinRole = (role: UserRole | string, minimum: UserRole): boolean => {
  const normRole = (role === "intern" ? "guest" : role) as UserRole;
  return (ROLE_LEVEL[normRole] ?? 0) >= (ROLE_LEVEL[minimum] ?? 0);
};

export const getRoleLabel = (role: UserRole | string): string => {
  if (role === "intern" || role === "guest") return "Guest";
  return ROLE_MAP[role as UserRole]?.label ?? String(role);
};

// The name of the single shared organizational bucket
export const ORG_BUCKET_NAME = "org";
