import { upsertNomenclature, getOrgDepartments, getOrgFeatures } from "~~/server/utils/db";
import { requireDeptHead } from "~~/server/utils/permission";
import { DEPARTMENT_MAP } from "~~/shared/constants/departments";
import { normalizeAllowedExtensions, normalizeNomenclatureSegments } from "~~/shared/utils/file-nomenclature";

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

  const { template, segments, allowedExtensions, folderSegments } = await readBody<{
    template: string;
    segments: { key: string; label: string; allowedValues: string[] }[];
    allowedExtensions?: string[] | null;
    folderSegments?: { key: string; label: string; allowedValues: string[] }[] | null;
  }>(event);

  if (!template || !segments?.length) {
    throw createError({ status: 400, message: "template and segments are required." });
  }

  const normalizedSegments = normalizeNomenclatureSegments(segments);
  if (normalizedSegments.some((segment) => !segment.key || !segment.label)) {
    throw createError({ status: 400, message: "Every nomenclature segment needs a key and label." });
  }
  if (normalizedSegments.some((segment) => segment.key.includes("_") || segment.allowedValues.some((value) => value.includes("_")))) {
    throw createError({ status: 400, message: "Segment keys and allowed values cannot contain underscores." });
  }
  const uniqueKeys = new Set(normalizedSegments.map((segment) => segment.key.toLowerCase()));
  if (uniqueKeys.size !== normalizedSegments.length) {
    throw createError({ status: 400, message: "Nomenclature segment keys must be unique." });
  }
  const normalizedFolderSegments = normalizeNomenclatureSegments(
    Array.isArray(folderSegments) ? folderSegments : [],
  );
  if (normalizedFolderSegments.some((segment) => !segment.key || !segment.label)) {
    throw createError({ status: 400, message: "Every folder nomenclature segment needs a key and label." });
  }
  if (normalizedFolderSegments.some((segment) => segment.key.includes("_") || segment.allowedValues.some((value) => value.includes("_")))) {
    throw createError({ status: 400, message: "Folder segment keys and allowed values cannot contain underscores." });
  }
  const uniqueFolderKeys = new Set(normalizedFolderSegments.map((segment) => segment.key.toLowerCase()));
  if (uniqueFolderKeys.size !== normalizedFolderSegments.length) {
    throw createError({ status: 400, message: "Folder nomenclature segment keys must be unique." });
  }
  let normalizedExtensions: string[] | null;
  try {
    normalizedExtensions = normalizeAllowedExtensions(allowedExtensions);
  } catch (error: any) {
    throw createError({ status: 400, message: error?.message || "Invalid allowed file extensions." });
  }


  // @ts-ignore
  await upsertNomenclature(
    dept,
    orgId,
    normalizedSegments.map((segment) => segment.key).join("_"),
    normalizedSegments,
    normalizedExtensions,
    user.id,
    normalizedFolderSegments.map((segment) => segment.key).join("_") || null,
    normalizedFolderSegments,
  );
  return { success: true };
});
