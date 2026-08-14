import { createFolderRequest, getBucket } from "~~/server/utils/db";
import { requireFileDepartmentAccess, requireFilePermission } from "~~/server/utils/permission";
import { ORG_BUCKET_NAME } from "~~/shared/constants/roles";
import { requireValidFolderName } from "~~/server/utils/folderNomenclature";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canCreateFolder");


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

  const resolvedParentId = parentId ?? "root";
  await requireFileDepartmentAccess(user, resolvedParentId);
  await requireValidFolderName({
    user,
    folderName: folderName.trim(),
    departmentId: user.departmentId,
  });

  // @ts-ignore
  const result = await createFolderRequest({
    // @ts-ignore
    requestedBy: user.id,
    // @ts-ignore
    departmentId: user.departmentId ?? "",
    folderName: folderName.trim(),
    parentId: resolvedParentId,
    bucketName: ORG_BUCKET_NAME,
  });

  return { success: true, id: result.id };
});
