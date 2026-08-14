import { requireMinRole } from "~~/server/utils/permission";
import { getFolder } from "~~/server/utils/db";
import { orgDepartments, files } from "~~/server/database/schema";
import { eq, and } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  // Only admins can promote folders to departments
  const user = await requireMinRole(event, "admin");
  const body = await readBody<{ folderId: string; name: string }>(event);

  if (!body.folderId || !body.name) {
    throw createError({ status: 400, message: "Folder ID and Name are required" });
  }

  const orgId = user.organizationId || "org_default";

  // Check if folder exists
  const folder = await getFolder(body.folderId, orgId);
  if (!folder) {
    throw createError({ status: 404, message: "Folder not found" });
  }

  // Check if department already exists for this folder
  const existingDept = await useDrizzle()
    .select()
    .from(orgDepartments)
    .where(and(eq(orgDepartments.folderId, body.folderId), eq(orgDepartments.organizationId, orgId)));

  if (existingDept && existingDept.length > 0) {
    throw createError({ status: 400, message: "This folder is already a department" });
  }

  const deptId = `${orgId}_${Date.now()}`;

  // Insert into org_departments
  await useDrizzle().insert(orgDepartments).values({
    id: deptId,
    organizationId: orgId,
    name: body.name,
    folderId: body.folderId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { status: "success", departmentId: deptId };
});
