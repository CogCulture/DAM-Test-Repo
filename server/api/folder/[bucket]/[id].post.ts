export default defineEventHandler(async (event) => {
  const { user } = await verifyBucket(event);
  // @ts-ignore
  const userId = user.id;
  // @ts-ignore
  const orgId = user.organizationId || "org_default";
  const params = getRouterParams(event);
  const { name, type } = await readBody(event);
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
    const emptyFile = new Blob([""], { type: contentType });
    hubBlob().put(fullPath, emptyFile);
    return insertUpdateFile(params.bucket, parent.id, {
      name: fileName,
      fullPath,
      contentType: contentType,
      size: 0,
      userId,
    });
  } else {
    // @ts-ignore
    const canCreate = user.permissions?.canCreateFolder || user.role === "admin";
    if (!canCreate) {
      throw createError({
        message: "You do not have permission to create folders directly. Please submit a folder creation request.",
        status: 403,
      });
    }
    return await ensurePath(params.bucket, fullPath, userId);
  }
});
