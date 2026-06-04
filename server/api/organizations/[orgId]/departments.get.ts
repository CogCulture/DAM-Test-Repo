import { getOrgDepartments } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const { orgId } = getRouterParams(event);
  
  if (!orgId) {
    throw createError({ status: 400, message: "Organization ID is required." });
  }

  const list = await getOrgDepartments(orgId);
  return list;
});
