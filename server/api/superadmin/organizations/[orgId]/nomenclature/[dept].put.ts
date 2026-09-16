import { and, eq } from "drizzle-orm";
import { orgDepartments } from "~~/server/database/schema";
import { getGDriveRules, upsertGDriveRules, upsertNomenclature } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { normalizeAllowedExtensions, normalizeNomenclatureSegments } from "~~/shared/utils/file-nomenclature";

const normalizeSegments = (input: unknown, kind: "file" | "folder") => {
  if (!Array.isArray(input) || (kind === "file" && input.length === 0)) {
    throw createError({ status: 400, message: `${kind === "file" ? "File" : "Folder"} nomenclature segments are invalid.` });
  }
  const segments = normalizeNomenclatureSegments(input as any[]);
  if (segments.some(segment => !segment.key || !segment.label)) {
    throw createError({ status: 400, message: `Every ${kind} segment needs a key and label.` });
  }
  if (segments.some(segment => segment.key.includes("_") || segment.allowedValues.some(value => value.includes("_")))) {
    throw createError({ status: 400, message: `${kind} segment keys and allowed values cannot contain underscores.` });
  }
  if (new Set(segments.map(segment => segment.key.toLocaleLowerCase())).size !== segments.length) {
    throw createError({ status: 400, message: `${kind} segment keys must be unique.` });
  }
  return segments;
};

export default defineEventHandler(async (event) => {
  const session = await requireSuperAdmin(event);
  const { orgId, dept: departmentId } = getRouterParams(event);
  const [department] = await useDrizzle().select({ id: orgDepartments.id })
    .from(orgDepartments)
    .where(and(eq(orgDepartments.id, departmentId), eq(orgDepartments.organizationId, orgId)));
  if (!department) throw createError({ status: 404, message: "Organization department not found." });

  const body = await readBody<{
    segments?: unknown[];
    folderSegments?: unknown[];
    allowedExtensions?: unknown[] | null;
    enforceNomenclature?: boolean;
  }>(event);
  const segments = normalizeSegments(body.segments, "file");
  const folderSegments = normalizeSegments(body.folderSegments || [], "folder");
  let allowedExtensions: string[] | null;
  try {
    allowedExtensions = normalizeAllowedExtensions(body.allowedExtensions);
  } catch (error: any) {
    throw createError({ status: 400, message: error?.message || "Allowed extensions are invalid." });
  }

  await upsertNomenclature(
    departmentId,
    orgId,
    segments.map(segment => segment.key).join("_"),
    segments,
    allowedExtensions,
    `superadmin:${session.data.email || "system"}`,
    folderSegments.map(segment => segment.key).join("_") || null,
    folderSegments,
  );
  const existingRules = await getGDriveRules(orgId);
  await upsertGDriveRules(orgId, {
    enforceNomenclature: !!body.enforceNomenclature,
    enforceHierarchy: !!existingRules.enforceHierarchy,
    allowInterDeptVisibility: existingRules.allowInterDeptVisibility !== false,
  });
  return { success: true };
});
