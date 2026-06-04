import { getSuperAdminSession } from "~~/server/utils/superadmin";

export default defineEventHandler(async (event) => {
  const session = await getSuperAdminSession(event);
  await session.clear();
  return { success: true };
});
