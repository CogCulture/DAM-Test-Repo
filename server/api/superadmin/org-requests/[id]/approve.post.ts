import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizationRequests, users, gdriveFolders } from "~~/server/database/schema";
import { createOrganization } from "~~/server/utils/db";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const { id } = getRouterParams(event);
  const { action, reviewNote } = await readBody<{
    action: "approve" | "reject";
    reviewNote?: string;
  }>(event);

  if (!["approve", "reject"].includes(action)) {
    throw createError({ status: 400, message: "Invalid action." });
  }

  const db = useDrizzle();
  const [request] = await db
    .select()
    .from(organizationRequests)
    .where(eq(organizationRequests.id, id));

  if (!request) {
    throw createError({ status: 404, message: "Organization request not found." });
  }
  if (request.status !== "pending") {
    throw createError({ status: 400, message: "Request already processed." });
  }

  if (action === "approve") {
    // Create the organization
    const orgId = await createOrganization(request.orgName, request.orgType as "s3" | "gdrive", request.userId);

    // Assign the requesting user as admin of the new org
    await db
      .update(users)
      .set({
        organizationId: orgId,
        role: "admin",
        approvalStatus: "active",
      })
      .where(eq(users.id, request.userId));

    // If this is a GDrive org, link the pre-selected folder to the new org
    if (request.orgType === "gdrive") {
      await db
        .update(gdriveFolders)
        .set({
          organizationId: orgId,
          status: "approved",
          updatedAt: new Date(),
        })
        .where(eq(gdriveFolders.userId, request.userId));
    }
  }

  // Mark request as processed
  await db
    .update(organizationRequests)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      reviewNote: reviewNote || null,
      updatedAt: new Date(),
    })
    .where(eq(organizationRequests.id, id));

  return { success: true, action };
});


