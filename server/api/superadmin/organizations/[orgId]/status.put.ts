import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const { orgId } = getRouterParams(event);
  const { status } = await readBody<{ status: "active" | "suspended" }>(event);

  if (!["active", "suspended"].includes(status)) {
    throw createError({ status: 400, message: "Invalid status. Must be 'active' or 'suspended'." });
  }

  const db = useDrizzle();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) {
    throw createError({ status: 404, message: "Organization not found." });
  }

  await db
    .update(organizations)
    .set({ status, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  return { success: true, status };
});
