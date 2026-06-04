import { getUser, getOrgDepartments, getOrgPermissions } from "~~/server/utils/db";
import { getVerifiedUser } from "~~/server/utils/permission";
import { users, organizations, organizationRequests } from "~~/server/database/schema";
import { eq } from "drizzle-orm";
import { getGDriveConnection } from "~~/server/utils/gdrive";
import { ulid } from "ulidx";

export default defineEventHandler(async (event) => {
  const user = await getVerifiedUser(event);
  const body = await readBody<{
    orgAction: "create" | "join";
    newOrgName?: string;
    selectedOrgId?: string;
    role?: string;
    departmentId?: string;
    orgType?: "s3" | "gdrive";
  }>(event);

  const { orgAction, newOrgName, selectedOrgId, role, departmentId, orgType } = body;

  if (orgAction === "create") {
    if (!newOrgName || !newOrgName.trim()) {
      throw createError({ status: 400, message: "Organization name is required." });
    }

    // Check if organization name already exists
    const existingOrg = await useDrizzle()
      .select()
      .from(organizations)
      .where(eq(organizations.name, newOrgName.trim()))
      .limit(1);

    if (existingOrg.length > 0) {
      throw createError({
        status: 400,
        message: "An organization with this name already exists. Please choose a different name, or request to join it.",
      });
    }

    // Check if user already has a pending request
    const existingRequest = await useDrizzle()
      .select()
      .from(organizationRequests)
      .where(eq(organizationRequests.userId, user.id))
      .limit(1);

    if (existingRequest.length > 0 && existingRequest[0].status === "pending") {
      throw createError({
        status: 400,
        message: "You already have a pending organization request. Please wait for Super Admin approval.",
      });
    }

    // Create a pending org request (Super Admin must approve)
    const requestId = ulid();
    await useDrizzle().insert(organizationRequests).values({
      id: requestId,
      userId: user.id,
      orgName: newOrgName.trim(),
      orgType: orgType || "s3",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Mark user as waiting for org approval
    // @ts-ignore
    await useDrizzle()
      .update(users)
      .set({ approvalStatus: "pending_org" })
      .where(eq(users.id, user.id));

    // @ts-ignore
    const updatedUser = await getUser(user.id);
    await setUserSession(event, { user: updatedUser });

    return { success: true, pendingOrgRequest: true, redirectToGDrive: false };

  } else if (orgAction === "join") {
    if (!selectedOrgId) {
      throw createError({ status: 400, message: "Please select an organization." });
    }
    if (!role || !departmentId) {
      throw createError({ status: 400, message: "Role and department are required." });
    }

    // Validate role belongs to organization permissions
    const orgPerms = await getOrgPermissions(selectedOrgId);
    const roleExists = orgPerms.some((p) => p.role === role);
    if (!roleExists) {
      throw createError({ status: 400, message: "Invalid role selected for this organization." });
    }

    // Validate department belongs to selected org
    const orgDepts = await getOrgDepartments(selectedOrgId);
    const deptExists = orgDepts.some((d) => d.id === departmentId);
    if (!deptExists) {
      throw createError({ status: 400, message: "Invalid department for this organization." });
    }

    // @ts-ignore
    await useDrizzle()
      .update(users)
      .set({
        role,
        organizationId: selectedOrgId,
        departmentId,
        approvalStatus: "pending",
      })
      .where(eq(users.id, user.id));
  } else {
    throw createError({ status: 400, message: "Invalid action." });
  }

  // @ts-ignore
  const updatedUser = await getUser(user.id);
  await setUserSession(event, { user: updatedUser });

  const conn = await getGDriveConnection(user.id);
  const redirectToGDrive = !!(conn && !conn.folderId);

  return { success: true, pendingOrgRequest: false, redirectToGDrive };
});
