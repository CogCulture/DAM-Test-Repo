import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations, users, files, gdriveFolders, organizationRequests } from "~~/server/database/schema";
import { eq, count, sum, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const db = useDrizzle();

  const [totalOrgs] = await db.select({ count: count() }).from(organizations);
  const [totalUsers] = await db.select({ count: count() }).from(users);
  const [totalFiles] = await db.select({ count: count() }).from(files);
  const [totalStorage] = await db.select({ total: sum(files.size) }).from(files);

  const [activeGDrive] = await db
    .select({ count: count() })
    .from(gdriveFolders)
    .where(eq(gdriveFolders.status, "approved"));

  const [pendingGDrive] = await db
    .select({ count: count() })
    .from(gdriveFolders)
    .where(eq(gdriveFolders.status, "pending"));

  const [pendingOrgRequests] = await db
    .select({ count: count() })
    .from(organizationRequests)
    .where(eq(organizationRequests.status, "pending"));

  const [suspendedOrgs] = await db
    .select({ count: count() })
    .from(organizations)
    .where(eq(organizations.status, "suspended"));

  return {
    totalOrgs: totalOrgs.count,
    totalUsers: totalUsers.count,
    totalFiles: totalFiles.count,
    totalStorageBytes: Number(totalStorage.total ?? 0),
    activeGDriveConnections: activeGDrive.count,
    pendingGDriveRequests: pendingGDrive.count,
    pendingOrgRequests: pendingOrgRequests.count,
    suspendedOrgs: suspendedOrgs.count,
  };
});
