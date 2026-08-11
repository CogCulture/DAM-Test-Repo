import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { 
  organizations, 
  users, 
  orgDepartments, 
  orgPermissions, 
  nomenclatures, 
  folderRequests, 
  gdriveFolders, 
  orgGDriveRules, 
  deptInvites, 
  userPermissionOverrides,
  buckets,
  files,
  favorites,
  shared,
  organizationRequests,
  website
} from "~~/server/database/schema";
import { eq, inArray, or } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const { orgId } = getRouterParams(event);
  if (!orgId) {
    throw createError({ status: 400, message: "Organization ID is required." });
  }

  const db = useDrizzle();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) {
    throw createError({ status: 404, message: "Organization not found." });
  }

  // Fetch all user IDs in this organization to purge their other associations
  const orgUsers = await db.select({ id: users.id }).from(users).where(eq(users.organizationId, orgId));
  const orgUserIds = orgUsers.map(u => u.id);

  // Fetch all file IDs in this organization to purge website/domain mappings
  const orgFiles = await db.select({ id: files.id }).from(files).where(eq(files.organizationId, orgId));
  const orgFileIds = orgFiles.map(f => f.id);

  // 1. Delete organization requests for this organization (by name or by user IDs)
  await db.delete(organizationRequests).where(eq(organizationRequests.orgName, org.name));
  if (orgUserIds.length > 0) {
    await db.delete(organizationRequests).where(inArray(organizationRequests.userId, orgUserIds));
  }

  // 2. Delete domain mappings (website table) linked to any files of this organization
  if (orgFileIds.length > 0) {
    await db.delete(website).where(inArray(website.fileId, orgFileIds));
  }

  // 3. Delete any Google Drive integration folders linked to this organization or its users
  await db.delete(gdriveFolders).where(eq(gdriveFolders.organizationId, orgId));
  if (orgUserIds.length > 0) {
    await db.delete(gdriveFolders).where(inArray(gdriveFolders.userId, orgUserIds));
  }

  // 4. Delete all users belonging to this organization (makes them fresh sign-ups)
  await db.delete(users).where(eq(users.organizationId, orgId));

  // 5. Delete all organization configuration and governance details
  await db.delete(orgDepartments).where(eq(orgDepartments.organizationId, orgId));
  await db.delete(orgPermissions).where(eq(orgPermissions.organizationId, orgId));
  await db.delete(nomenclatures).where(eq(nomenclatures.organizationId, orgId));
  await db.delete(folderRequests).where(eq(folderRequests.organizationId, orgId));
  await db.delete(orgGDriveRules).where(eq(orgGDriveRules.organizationId, orgId));
  await db.delete(deptInvites).where(eq(deptInvites.organizationId, orgId));
  await db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.organizationId, orgId));

  // 6. Delete files, buckets, favorites, and shared scope
  await db.delete(buckets).where(eq(buckets.organizationId, orgId));
  await db.delete(files).where(eq(files.organizationId, orgId));
  await db.delete(favorites).where(eq(favorites.organizationId, orgId));
  await db.delete(shared).where(eq(shared.organizationId, orgId));

  // 7. Finally delete the organization record
  await db.delete(organizations).where(eq(organizations.id, orgId));

  return { success: true, message: `Organization "${org.name}" deleted successfully along with all users and data.` };
});

