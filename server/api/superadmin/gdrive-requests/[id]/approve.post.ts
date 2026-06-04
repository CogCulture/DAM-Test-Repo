import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { gdriveFolders } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const { id } = getRouterParams(event);
  const { action } = await readBody<{ action: "approve" | "reject" }>(event);

  if (!["approve", "reject"].includes(action)) {
    throw createError({ status: 400, message: "Invalid action." });
  }

  const db = useDrizzle();
  const [request] = await db.select().from(gdriveFolders).where(eq(gdriveFolders.id, id));

  if (!request) {
    throw createError({ status: 404, message: "GDrive request not found." });
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  await db
    .update(gdriveFolders)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(gdriveFolders.id, id));

  return { success: true, status: newStatus };
});
