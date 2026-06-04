import { createFolderRequest, getBucket } from "~~/server/utils/db";
import { requireMinRole, getApprovedUser } from "~~/server/utils/permission";
import { ORG_BUCKET_NAME } from "~~/shared/constants/roles";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);

  // @ts-ignore
  const canCreate = user.permissions?.canCreateFolder || user.role === "admin";
  if (!canCreate) {
    throw createError({
      status: 403,
      message: "Insufficient permissions.",
    });
  }

  const { folderName, parentId } = await readBody<{
    folderName: string;
    parentId?: string;
  }>(event);

  if (!folderName?.trim()) {
    throw createError({ status: 400, message: "Folder name is required." });
  }

  const bucket = await getBucket(ORG_BUCKET_NAME);
  if (!bucket) {
    throw createError({ status: 404, message: "Organization bucket not found." });
  }

  // @ts-ignore
  const result = await createFolderRequest({
    // @ts-ignore
    requestedBy: user.id,
    // @ts-ignore
    departmentId: user.departmentId ?? "",
    folderName: folderName.trim(),
    parentId: parentId ?? "root",
    bucketName: ORG_BUCKET_NAME,
  });

  return { success: true, id: result.id };
});
