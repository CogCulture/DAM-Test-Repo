/**
 * GET /api/storage/gcs/projects
 * Option C: Lists all GCP projects the authenticated user has access to.
 * Requires the user to have connected via Google OAuth with the cloud-platform scope.
 */
import { getGcsOAuthToken } from "~~/server/utils/byosStorage";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const token = await getGcsOAuthToken(user.id);

  try {
    const response = await $fetch<{ projects: { projectId: string; name: string; lifecycleState: string }[] }>(
      "https://cloudresourcemanager.googleapis.com/v1/projects",
      {
        headers: { Authorization: `Bearer ${token}` },
        query: { filter: "lifecycleState:ACTIVE" },
      }
    );

    return (response.projects || [])
      .filter((p) => p.lifecycleState === "ACTIVE")
      .map((p) => ({ projectId: p.projectId, name: p.name }));
  } catch (err: any) {
    console.error("GCS projects list failed:", err?.data || err);
    throw createError({
      status: 502,
      message: "Failed to list GCP projects. Make sure you granted Cloud Platform access during sign-in.",
    });
  }
});
