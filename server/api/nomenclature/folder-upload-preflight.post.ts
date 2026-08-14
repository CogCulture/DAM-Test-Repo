import { resolveDepartmentUploadTarget } from "~~/shared/utils/department-upload";
import { normalizeUploadRelativePath } from "~~/shared/utils/folder-upload-target";
import { getOrgDepartments } from "~~/server/utils/db";
import { requireValidFolderPaths } from "~~/server/utils/folderNomenclature";
import { requireFilePermission } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canUpload");
  const { paths, departmentId: requestedDepartmentId } = await readBody<{
    paths?: string[];
    departmentId?: string | null;
    destinationFolderId?: string | null;
  }>(event);

  if (!Array.isArray(paths) || paths.length > 5000 || paths.some((path) => typeof path !== "string")) {
    throw createError({ status: 400, message: "Folder paths are invalid." });
  }

  const normalizedPaths = paths.map((path) => {
    try {
      return normalizeUploadRelativePath(`${path}/.folder-preflight`).directories.join("/");
    } catch {
      throw createError({ status: 400, message: `Invalid folder path: ${path}` });
    }
  });

  const organizationId = (user as any).organizationId || "org_default";
  let departmentId = (user as any).departmentId || null;
  if (requestedDepartmentId === "root") {
    if ((user as any).role !== "admin") {
      throw createError({ status: 403, message: "Only organization administrators can upload to the organization root." });
    }
    departmentId = null;
  } else if (requestedDepartmentId) {
    const departments = await getOrgDepartments(organizationId);
    try {
      departmentId = resolveDepartmentUploadTarget({
        actor: user as any,
        departments,
        departmentId: requestedDepartmentId,
      }).departmentId;
    } catch (error: any) {
      const message = error?.message || "Invalid upload department.";
      throw createError({ status: /access/i.test(message) ? 403 : 404, message });
    }
  }

  await requireValidFolderPaths({ user, paths: normalizedPaths, departmentId });
  return { valid: true };
});
