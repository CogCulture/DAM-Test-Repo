import { getSharedWithMe } from "~~/server/utils/db";
import { requireFilePermission } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  // bucket is not required
  const user = await requireFilePermission(event, "canView");
  const queryString = getQuery(event);

  //@ts-ignore
  return await getSharedWithMe(user.id, queryString);
});
