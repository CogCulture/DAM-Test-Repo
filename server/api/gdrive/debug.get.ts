import { getGDriveAccessToken, listGDriveFolder, getGDriveConnection } from "~~/server/utils/gdrive";
import { requireMinRole } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireMinRole(event, "admin");
  const connection = await getGDriveConnection(user.id);
  if (!connection) {
    return { error: "No connection found." };
  }

  try {
    const token = await getGDriveAccessToken(user.id);
    const files = await listGDriveFolder(token, connection.folderId!);
    return {
      success: true,
      connection,
      files,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      stack: err.stack,
      data: err.data,
    };
  }
});
