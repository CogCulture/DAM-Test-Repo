import { requireFilePermission } from "~~/server/utils/permission";
import { eq, and } from "drizzle-orm";
import { getGDriveAccessToken, renameGDriveItem, getGDriveConnection } from "~~/server/utils/gdrive";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users } from "~~/server/database/schema";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canRename");
  const { fileId, newName } = await readBody<{ fileId: string; newName: string }>(event);

  if (!fileId || !newName || !newName.trim()) {
    throw createError({ status: 400, message: "File ID and new name are required." });
  }

  const name = newName.trim();
  const invalidName = name.length > 255 || name === "." || name === ".." || /[<>:"/\\|?*\u0000-\u001F]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name);
  if (invalidName) {
    throw createError({ status: 400, message: "Enter a valid name without reserved characters or trailing spaces." });
  }
  const orgId = (user as any).organizationId;
  const db = useDrizzle();

  // Find the admin of this organization to get their Google Drive connection credentials
  let adminUserId = user.id;
  if (user.role !== "admin" && orgId) {
    const [orgAdmin] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
    if (orgAdmin) {
      adminUserId = orgAdmin.id;
    }
  }

  const connection = await getGDriveConnection(adminUserId);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  // Permissions validation
  if (user.role !== "admin") {
    const permissions = (user as any).permissions;
    if (permissions && !permissions.canRename) {
      throw createError({ status: 403, message: "Forbidden: You do not have permission to rename items." });
    }
  }

  const token = await getGDriveAccessToken(adminUserId);
  const updatedItem = await renameGDriveItem(token, fileId, name);

  return { success: true, item: updatedItem };
});
