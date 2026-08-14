import { getUser, getOrgDepartments, getOrgPermissions } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { getVerifiedUser } from "~~/server/utils/permission";
import { users, organizations, organizationRequests, gdriveFolders, byosStorageConfigs } from "~~/server/database/schema";
import { eq } from "drizzle-orm";
import { getGDriveConnection } from "~~/server/utils/gdrive";
import { ulid } from "ulidx";
import { verifyByosCredentials, type ByosConfig } from "~~/server/utils/byosStorage";

export default defineEventHandler(async (event) => {
  const user = await getVerifiedUser(event);
  const body = await readBody<{
    orgAction: "create" | "join";
    newOrgName?: string;
    selectedOrgId?: string;
    role?: string;
    departmentId?: string;
    orgType?: "s3" | "gdrive" | "byos";
    folderId?: string;
    folderName?: string;
    byosConfig?: ByosConfig;
  }>(event);

  const { orgAction, newOrgName, selectedOrgId, role, departmentId, orgType, folderId, folderName, byosConfig } = body;

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

    // For GDrive orgs: if a folder was pre-selected, save it with approved status now.
    // The org id will be updated when the super admin approves the request.
    if (orgType === "gdrive" && folderId && folderName) {
      const db = useDrizzle();
      const existingConn = await db
        .select()
        .from(gdriveFolders)
        .where(eq(gdriveFolders.userId, user.id));

      if (existingConn && existingConn.length > 0) {
        await db
          .update(gdriveFolders)
          .set({
            folderId,
            folderName,
            status: "approved",
            updatedAt: new Date(),
          })
          .where(eq(gdriveFolders.userId, user.id));
      } else {
        // Should not normally happen since OAuth callback creates the entry, but guard here
        throw createError({ status: 400, message: "Google Drive not connected. Please connect your Drive account first." });
      }
    }

    // For BYOS orgs: save credentials and get the config id to link to the org request
    let byosConfigId: string | undefined;
    if (orgType === "byos") {
      if (!byosConfig) {
        throw createError({ status: 400, message: "BYOS configuration is required for this storage type." });
      }
      // Double-check credentials server-side before saving
      await verifyByosCredentials(byosConfig);

      byosConfigId = ulid();
      await useDrizzle().insert(byosStorageConfigs).values({
        id: byosConfigId,
        userId: user.id,
        provider: byosConfig.provider,
        bucketName: byosConfig.bucketName,
        accessKeyId: byosConfig.provider !== "gcs" ? (byosConfig as any).accessKeyId : null,
        secretAccessKey: byosConfig.provider !== "gcs" ? (byosConfig as any).secretAccessKey : null,
        region: byosConfig.provider !== "gcs" ? (byosConfig as any).region : null,
        endpoint: byosConfig.provider === "r2" ? (byosConfig as any).endpoint : null,
        projectId: byosConfig.provider === "gcs" ? (byosConfig as any).projectId : null,
        clientEmail: byosConfig.provider === "gcs" ? (byosConfig as any).clientEmail : null,
        privateKey: byosConfig.provider === "gcs" ? (byosConfig as any).privateKey : null,
        status: "verified",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Create a pending org request (Super Admin must approve)
    const requestId = ulid();
    await useDrizzle().insert(organizationRequests).values({
      id: requestId,
      userId: user.id,
      orgName: newOrgName.trim(),
      orgType: orgType || "s3",
      byosConfigId: byosConfigId ?? null,
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


