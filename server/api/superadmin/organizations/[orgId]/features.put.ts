import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const { orgId } = getRouterParams(event);
  const db = useDrizzle();

  const body = await readBody<{
    nomenclature?: boolean;
    hierarchy?: boolean;
    userPermissions?: boolean;
    templateFolders?: boolean;
  }>(event);

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) {
    throw createError({ status: 404, message: "Organization not found." });
  }

  const currentFeatures = org.features ?? {
    nomenclature: true,
    hierarchy: true,
    userPermissions: true,
    templateFolders: true,
  };

  const updatedFeatures = {
    nomenclature: body.nomenclature ?? currentFeatures.nomenclature,
    hierarchy: body.hierarchy ?? currentFeatures.hierarchy,
    userPermissions: body.userPermissions ?? currentFeatures.userPermissions,
    templateFolders: body.templateFolders ?? currentFeatures.templateFolders,
  };

  await db
    .update(organizations)
    .set({ features: updatedFeatures, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  return { success: true, features: updatedFeatures };
});
