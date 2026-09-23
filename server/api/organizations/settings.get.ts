import { getOrgDepartments, getOrgPermissions, getGDriveRules } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

const DEFAULT_FEATURES = {
  nomenclature: true,
  hierarchy: true,
  userPermissions: true,
  templateFolders: true,
};

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const orgId = (user as any)?.organizationId || "org_default";

  // 1. Get Org
  let orgResult = await useDrizzle()
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId));
  
  if (!orgResult || orgResult.length === 0) {
    if (orgId === "org_default") {
      await useDrizzle().insert(organizations).values({
        id: "org_default",
        name: "Default Organization",
        status: "active",
        orgType: "s3",
        features: DEFAULT_FEATURES,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      orgResult = [{ id: "org_default", name: "Default Organization", status: "active", orgType: "s3", features: DEFAULT_FEATURES } as any];
    } else {
      throw createError({ status: 404, message: "Organization not found." });
    }
  }

  // 2. Get Org Departments
  const departments = await getOrgDepartments(orgId);

  // 3. Get Org Permissions
  const permissions = await getOrgPermissions(orgId);

  const org = orgResult[0];
  const orgType = (org as any).orgType ?? "s3";

  // 4. Get governance rules (enforceNomenclature applies to all org types: s3, gdrive, byos)
  const gdriveRules = await getGDriveRules(orgId);

  let orgFeatures = (org as any).features;
  if (typeof orgFeatures === "string") {
    try { orgFeatures = JSON.parse(orgFeatures); } catch { orgFeatures = null; }
  }

  const features = {
    ...DEFAULT_FEATURES,
    ...(orgFeatures || {}),
  };

  return {
    id: orgId,
    name: org.name,
    status: org.status ?? "active",
    orgType,
    features,
    departments,
    permissions,
    gdriveRules,
  };
});

