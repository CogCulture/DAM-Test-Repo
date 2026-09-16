/**
 * BYOS (Bring Your Own Storage) — Storage Client Factory
 *
 * Creates a provider-specific storage client from the credentials stored in
 * byosStorageConfigs and exposes helpers:
 *   - verifyCredentials: lightweight HeadBucket call to validate keys
 *   - getPresignedPutUrl: generates a time-limited PUT presigned URL for direct browser uploads
 *   - getGcsOAuthToken: gets (and refreshes if needed) a GCS OAuth access token
 */

import { S3Client, HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { byosStorageConfigs } from "../database/schema";
import { eq, and } from "drizzle-orm";

export type ByosProvider = "aws" | "r2" | "gcs";

export interface ByosS3Config {
  provider: "aws" | "r2";
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  endpoint?: string; // Required for R2
}

export interface ByosGcsConfig {
  provider: "gcs";
  projectId: string;
  clientEmail: string;
  privateKey: string;
  bucketName: string;
}

export type ByosConfig = ByosS3Config | ByosGcsConfig;

// ─── S3 / R2 helpers ──────────────────────────────────────────────────────────

function buildS3Client(config: ByosS3Config): S3Client {
  return new S3Client({
    region: config.region || "auto",
    endpoint: config.provider === "r2" ? config.endpoint : undefined,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // R2 requires path-style: https://bucket.endpoint won't work with R2
    forcePathStyle: config.provider === "r2",
  });
}

async function verifyS3Credentials(config: ByosS3Config): Promise<void> {
  const client = buildS3Client(config);
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }));
  } catch (err: any) {
    // 403 means credentials are valid but access is restricted — bucket exists
    if (err?.$metadata?.httpStatusCode === 403) return;
    throw createError({
      status: 400,
      message: `Storage verification failed: ${err?.message ?? "Invalid credentials or bucket not found."}`,
    });
  }
}

async function getS3PresignedUrl(
  config: ByosS3Config,
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  const client = buildS3Client(config);
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

// ─── GCS helpers ──────────────────────────────────────────────────────────────

async function verifyGcsCredentials(config: ByosGcsConfig): Promise<void> {
  try {
    const { Storage } = await import("@google-cloud/storage");
    const storage = new Storage({
      projectId: config.projectId,
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey,
      },
    });
    // getMetadata is a lightweight call that validates credentials + bucket existence
    await storage.bucket(config.bucketName).getMetadata();
  } catch (err: any) {
    throw createError({
      status: 400,
      message: `GCS verification failed: ${err?.message ?? "Invalid credentials or bucket not found."}`,
    });
  }
}

async function getGcsPresignedUrl(
  config: ByosGcsConfig,
  fileName: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage({
    projectId: config.projectId,
    credentials: {
      client_email: config.clientEmail,
      private_key: config.privateKey,
    },
  });

  const [url] = await storage.bucket(config.bucketName).file(fileName).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + expiresIn * 1000,
    contentType,
  });
  return url;
}

/**
 * Verifies that the provided credentials can reach the specified bucket.
 * Throws a 400 error with a human-readable message on failure.
 */
export async function verifyByosCredentials(config: any, userId?: string): Promise<void> {
  if (config.provider === "gcs") {
    const isOAuth = config.gcsConnectionMode === "oauth_manual" || config.gcsConnectionMode === "oauth_auto";
    if (isOAuth) {
      if (!userId) throw createError({ status: 400, message: "User session required for GCS OAuth verification." });
      try {
        const token = await getGcsOAuthToken(userId);
        // Verify via API call with OAuth access token
        await $fetch(`https://storage.googleapis.com/storage/v1/b/${config.bucketName}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        return;
      } catch (err: any) {
        throw createError({
          status: 400,
          message: `GCS OAuth verification failed: ${err?.data?.error?.message ?? err.message ?? "Bucket not found or no access."}`
        });
      }
    }
    return verifyGcsCredentials(config as ByosGcsConfig);
  }
  return verifyS3Credentials(config as ByosS3Config);
}

/**
 * Generates a presigned PUT URL so the browser can upload directly to the
 * user's cloud storage bucket without the file passing through this server.
 * @param expiresIn - seconds until the URL expires (default: 15 minutes)
 */
export async function getByosPresignedPutUrl(
  config: ByosConfig,
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  if (config.provider === "gcs") {
    return getGcsPresignedUrl(config as ByosGcsConfig, key, contentType, expiresIn);
  }
  return getS3PresignedUrl(config as ByosS3Config, key, contentType, expiresIn);
}

// ─── GCS OAuth helpers (Options A & C) ────────────────────────────────────────

/**
 * Gets a valid GCS OAuth access token for the given user.
 * Automatically refreshes if expired or within 5 minutes of expiry.
 */
export async function getGcsOAuthToken(userId: string): Promise<string> {
  const db = useDrizzle();
  const [record] = await db
    .select()
    .from(byosStorageConfigs)
    .where(and(eq(byosStorageConfigs.userId, userId), eq(byosStorageConfigs.provider, "gcs")))
    .limit(1);

  if (!record?.gcsAccessToken) {
    throw createError({ status: 401, message: "GCS is not connected. Please connect your Google account first." });
  }

  const now = Date.now();
  if (record.gcsTokenExpiresAt && record.gcsTokenExpiresAt - now < 5 * 60 * 1000) {
    if (!record.gcsRefreshToken) {
      throw createError({ status: 401, message: "GCS session expired. Please reconnect your Google account." });
    }

    const config = useRuntimeConfig();
    const clientId = (config.public as any).oauth?.google?.clientId ?? process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;
    const clientSecret = (config as any).oauth?.google?.clientSecret ?? process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET;

    const resp = await $fetch<{ access_token: string; expires_in: number }>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId || "",
        client_secret: clientSecret || "",
        refresh_token: record.gcsRefreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    await db.update(byosStorageConfigs)
      .set({ gcsAccessToken: resp.access_token, gcsTokenExpiresAt: Date.now() + resp.expires_in * 1000, updatedAt: new Date() })
      .where(eq(byosStorageConfigs.id, record.id));

    return resp.access_token;
  }

  return record.gcsAccessToken;
}

/**
 * Saves or updates GCS OAuth tokens into byosStorageConfigs for the given user.
 */
export async function saveGcsOAuthTokens(
  userId: string,
  mode: "oauth_manual" | "oauth_auto",
  accessToken: string,
  refreshToken: string | null,
  expiresAt: number
): Promise<void> {
  const db = useDrizzle();
  const existing = await db
    .select({ id: byosStorageConfigs.id })
    .from(byosStorageConfigs)
    .where(and(eq(byosStorageConfigs.userId, userId), eq(byosStorageConfigs.provider, "gcs")))
    .limit(1);

  if (existing.length > 0) {
    await db.update(byosStorageConfigs)
      .set({ gcsConnectionMode: mode, gcsAccessToken: accessToken, gcsRefreshToken: refreshToken ?? undefined, gcsTokenExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(byosStorageConfigs.id, existing[0].id));
  } else {
    const { ulid } = await import("ulidx");
    await db.insert(byosStorageConfigs).values({
      id: ulid(),
      userId,
      provider: "gcs",
      bucketName: "_pending",
      gcsConnectionMode: mode,
      gcsAccessToken: accessToken,
      gcsRefreshToken: refreshToken,
      gcsTokenExpiresAt: expiresAt,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
