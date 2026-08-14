import { eq, and, gt } from "drizzle-orm";
import { deptInvites, organizations, orgDepartments } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token");
  if (!token) {
    throw createError({ status: 400, message: "Token is required." });
  }

  const db = useDrizzle();
  const [invite] = await db
    .select()
    .from(deptInvites)
    .where(and(eq(deptInvites.token, token), eq(deptInvites.status, "pending")));

  if (!invite) {
    throw createError({ status: 404, message: "Invitation not found or already accepted." });
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    // Mark as expired
    await db
      .update(deptInvites)
      .set({ status: "expired" })
      .where(eq(deptInvites.id, invite.id));
    throw createError({ status: 400, message: "Invitation link has expired." });
  }

  // Get department name and org name
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId));

  const [dept] = await db
    .select()
    .from(orgDepartments)
    .where(eq(orgDepartments.id, invite.departmentId));

  return {
    success: true,
    email: invite.email,
    organizationId: invite.organizationId,
    departmentId: invite.departmentId,
    orgName: org?.name || "Organization",
    deptName: dept?.name || "Department",
  };
});
