import { requireFilePermission } from "~~/server/utils/permission";
import { getTrashed } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canView");

  //@ts-ignore
  return await getTrashed(event, user.id);
});
