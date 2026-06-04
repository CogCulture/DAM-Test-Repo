import { getGDriveAccessToken, renameGDriveItem } from "~~/server/utils/gdrive";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { id } = getRouterParams(event);
  const { newName } = await readBody<{ newName: string }>(event);

  if (!newName) {
    throw createError({ status: 400, message: "New name is required." });
  }

  const token = await getGDriveAccessToken(user.id);
  await renameGDriveItem(token, id, newName);

  return { success: true };
});
