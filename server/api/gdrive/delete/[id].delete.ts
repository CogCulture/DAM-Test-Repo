import { getGDriveAccessToken, deleteGDriveItem } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { id } = getRouterParams(event);

  const token = await getGDriveAccessToken(user.id);
  await deleteGDriveItem(token, id);

  return { success: true };
});
