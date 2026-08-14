/**
 * GET /api/storage/gcs/buckets?projectId=xxx
 * Options A & C: Lists all GCS buckets in the given GCP project.
 * Requires the user to have connected via Google OAuth with devstorage or cloud-platform scope.
 */
import { getGcsOAuthToken } from "~~/server/utils/byosStorage";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const query = getQuery(event);
  const projectId = query.projectId as string;

  if (!projectId?.trim()) {
    throw createError({ status: 400, message: "projectId query param is required." });
  }

  const token = await getGcsOAuthToken(user.id);

  try {
    const response = await $fetch<{ items?: { id: string; name: string; location: string; storageClass: string }[] }>(
      "https://storage.googleapis.com/storage/v1/b",
      {
        headers: { Authorization: `Bearer ${token}` },
        query: { project: projectId, fields: "items(id,name,location,storageClass)" },
      }
    );

    return (response.items || []).map((b) => ({
      id: b.id,
      name: b.name,
      location: b.location,
      storageClass: b.storageClass,
    }));
  } catch (err: any) {
    console.error("GCS buckets list failed:", err?.data || err);
    throw createError({
      status: 502,
      message: "Failed to list GCS buckets. Check that your account has Storage permissions on this project.",
    });
  }
});
