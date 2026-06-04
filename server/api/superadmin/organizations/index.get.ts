import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations, users, files, gdriveFolders } from "~~/server/database/schema";
import { eq, count, sum, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const db = useDrizzle();

  const allOrgs = await db.select().from(organizations);

  const result = await Promise.all(
    allOrgs.map(async (org) => {
      const [memberCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.organizationId, org.id));

      const [storageData] = await db
        .select({ total: sum(files.size) })
        .from(files)
        .where(eq(files.organizationId, org.id));

      const gdriveConn = await db
        .select()
        .from(gdriveFolders)
        .where(eq(gdriveFolders.organizationId, org.id))
        .limit(1);

      return {
        id: org.id,
        name: org.name,
        status: org.status,
        orgType: org.orgType,
        features: org.features ?? {
          nomenclature: true,
          hierarchy: true,
          userPermissions: true,
          templateFolders: true,
        },
        memberCount: memberCount.count,
        storageBytes: Number(storageData.total ?? 0),
        gdriveStatus: gdriveConn.length > 0 ? gdriveConn[0].status : null,
        createdAt: org.createdAt,
      };
    })
  );

  return result;
});
