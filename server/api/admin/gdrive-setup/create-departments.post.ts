import { eq, and } from "drizzle-orm";
import { organizations, orgDepartments, gdriveFolders, nomenclatures } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { getGDriveAccessToken, createGDriveFolder, listGDriveFolder } from "~~/server/utils/gdrive";
import { ulid } from "ulidx";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  
  if (user.role !== "admin") {
    throw createError({ status: 403, message: "Forbidden: Admins only." });
  }

  const orgId = user.organizationId;
  if (!orgId) {
    throw createError({ status: 400, message: "User is not associated with an organization." });
  }

  const body = await readBody(event);
  if (!body || !Array.isArray(body.departments) || body.departments.length === 0) {
    throw createError({ status: 400, message: "Invalid departments payload." });
  }

  const db = useDrizzle();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    throw createError({ status: 404, message: "Organization not found." });
  }

  // Find GDrive connection for this admin
  const [connection] = await db
    .select()
    .from(gdriveFolders)
    .where(eq(gdriveFolders.userId, user.id));

  if (!connection || !connection.folderId) {
    throw createError({ status: 400, message: "Google Drive is not connected or root folder is not set." });
  }

  const token = await getGDriveAccessToken(user.id);
  const createdDepartments = [];

  // Fetch current folder contents from Google Drive to check for existing folders
  const currentFolders = await listGDriveFolder(token, connection.folderId);

  for (const dept of body.departments) {
    if (!dept.name || typeof dept.name !== "string" || !dept.name.trim()) {
      continue;
    }
    const cleanName = dept.name.trim();

    // Check if the department name already exists in the database
    const [existingDept] = await db
      .select()
      .from(orgDepartments)
      .where(and(
        eq(orgDepartments.organizationId, orgId),
        eq(orgDepartments.name, cleanName)
      ));

    if (existingDept) {
      createdDepartments.push({ id: existingDept.id, name: cleanName, gdriveFolderId: existingDept.gdriveFolderId });
      continue;
    }

    // Check if the folder already exists in Google Drive parent folder
    const matchingFolder = currentFolders.find(
      (f) => f.name.toLowerCase() === cleanName.toLowerCase() && f.mimeType === "application/vnd.google-apps.folder"
    );

    let folderId = "";
    if (matchingFolder) {
      folderId = matchingFolder.id;
    } else {
      // Create folder in Google Drive
      const gDriveFolder = await createGDriveFolder(token, connection.folderId, cleanName);
      folderId = gDriveFolder.id;
    }

    // Create OrgDepartment row in DB
    const deptId = `${orgId}_${ulid()}`;
    await db.insert(orgDepartments).values({
      id: deptId,
      organizationId: orgId,
      name: cleanName,
      parentId: null,
      gdriveFolderId: folderId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create default nomenclature template row for this department
    await db.insert(nomenclatures).values({
      departmentId: deptId,
      organizationId: orgId,
template: "Brand_Campaign_Channel_Asset_Format_Version_Date",
      segments: [
        { key: "Brand", label: "Brand", allowedValues: [] },
        { key: "Campaign", label: "Campaign", allowedValues: [] },
        { key: "Channel", label: "Channel", allowedValues: [] },
        { key: "Asset", label: "Asset Type", allowedValues: [] },
        { key: "Format", label: "Format", allowedValues: [] },
        { key: "Version", label: "Version", allowedValues: [] },
        { key: "Date", label: "Date", allowedValues: [] },
      ],
      updatedBy: user.id,
      updatedAt: new Date(),
    });

    createdDepartments.push({ id: deptId, name: cleanName, gdriveFolderId: folderId });
  }

  // Set setupComplete to true for this organization
  await db
    .update(organizations)
    .set({
      setupComplete: true,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return {
    success: true,
    departments: createdDepartments,
  };
});
