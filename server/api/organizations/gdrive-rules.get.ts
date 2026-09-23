import { getGDriveRules } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  // @ts-ignore
  if (user?.role !== "admin") {
    throw createError({ status: 403, message: "Only organization administrators can view GDrive rules." });
  }

  const orgId = (user as any)?.organizationId || "org_default";
  const rules = await getGDriveRules(orgId);
  return rules;
});
