import { and, eq } from "drizzle-orm";
import { orgDepartments } from "~~/server/database/schema";
import { getGDriveRules, getNomenclature } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireSuperAdmin } from "~~/server/utils/superadmin";

const defaultSegments = [
  { key: "Brand", label: "Brand", allowedValues: [] },
  { key: "Campaign", label: "Campaign", allowedValues: [] },
  { key: "Channel", label: "Channel", allowedValues: [] },
  { key: "Asset", label: "Asset Type", allowedValues: [] },
  { key: "Format", label: "Format", allowedValues: [] },
  { key: "Version", label: "Version", allowedValues: [] },
  { key: "Date", label: "Date", allowedValues: [] },
];

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const { orgId, dept: departmentId } = getRouterParams(event);
  const [department] = await useDrizzle().select({ id: orgDepartments.id })
    .from(orgDepartments)
    .where(and(eq(orgDepartments.id, departmentId), eq(orgDepartments.organizationId, orgId)));
  if (!department) throw createError({ status: 404, message: "Organization department not found." });

  const [nomenclature, rules] = await Promise.all([
    getNomenclature(departmentId) as Promise<any>,
    getGDriveRules(orgId),
  ]);
  const segments = Array.isArray(nomenclature?.segments) && nomenclature.segments.length
    ? nomenclature.segments
    : defaultSegments;
  return {
    departmentId,
    template: segments.map((segment: any) => segment.key).join("_"),
    segments,
    allowedExtensions: Array.isArray(nomenclature?.allowedExtensions) ? nomenclature.allowedExtensions : [],
    folderTemplate: nomenclature?.folderTemplate || "",
    folderSegments: Array.isArray(nomenclature?.folderSegments) ? nomenclature.folderSegments : [],
    enforceNomenclature: !!rules.enforceNomenclature,
  };
});
