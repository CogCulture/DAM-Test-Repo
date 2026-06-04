import { getUser, updateUserApproval, getOrgPermissions } from "~~/server/utils/db";
import { getApprovedUser } from "~~/server/utils/permission";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users } from "~~/server/database/schema";
import { eq, and, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const actor = await getApprovedUser(event);
  // @ts-ignore
  const actorRole = actor.role as string;

  const { id } = getRouterParams(event);
  const { action } = await readBody<{ action: "approve" | "reject" | "remove" }>(event);

  if (!["approve", "reject", "remove"].includes(action)) {
    throw createError({ status: 400, message: "Invalid action." });
  }

  const targetUser = await getUser(id);
  if (!targetUser) {
    throw createError({ status: 404, message: "User not found." });
  }

  // Admin can approve/remove anyone. Dept head can only modify users in their dept.
  if (actorRole === "dept_head") {
    // @ts-ignore
    if (targetUser.departmentId !== actor.departmentId) {
      throw createError({ status: 403, message: "Cannot perform action on users outside your department." });
    }
  } else if (actorRole !== "admin") {
    throw createError({ status: 403, message: "Insufficient permissions." });
  }

  if (action === "remove") {
    // Reset user details to make them a fresh user
    await useDrizzle()
      .update(users)
      .set({
        organizationId: null,
        departmentId: null,
        role: "team_member",
        approvalStatus: "needs_profile",
      })
      .where(eq(users.id, id));
    
    return { success: true, userId: id, approvalStatus: "needs_profile" };
  }

  const newStatus = action === "approve" ? "active" : "rejected";

  if (newStatus === "active") {
    // Enforce role limit
    const orgId = targetUser.organizationId;
    const deptId = targetUser.departmentId || "global";
    const targetRole = targetUser.role;

    if (orgId && targetRole) {
      const perms = await getOrgPermissions(orgId);
      // Find override first, then global
      let limitRecord = perms.find((p) => p.role === targetRole && p.departmentId === deptId);
      if (!limitRecord) {
        limitRecord = perms.find((p) => p.role === targetRole && p.departmentId === "global");
      }

      if (limitRecord && limitRecord.maxCount !== null) {
        // Count how many active users exist in this organization + department + role
        const activeUsersCountResult = await useDrizzle()
          .select({
            count: sql`COUNT(*)`
          })
          .from(users)
          .where(
            and(
              eq(users.organizationId, orgId),
              eq(users.departmentId, targetUser.departmentId),
              eq(users.role, targetRole),
              eq(users.approvalStatus, "active")
            )
          );
        
        const currentCount = Number(activeUsersCountResult[0]?.count || 0);
        if (currentCount >= limitRecord.maxCount) {
          throw createError({
            status: 400,
            message: `Cannot approve user. The role "${targetRole}" has reached its maximum capacity of ${limitRecord.maxCount} in this department.`
          });
        }
      }
    }
  }

  await updateUserApproval(id, newStatus);

  return { success: true, userId: id, approvalStatus: newStatus };
});
