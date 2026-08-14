import { requireFilePermission } from "~~/server/utils/permission";
import { getOrgDepartments } from "~~/server/utils/db";
import { buildDepartmentUploadOptions } from "~~/shared/utils/department-upload";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canUpload");
  const organizationId = (user as any).organizationId;
  const departments = await getOrgDepartments(organizationId);

  return buildDepartmentUploadOptions({
    actor: user as any,
    departments,
  });
});
