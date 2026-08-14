import { eq } from "drizzle-orm";
import { organizations, gdriveFolders } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { getGDriveAccessToken, listGDriveFolder } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  
  if (user.role !== "admin") {
    throw createError({ status: 403, message: "Forbidden: Admins only." });
  }

  const orgId = user.organizationId;
  if (!orgId) {
    throw createError({ status: 400, message: "User is not associated with an organization." });
  }

  const db = useDrizzle();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    throw createError({ status: 404, message: "Organization not found." });
  }

  if (org.orgType !== "gdrive") {
    return {
      setupComplete: true,
      folderIsEmpty: false,
      folderName: null,
    };
  }

  // Find GDrive connection for this admin
  const [connection] = await db
    .select()
    .from(gdriveFolders)
    .where(eq(gdriveFolders.userId, user.id));

  if (!connection || !connection.folderId) {
    return {
      setupComplete: org.setupComplete || false,
      folderIsEmpty: true,
      folderName: null,
    };
  }

  // Get accessToken and check if empty
  try {
    const token = await getGDriveAccessToken(user.id);
    const contents = await listGDriveFolder(token, connection.folderId);
    
    // Ignore trashed and check if empty
    const isEmpty = contents.length === 0;

    return {
      setupComplete: org.setupComplete || false,
      folderIsEmpty: isEmpty,
      folderName: connection.folderName,
    };
  } catch (err: any) {
    console.error("Error checking GDrive status:", err);
    return {
      setupComplete: org.setupComplete || false,
      folderIsEmpty: true,
      folderName: connection.folderName,
      error: err.message,
    };
  }
});
