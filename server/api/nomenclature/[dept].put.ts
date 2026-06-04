import { upsertNomenclature, getOrgDepartments, getOrgFeatures } from "~~/server/utils/db";
import { requireDeptHead } from "~~/server/utils/permission";
import { DEPARTMENT_MAP } from "~~/shared/constants/departments";

export default defineEventHandler(async (event) => {
  const { dept } = getRouterParams(event);

  // Only the dept_head of THIS department (or admin) can update it
  const user = await requireDeptHead(event, dept);

  const orgId = (user as any)?.organizationId || "org_default";

  // Check feature flag
  const features = await getOrgFeatures(orgId);
  if (!features.nomenclature) {
    throw createError({ status: 403, message: "Nomenclature feature is not enabled for your organization." });
  }

  // Check if it is a valid static department OR a valid custom department in the organization
  const baseDept = dept.split("_").pop() || "";
  const isStaticValid = !!DEPARTMENT_MAP[baseDept] || !!DEPARTMENT_MAP[dept];

  let isValid = isStaticValid;
  if (!isValid) {
    const orgDepts = await getOrgDepartments(orgId);
    isValid = orgDepts.some(d => d.id === dept || d.id === `${orgId}_${dept}`);
  }

  if (!isValid) {
    throw createError({ status: 400, message: "Invalid department." });
  }

  const { template, segments } = await readBody<{
    template: string;
    segments: { key: string; label: string; allowedValues: string[] }[];
  }>(event);

  if (!template || !segments?.length) {
    throw createError({ status: 400, message: "template and segments are required." });
  }

  // @ts-ignore
  await upsertNomenclature(dept, template, segments, user.id);
  return { success: true };
});

