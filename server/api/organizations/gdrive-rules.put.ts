import { upsertGDriveRules } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  // @ts-ignore
  if (user?.role !== "admin") {
    throw createError({ status: 403, message: "Only organization administrators can modify GDrive governance rules." });
  }

  const orgId = (user as any)?.organizationId;
  if (!orgId || orgId === "org_default") {
    throw createError({ status: 400, message: "No organization found." });
  }

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
