import { getSuperAdminSession } from "~~/server/utils/superadmin";

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody<{ email: string; password: string }>(event);

  const envEmail = process.env.SUPERADMIN_EMAIL;
  const envPassword = process.env.SUPERADMIN_PASSWORD;

  if (!envEmail || !envPassword) {
    throw createError({ status: 500, message: "Super Admin credentials not configured." });
  }

  if (email !== envEmail || password !== envPassword) {
    throw createError({ status: 401, message: "Invalid Super Admin credentials." });
  }

  const session = await getSuperAdminSession(event);
  await session.update({ isSuperAdmin: true, email });

  return { success: true };
});
