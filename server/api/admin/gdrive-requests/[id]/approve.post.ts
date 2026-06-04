import { gdriveFolders } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireMinRole } from "~~/server/utils/permission";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireMinRole(event, "admin");
  const { id } = getRouterParams(event);
  const { action } = await readBody<{ action: "approve" | "reject" }>(event);

  if (!action || !["approve", "reject"].includes(action)) {
    throw createError({ status: 400, message: "Invalid action." });
  }

  const db = useDrizzle();
  await db
    .update(gdriveFolders)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      updatedAt: new Date(),
    })
    .where(eq(gdriveFolders.id, id));

  return { success: true };
});
