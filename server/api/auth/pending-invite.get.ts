import { eq, and, gt, sql } from "drizzle-orm";
import { deptInvites, organizations, orgDepartments } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { getVerifiedUser } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await getVerifiedUser(event);
  if (!user || !user.email) return null;

  const db = useDrizzle();
  const normalizedEmail = user.email.trim().toLowerCase();

  const [invite] = await db
    .select()
    .from(deptInvites)
    .where(
      and(
        sql`LOWER(${deptInvites.email}) = ${normalizedEmail}`,
        eq(deptInvites.status, "pending"),
        gt(deptInvites.expiresAt, new Date())
      )
    )
    .orderBy(deptInvites.createdAt)
    .limit(1);

  if (!invite) return null;

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId));

  const [dept] = await db
    .select({ name: orgDepartments.name })
    .from(orgDepartments)
    .where(eq(orgDepartments.id, invite.departmentId));

  const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    dept_head: "Department Head",
    team_lead: "Team Lead",
    team_member: "Team Member",
    guest: "Guest",
  };

  const role = invite.role || "team_member";

  return {
    id: invite.id,
    token: invite.token,
    organizationId: invite.organizationId,
    orgName: org?.name || "Organization",
    departmentId: invite.departmentId,
    deptName: dept?.name || (invite.departmentId === "global" ? "All Departments" : "Department"),
    role,
    roleLabel: ROLE_LABELS[role] || "Team Member",
  };
});
