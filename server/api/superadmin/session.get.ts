import { getSuperAdminSession } from "~~/server/utils/superadmin";

export default defineEventHandler(async (event) => {
  const session = await getSuperAdminSession(event);
  if (!session.data?.isSuperAdmin) {
    return { authenticated: false };
  }
  return { authenticated: true, email: session.data.email };
});
