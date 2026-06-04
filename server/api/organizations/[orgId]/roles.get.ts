import { getOrgPermissions } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const { orgId } = getRouterParams(event);
  
  if (!orgId) {
    throw createError({ status: 400, message: "Organization ID is required." });
  }

  const permissionsList = await getOrgPermissions(orgId);
  
  // Extract unique roles (excluding 'admin')
  const roles = permissionsList
    .map((p) => p.role)
    .filter((r) => r !== "admin");
    
  const uniqueRoles = Array.from(new Set(roles));

  // Construct label map or list format
  const roleLabelMap: Record<string, string> = {
    dept_head: "Department Head",
    team_lead: "Team Lead",
    team_member: "Team Member",
    intern: "Intern",
  };

  return uniqueRoles.map((r) => ({
    id: r,
    label: roleLabelMap[r] || r,
  }));
});
