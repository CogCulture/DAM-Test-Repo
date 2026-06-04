/**
 * Super Admin utility — validates the superadmin session cookie.
 * All superadmin API routes must call requireSuperAdmin(event) first.
 */

const FALLBACK_SESSION_PASSWORD = "super-admin-session-fallback-key-2024-dam";

const getSessionPassword = () => {
  const envPwd = process.env.SUPERADMIN_SESSION_PASSWORD;
  // useSession requires at least 32 characters
  if (envPwd && envPwd.length >= 32) return envPwd;
  return FALLBACK_SESSION_PASSWORD;
};

export const requireSuperAdmin = async (event: any) => {
  const session = await useSession(event, {
    password: getSessionPassword(),
    name: "superadmin_session",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  if (!session.data?.isSuperAdmin) {
    throw createError({
      status: 401,
      message: "Super Admin authentication required.",
    });
  }

  return session;
};

export const getSuperAdminSession = async (event: any) => {
  return await useSession(event, {
    password: getSessionPassword(),
    name: "superadmin_session",
    maxAge: 60 * 60 * 8,
  });
};
