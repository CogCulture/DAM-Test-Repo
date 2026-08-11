import {
  getFolderRequestById,
  updateFolderRequestStatus,
  ensurePath,
  getFolder,
} from "~~/server/utils/db";
import { requireDeptHead } from "~~/server/utils/permission";
import { files, organizations, users, orgDepartments } from "~~/server/database/schema";
import { getGDriveAccessToken, createGDriveFolder, listGDriveFolder } from "~~/server/utils/gdrive";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq, and, isNull } from "drizzle-orm";
import { canReviewFolderRequest } from "~~/shared/utils/folder-creation-policy";
import { resolveFileCollision } from "~~/shared/utils/file-collision";

export default defineEventHandler(async (event) => {
  const user = await requireDeptHead(event);
  const { id } = getRouterParams(event);
  const { action, reviewNote } = await readBody<{
    action: "approve" | "reject";
    reviewNote?: string;
  }>(event);

  if (!["approve", "reject"].includes(action)) {
    throw createError({ status: 400, message: "Invalid action." });
  }

  const request = await getFolderRequestById(id);
  if (!request) {
    throw createError({ status: 404, message: "Folder request not found." });
  }
  if (request.status !== "pending") {
    throw createError({ status: 409, message: "Request already reviewed." });
  }

  if (!canReviewFolderRequest(user, request.departmentId)) {
    throw createError({
      status: 403,
      message: "Only organization administrators or the request's Department Head can review this folder request.",
    });
  }

  let finalFolderName: string | undefined;

  // If approved, actually create the folder
  if (action === "approve") {
    const db = useDrizzle();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, request.organizationId));

    if (org && org.orgType === "gdrive") {
      // Find the admin of this organization to get their Google Drive connection credentials
      const [orgAdmin] = await db
        .select()
        .from(users)
        .where(and(eq(users.organizationId, request.organizationId), eq(users.role, "admin")));

      if (!orgAdmin) {
        throw createError({ status: 500, message: "Organization admin not found for Drive connection." });
      }

      const token = await getGDriveAccessToken(orgAdmin.id);
      
      let parentFolderId = request.parentId;
      if (request.parentId === "root") {
        const [dept] = await db
          .select()
          .from(orgDepartments)
          .where(eq(orgDepartments.id, request.departmentId));
        if (dept && dept.gdriveFolderId) {
          parentFolderId = dept.gdriveFolderId;
        } else {
          throw createError({ status: 500, message: "Department GDrive folder is not set up." });
        }
      }

      const driveSiblings = await listGDriveFolder(token, parentFolderId);
      const collision = resolveFileCollision({
        requestedName: request.folderName,
        existingNames: driveSiblings.map((item) => item.name),
      });
      finalFolderName = collision.finalName;

      await createGDriveFolder(token, parentFolderId, finalFolderName);
    } else {
      const siblingRows = await db
        .select({ name: files.name })
        .from(files)
        .where(and(
          eq(files.organizationId, request.organizationId),
          eq(files.parentId, request.parentId),
          eq(files.type, "folder"),
          isNull(files.deletedAt),
        ));
      const collision = resolveFileCollision({
        requestedName: request.folderName,
        existingNames: siblingRows.map((item) => item.name),
      });
      finalFolderName = collision.finalName;
      let folderPath = `${request.bucketName}/${finalFolderName}`;
      if (request.parentId && request.parentId !== "root") {
        const parentFolder = await getFolder(request.parentId, request.organizationId);
        if (parentFolder) {
          folderPath = `${parentFolder.path}/${finalFolderName}`;
        }
      }

      await ensurePath(request.bucketName, folderPath, request.requestedBy, false);
    }
  }

  await updateFolderRequestStatus(
    id,
    action === "approve" ? "approved" : "rejected",
    user.id,
    reviewNote,
    finalFolderName,
  );

  return { success: true, action, finalFolderName };
});
