/**
 * GET /api/storage/gcs/status
 * Returns whether the current user has a GCS OAuth token stored.
 */
import { byosStorageConfigs } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq, and } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const db = useDrizzle();

  const [record] = await db
    .select({
      id: byosStorageConfigs.id,
      gcsConnectionMode: byosStorageConfigs.gcsConnectionMode,
      gcsAccessToken: byosStorageConfigs.gcsAccessToken,
      gcsTokenExpiresAt: byosStorageConfigs.gcsTokenExpiresAt,
    })
    .from(byosStorageConfigs)
    .where(
      and(
        eq(byosStorageConfigs.userId, user.id),
        eq(byosStorageConfigs.provider, "gcs")
      )
    )
    .limit(1);

  if (!record || !record.gcsAccessToken) {
    return { connected: false };
  }

  return {
    connected: true,
    mode: record.gcsConnectionMode,
  };
});
