/**
 * POST /api/storage/byos/verify-credentials
 *
 * Validates user-supplied BYOS credentials by performing a lightweight
 * HeadBucket (S3/R2) or getMetadata (GCS) call against the actual bucket.
 * No credentials are saved here — this is purely a validation check.
 */

import { verifyByosCredentials, type ByosConfig } from "~~/server/utils/byosStorage";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const body = await readBody<any>(event);

  if (!body?.provider) {
    throw createError({ status: 400, message: "Provider is required." });
  }

  if (body.provider === "gcs") {
    // If it's OAuth, we don't need service account keys in the request body
    const isOAuth = body.gcsConnectionMode === "oauth_manual" || body.gcsConnectionMode === "oauth_auto";
    if (isOAuth) {
      if (!body.projectId || !body.bucketName) {
        throw createError({ status: 400, message: "GCS OAuth verification requires projectId and bucketName." });
      }
    } else {
      if (!body.projectId || !body.clientEmail || !body.privateKey || !body.bucketName) {
        throw createError({ status: 400, message: "GCS requires projectId, clientEmail, privateKey, and bucketName." });
      }
    }
  } else {
    if (!body.accessKeyId || !body.secretAccessKey || !body.bucketName) {
      throw createError({ status: 400, message: "Access Key ID, Secret Access Key, and Bucket Name are required." });
    }
    if (body.provider === "r2" && !body.endpoint) {
      throw createError({ status: 400, message: "Cloudflare R2 requires an Endpoint URL." });
    }
  }

  // Inject current user ID so the verifier can resolve OAuth tokens if needed
  await verifyByosCredentials(body, user.id);

  return { valid: true, message: "Credentials verified successfully." };
});

