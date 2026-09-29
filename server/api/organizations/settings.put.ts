import { updateOrganizationSettings, getOrgFeatures } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  
  // @ts-ignore
  if (user?.role !== "admin") {
    throw createError({ status: 403, message: "Only organization administrators can modify settings." });
  }

  const orgId = (user as any)?.organizationId || "org_default";

  const { name, departments, permissions } = await readBody<{
    name?: string;
    departments?: any[];
    permissions?: any[];
  }>(event);

  if (name !== undefined && !name.trim()) {
    throw createError({ status: 400, message: "Organization name cannot be empty." });
  }

  // Feature flag enforcement
  const features = await getOrgFeatures(orgId);

  // If hierarchy is disabled, ignore department changes
  // If userPermissions is disabled, ignore permission changes
  const effectiveDepartments = departments !== undefined ? (features.hierarchy ? departments : []) : undefined;
  const effectivePermissions = permissions !== undefined ? (features.userPermissions ? permissions : []) : undefined;

  await updateOrganizationSettings(orgId, name ? name.trim() : undefined, effectiveDepartments, effectivePermissions, user.id as string);

  return { success: true };
});
