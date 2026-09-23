import { upsertGDriveRules } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  // @ts-ignore
  if (user?.role !== "admin") {
    throw createError({ status: 403, message: "Only organization administrators can modify governance rules." });
  }

  // Works for ALL org types (S3 and GDrive) — enforceNomenclature is org-type agnostic
  const orgId = (user as any)?.organizationId || "org_default";

  const { enforceNomenclature, enforceHierarchy, allowInterDeptVisibility } = await readBody<{
    enforceNomenclature: boolean;
    enforceHierarchy: boolean;
    allowInterDeptVisibility: boolean;
  }>(event);

  await upsertGDriveRules(orgId, {
    enforceNomenclature: !!enforceNomenclature,
    enforceHierarchy: !!enforceHierarchy,
    allowInterDeptVisibility: !!allowInterDeptVisibility,
  });

  return { success: true };
});
