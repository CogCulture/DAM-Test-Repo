import { useDrizzle } from "~~/server/utils/drizzle";
import { orgDepartments, organizations } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const user = session?.user as any;
  let orgId = user?.organizationId;

  const db = useDrizzle();

  if (!orgId) {
    const firstOrg = await db.select({ id: organizations.id }).from(organizations).limit(1);
    orgId = firstOrg[0]?.id;
  }

  let depts = [];
  if (orgId) {
    depts = await db
      .select({
        id: orgDepartments.id,
        name: orgDepartments.name,
        parentId: orgDepartments.parentId,
        folderId: orgDepartments.folderId,
      })
      .from(orgDepartments)
      .where(eq(orgDepartments.organizationId, orgId));
  }

  if (!depts || depts.length === 0) {
    depts = await db
      .select({
        id: orgDepartments.id,
        name: orgDepartments.name,
        parentId: orgDepartments.parentId,
        folderId: orgDepartments.folderId,
      })
      .from(orgDepartments);
  }

  return depts || [];
});
