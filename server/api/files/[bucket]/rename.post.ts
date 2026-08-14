import { ensureFile, renameItem } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";

const isValidItemName = (value: string) => {
  return (
    !!value &&
    value.length <= 255 &&
    value !== "." &&
    value !== ".." &&
    !/[<>:"/\\|?*\u0000-\u001F]/.test(value) &&
    !/[. ]$/.test(value) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(value)
  );
};

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canRename");
  const body = await readBody<{ file: { id: string }; name: string }>(event);

  if (!body.file?.id || !body.name) {
    throw createError({ status: 400, message: "File ID and new name are required." });
  }

  const name = body.name.trim();
  if (!isValidItemName(name)) {
    throw createError({
      status: 400,
      message: "Enter a valid name without reserved characters or trailing spaces.",
    });
  }

  // @ts-ignore
  const role = user.role;
  // @ts-ignore
  const userDept = user.departmentId;
  const file = await ensureFile(bucket.name, body.file.id);
  await requireFileDepartmentAccess(user, file.id);

  if (role !== "admin") {
    if (!userDept) {
      throw createError({
        status: 403,
        message: "You must belong to a department to rename items.",
      });
    }

    const fileDept = userDept;
    if (fileDept !== userDept) {
      throw createError({
        status: 403,
        message: "You can only rename items belonging to your own department.",
      });
    }
  }

  await renameItem(bucket.name, body.file.id, name);
  const renamedFile = await ensureFile(bucket.name, body.file.id);
  return { status: "success", file: renamedFile };
});
