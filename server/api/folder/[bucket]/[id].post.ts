import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { resolveFolderCreationMode } from "~~/shared/utils/folder-creation-policy";
import { requireValidFolderName } from "~~/server/utils/folderNomenclature";

export default defineEventHandler(async (event) => {
  const { user } = await verifyBucket(event);
  // @ts-ignore
  const userId = user.id;
  // @ts-ignore
  const orgId = user.organizationId || "org_default";
  const params = getRouterParams(event);
  const { name, type } = await readBody(event);
  const requiredPermission = type === "file" ? "canUpload" : "canCreateFolder";
  if (user.permissions?.[requiredPermission] !== true) {
    throw createError({ status: 403, message: "Insufficient permissions." });
  }
  await requireFileDepartmentAccess(user, params.id);
  if (!name) {
    throw createError({
      message: `${type} name is required`,
      status: 400,
    });
  }
  const parent = await getParent(params.bucket, params.id, orgId);
  const fullPath = cleanPath(`${parent.path}/${name}`);
  // does file exist?
  const file = await getFile(params.bucket, fullPath, undefined, orgId);
  if (file) {
    throw createError({
      message: `${type} already exists`,
      status: 400,
    });
  }
  if (type === "file") {
    const fileName = fullPath.split("/").pop();
    if (!fileName) {
      throw createError({
        message: "Invalid file name",
        status: 400,
      });
    }
    const splitName = fileName.split(".");
    // If there's no extension (no dot or the dot is at the beginning)
    if (splitName.length < 2) {
      throw createError({
        message: "Invalid file extension",
        status: 400,
      });
    }
    const ext = splitName.pop() as keyof typeof validTextFiles;
    // Now check if it's a valid extension
    if (!Object.keys(validTextFiles).includes(ext)) {
      throw createError({
        message: `Invalid file extension. Supported extensions are ${Object.keys(
          validTextFiles
        ).join(", ")}`,
        status: 400,
      });
    }
    const contentType = validTextFiles[ext];
    await localBlob().put(fullPath, Buffer.alloc(0));
    const departmentId = params.id !== "root"
      ? (await getFileDepartmentId(params.id, orgId) || (user as any).departmentId || null)
      : ((user as any).departmentId || null);
    return insertUpdateFile(params.bucket, parent.id, {
      name: fileName,
      fullPath,
      contentType: contentType,
      size: 0,
      userId,
      departmentId,
      processingStatus: "pending_processing",
    });
  } else {
    if (resolveFolderCreationMode({
      role: user.role,
      canCreateFolder: user.permissions?.canCreateFolder === true,
    }) !== "direct") {
      throw createError({
        message: "Folder creation requires administrator or Department Head approval. Submit a folder request instead.",
        status: 403,
      });
    }
    await requireValidFolderName({ user, folderName: name });
    return await ensurePath(params.bucket, fullPath, userId);
  }
});
