import { eq, and } from "drizzle-orm";
import { ulid } from "ulidx";
import { deptInvites, users, userOrganizations, userDepartmentAccess } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { getUser } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token");
  if (!token) {
    throw createError({ status: 400, message: "Token is required." });
  }

  const { user } = await requireUserSession(event);
  const db = useDrizzle();

  // Find invitation
  const [invite] = await db
    .select()
    .from(deptInvites)
    .where(and(eq(deptInvites.token, token), eq(deptInvites.status, "pending")));

  if (!invite) {
    throw createError({ status: 404, message: "Invitation not found or already accepted." });
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    await db
      .update(deptInvites)
      .set({ status: "expired" })
      .where(eq(deptInvites.id, invite.id));
    throw createError({ status: 400, message: "Invitation link has expired." });
  }

  const assignedRole = (invite as any).role || "team_member";

  // Update user role, organization, and department
  await db
    .update(users)
    .set({
      role: assignedRole,
      departmentId: invite.departmentId,
      organizationId: invite.organizationId,
      approvalStatus: "active",
      status: "active",
    })
    .where(eq(users.id, user.id));

  // Ensure user_organizations mapping exists
  try {
    await db
      .insert(userOrganizations)
      .values({
        id: ulid(),
        userId: user.id,
        organizationId: invite.organizationId,
        role: assignedRole,
      })
      .onConflictDoNothing();
  } catch {}

  // Ensure department access mapping exists if department specified
  if (invite.departmentId && invite.departmentId !== "global") {
    try {
      await db
        .insert(userDepartmentAccess)
        .values({
          id: ulid(),
          userId: user.id,
          organizationId: invite.organizationId,
          departmentId: invite.departmentId,
        })
        .onConflictDoNothing();
    } catch {}
  }

  // Mark invite as accepted
  await db
    .update(deptInvites)
    .set({ status: "accepted" })
    .where(eq(deptInvites.id, invite.id));

  // Refresh user session info
  const updatedUser = await getUser(user.id);
  if (updatedUser) {
    await setUserSession(event, { user: updatedUser });
  }

  return { success: true };
});
