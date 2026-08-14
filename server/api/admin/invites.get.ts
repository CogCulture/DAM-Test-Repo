import { eq } from "drizzle-orm";
import { deptInvites } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  
  if (user.role !== "admin") {
    throw createError({ status: 403, message: "Forbidden: Admins only." });
  }

  const db = useDrizzle();
  const list = await db
    .select()
    .from(deptInvites)
    .where(eq(deptInvites.organizationId, user.organizationId));

  const host = process.env.NUXT_PUBLIC_SITE_URL || "http://localhost:3005";

  const invites = list.map((inv) => ({
    ...inv,
    inviteUrl: `${host}/auth/invite?token=${inv.token}`,
  }));

  return {
    success: true,
    invites,
  };
});
