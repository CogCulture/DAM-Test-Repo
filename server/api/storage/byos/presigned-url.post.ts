/**
 * POST /api/storage/byos/presigned-url
 *
 * Generates a short-lived presigned PUT URL so the browser can upload a file
 * **directly** to the org's BYOS bucket without the data passing through this server.
 *
 * Body: { fileName: string; contentType: string; bucketName?: string }
 * Returns: { url: string; key: string }
 */

import { getVerifiedUser } from "~~/server/utils/permission";
import { useDrizzle } from "~~/server/utils/drizzle";
import { byosStorageConfigs, organizations } from "~~/server/database/schema";
import { eq, and } from "drizzle-orm";
import { getByosPresignedPutUrl, type ByosConfig } from "~~/server/utils/byosStorage";

export default defineEventHandler(async (event) => {
  const user = await getVerifiedUser(event);

  if (!user.organizationId) {
    throw createError({ status: 400, message: "User is not part of an organization." });
  }

  const [org] = await useDrizzle()
    .select({ orgType: organizations.orgType })
    .from(organizations)
    .where(eq(organizations.id, user.organizationId))
    .limit(1);

  if (!org || org.orgType !== "byos") {
    throw createError({ status: 400, message: "This organization does not use BYOS storage." });
  }

  const [byosConfig] = await useDrizzle()
    .select()
    .from(byosStorageConfigs)
    .where(eq(byosStorageConfigs.organizationId, user.organizationId))
    .limit(1);

  if (!byosConfig) {
    throw createError({ status: 500, message: "BYOS storage configuration not found for this organization." });
  }

  const body = await readBody<{ fileName: string; contentType: string }>(event);

  const safeFileName = body.fileName
    .replace(/\\/g, "/")
    .replace(/[<>:"|?*\u0000-\u001F]/g, "-")
    .split("/")
    .filter((segment) => segment && segment !== ".." && segment !== ".")
    .join("/");

  if (!safeFileName) {
    throw createError({ status: 400, message: "Invalid fileName." });
  }

  // Build a key scoped under the org so different orgs can't overwrite each other
  const key = `${user.organizationId}/${safeFileName}`;

  let config: ByosConfig;

  if (byosConfig.provider === "gcs") {
    config = {
      provider: "gcs",
      projectId: byosConfig.projectId!,
      clientEmail: byosConfig.clientEmail!,
      privateKey: byosConfig.privateKey!,
      bucketName: byosConfig.bucketName,
    };
  } else {
    config = {
      provider: byosConfig.provider as "aws" | "r2",
      accessKeyId: byosConfig.accessKeyId!,
      secretAccessKey: byosConfig.secretAccessKey!,
      bucketName: byosConfig.bucketName,
      region: byosConfig.region || "us-east-1",
      endpoint: byosConfig.endpoint ?? undefined,
    };
  }

  const url = await getByosPresignedPutUrl(config, key, body.contentType);

  return { url, key };
});
