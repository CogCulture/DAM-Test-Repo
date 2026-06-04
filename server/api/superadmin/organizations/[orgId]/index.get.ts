import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations, users, files, gdriveFolders, orgDepartments, orgPermissions } from "~~/server/database/schema";
import { eq, sum, count, and } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const { orgId } = getRouterParams(event);
  const db = useDrizzle();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) {
    throw createError({ status: 404, message: "Organization not found." });
  }

  // Get ALL users in this org
  const members = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, orgId));

  // Storage stats
  const [storageData] = await db
    .select({ total: sum(files.size), fileCount: count() })
    .from(files)
    .where(and(eq(files.organizationId, orgId), eq(files.type, "file")));

  // Departments
  const departments = await db
    .select()
    .from(orgDepartments)
    .where(eq(orgDepartments.organizationId, orgId));

  // Permissions/roles
  const permissions = await db
    .select()
    .from(orgPermissions)
    .where(eq(orgPermissions.organizationId, orgId));

  // GDrive info
  const gdriveConns = await db
    .select()
    .from(gdriveFolders)
    .where(eq(gdriveFolders.organizationId, orgId));

  const gdriveStatus = gdriveConns.length > 0 ? gdriveConns[0].status : null;
  const gdriveFolderName = gdriveConns.length > 0 ? gdriveConns[0].folderName : null;

  // Build dept map for display
  const deptMap: Record<string, string> = {};
  for (const d of departments) {
    deptMap[d.id] = d.name;
  }

  const defaultFeatures = {
    nomenclature: true,
    hierarchy: true,
    userPermissions: true,
    templateFolders: true,
  };

  return {
    id: org.id,
    name: org.name,
    status: org.status ?? "active",
    orgType: (org as any).orgType ?? "s3",
    features: (org as any).features ?? defaultFeatures,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      departmentId: m.departmentId,
      departmentName: m.departmentId ? (deptMap[m.departmentId] ?? m.departmentId) : null,
      approvalStatus: m.approvalStatus,
      status: m.status,
      avatar: m.avatar,
      provider: m.provider,
      createdAt: m.createdAt,
    })),
    memberCount: members.length,
    storageBytes: Number(storageData?.total ?? 0),
    fileCount: Number(storageData?.fileCount ?? 0),
    departments,
    permissions,
    gdriveStatus,
    gdriveFolderName,
    createdAt: org.createdAt,
  };
});
