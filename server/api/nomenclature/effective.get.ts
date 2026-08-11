import { getGDriveRules, getNomenclatureForDept, getOrgDepartments, getOrgFeatures } from "~~/server/utils/db";
import { getApprovedUser } from "~~/server/utils/permission";
import { resolveDepartmentUploadTarget } from "~~/shared/utils/department-upload";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);
  const organizationId = (user as any).organizationId || "org_default";
  const requestedDepartmentId = String(getQuery(event).departmentId || "").trim();
  let departmentId = (user as any).departmentId || null;
  if (requestedDepartmentId && requestedDepartmentId !== "root") {
    const departments = await getOrgDepartments(organizationId);
    try {
      departmentId = resolveDepartmentUploadTarget({
        actor: user as any,
        departments,
        departmentId: requestedDepartmentId,
      }).departmentId;
    } catch (error: any) {
      const message = error?.message || "Invalid department.";
      throw createError({ status: /access/i.test(message) ? 403 : 404, message });
    }
  }

  const [features, rules, nomenclature] = await Promise.all([
    getOrgFeatures(organizationId),
    getGDriveRules(organizationId),
    getNomenclatureForDept(organizationId, departmentId),
  ]);

  return {
    enabled: features.nomenclature !== false,
    enforced: features.nomenclature !== false && !!rules.enforceNomenclature,
    nomenclature,
  };
});
