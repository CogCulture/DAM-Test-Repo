import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations, byosStorageConfigs, gdriveFolders } from "~~/server/database/schema";
import { eq } from "drizzle-orm";
import { ulid } from "ulidx";
import { verifyByosCredentials, type ByosConfig } from "~~/server/utils/byosStorage";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (!user || !(user as any).organizationId) {
    throw createError({ status: 401, message: "Unauthorized or missing organization." });
  }

  const body = await readBody<{
    orgType: "s3" | "gdrive" | "byos" | "onedrive" | "sharepoint" | "box" | "dropbox";
    byosConfig?: ByosConfig;
    gdriveFolderId?: string;
    gdriveFolderName?: string;
  }>(event);

  const { orgType, byosConfig, gdriveFolderId, gdriveFolderName } = body;
  if (!["s3", "gdrive", "byos", "onedrive", "sharepoint", "box", "dropbox"].includes(orgType)) {
    throw createError({ status: 400, message: "Invalid storage type." });
  }

  const orgId = (user as any).organizationId;
  const db = useDrizzle();

  // If BYOS selected, verify and save config
  if (orgType === "byos" && byosConfig) {
    await verifyByosCredentials(byosConfig);

    const byosConfigId = ulid();
    await db.insert(byosStorageConfigs).values({
      id: byosConfigId,
      userId: user.id,
      provider: byosConfig.provider,
      bucketName: byosConfig.bucketName,
      accessKeyId: byosConfig.provider !== "gcs" ? (byosConfig as any).accessKeyId : null,
      secretAccessKey: byosConfig.provider !== "gcs" ? (byosConfig as any).secretAccessKey : null,
      region: byosConfig.provider !== "gcs" ? (byosConfig as any).region : null,
      endpoint: byosConfig.provider === "r2" ? (byosConfig as any).endpoint : null,
      projectId: byosConfig.provider === "gcs" ? (byosConfig as any).projectId : null,
      clientEmail: byosConfig.provider === "gcs" ? (byosConfig as any).clientEmail : null,
      privateKey: byosConfig.provider === "gcs" ? (byosConfig as any).privateKey : null,
      status: "verified",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Update organization orgType
  await db
    .update(organizations)
    .set({
      orgType,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  // Refresh user session with updated orgType
  const session = await getUserSession(event);
  await setUserSession(event, {
    ...session,
    user: {
      ...session.user,
      // @ts-ignore
      orgType,
    },
  });

  return { success: true, orgType };
});
