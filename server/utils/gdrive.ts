import { eq, and } from "drizzle-orm";
import { gdriveFolders } from "../database/schema";
import { useDrizzle } from "./drizzle";
import {
  GoogleOAuthRefreshError,
  refreshGoogleOAuthAccessToken,
} from "./googleOAuthRefresh";

export interface GDriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  parents?: string[];
  trashed?: boolean;
  shortcutDetails?: { targetId: string; targetMimeType?: string };
}

export async function getGDriveItem(
  accessToken: string,
  itemId: string,
): Promise<GDriveItem> {
  try {
    return await $fetch<GDriveItem>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        query: {
          fields: "id,name,mimeType,parents,trashed",
        },
        timeout: 15000,
      },
    );
  } catch (err: any) {
    console.error("Google Drive API item lookup failed:", err?.data || err);
    throw createError({ status: 404, message: "Google Drive folder was not found." });
  }
}

export async function getAuthorizedGDriveFolder(
  accessToken: string,
  folderId: string,
  allowedRootIds: Set<string>,
): Promise<GDriveItem & { path: string; authorizedRootId: string }> {
  if (!folderId || allowedRootIds.size === 0) {
    throw createError({ status: 403, message: "Upload folder is not authorized." });
  }

  const queue: Array<{ id: string; trail: GDriveItem[] }> = [{ id: folderId, trail: [] }];
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < 200) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const item = await getGDriveItem(accessToken, current.id);
    if (item.trashed || (current.id === folderId && item.mimeType !== "application/vnd.google-apps.folder")) {
      throw createError({ status: 409, message: "The selected upload destination is not an active folder." });
    }

    const trail = [...current.trail, item];
    if (allowedRootIds.has(item.id)) {
      return {
        ...trail[0]!,
        path: [...trail].reverse().map(part => part.name).join(" / "),
        authorizedRootId: item.id,
      };
    }

    for (const parentId of item.parents || []) {
      if (!visited.has(parentId)) queue.push({ id: parentId, trail });
    }
  }

  throw createError({ status: 403, message: "Upload folder is not authorized." });
}

/**
 * Gets a valid Google Drive access token for the given user.
 * If expired, refreshes it using the stored refresh token.
 */
export async function getGDriveAccessToken(userId: string): Promise<string> {
  const db = useDrizzle();
  const connections = await db
    .select()
    .from(gdriveFolders)
    .where(eq(gdriveFolders.userId, userId));

  if (!connections || connections.length === 0) {
    throw createError({ status: 401, message: "Google Drive is not connected." });
  }

  const conn = connections[0];
  const now = Date.now();
  
  // Refresh if token is expired or expires in less than 5 minutes
  if (conn.expiresAt - now < 5 * 60 * 1000) {
    if (!conn.refreshToken) {
      throw createError({ status: 401, message: "Google Drive refresh token is missing. Please reconnect." });
    }

    const config = useRuntimeConfig();
    const clientId = config.public.oauth?.google?.clientId || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;
    const clientSecret = config.oauth?.google?.clientSecret || process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET;

    try {
      const response = await refreshGoogleOAuthAccessToken({
        clientId: clientId || "",
        clientSecret: clientSecret || "",
        refreshToken: conn.refreshToken,
        fetchToken: (url, options) => $fetch(url, options),
      });

      const newAccessToken = response.access_token;
      const newExpiresAt = Date.now() + response.expires_in * 1000;

      await db
        .update(gdriveFolders)
        .set({
          accessToken: newAccessToken,
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(gdriveFolders.id, conn.id));

      return newAccessToken;
    } catch (err: any) {
      console.error("Failed to refresh Google Drive token:", err);
      const reconnectRequired = err instanceof GoogleOAuthRefreshError && err.reconnectRequired;
      throw createError({
        status: reconnectRequired ? 401 : 503,
        message: reconnectRequired
          ? "Google Drive session expired. Please reconnect."
          : "Google Drive is temporarily unavailable. Please try again.",
      });
    }
  }

  return conn.accessToken;
}

/**
 * Lists the contents of a specific folder in Google Drive.
 */
export async function listGDriveFolder(
  accessToken: string,
  folderId: string
): Promise<GDriveItem[]> {
  try {
    const q = `'${folderId}' in parents and trashed = false`;
    const response = await $fetch<{ files: GDriveItem[] }>(
      "https://www.googleapis.com/drive/v3/files",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        query: {
          q,
          fields: "files(id, name, mimeType, size, createdTime, modifiedTime, md5Checksum, shortcutDetails(targetId,targetMimeType))",
          orderBy: "folder,name",
          pageSize: 100,
        },
        timeout: 15000,
      }
    );
    return response.files || [];
  } catch (err: any) {
    console.error("Google Drive API list folder failed:", err?.data || err);
    throw createError({ status: 502, message: "Failed to list Google Drive folder contents." });
  }
}

/**
 * Creates a subfolder in Google Drive.
 */
export async function createGDriveFolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string
): Promise<GDriveItem> {
  try {
    const response = await $fetch<GDriveItem>(
      "https://www.googleapis.com/drive/v3/files",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: {
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId],
        },
      }
    );
    return response;
  } catch (err: any) {
    console.error("Google Drive API create folder failed:", err?.data || err);
    throw createError({ status: 502, message: "Failed to create folder in Google Drive." });
  }
}

/**
 * Renames a Google Drive file or folder.
 */
export async function renameGDriveItem(
  accessToken: string,
  fileId: string,
  newName: string
): Promise<GDriveItem> {
  try {
    const response = await $fetch<GDriveItem>(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: {
          name: newName,
        },
      }
    );
    return response;
  } catch (err: any) {
    console.error("Google Drive API rename failed:", err?.data || err);
    throw createError({ status: 502, message: "Failed to rename item in Google Drive." });
  }
}

/**
 * Deletes/Trashes a Google Drive file or folder.
 */
export async function deleteGDriveItem(
  accessToken: string,
  fileId: string
): Promise<void> {
  try {
    await $fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: {
        trashed: true,
      },
    });
  } catch (err: any) {
    console.error("Google Drive API trash failed:", err?.data || err);
    throw createError({ status: 502, message: "Failed to delete item in Google Drive." });
  }
}

/**
 * Resolves the Google Drive connection status for a user.
 */
export async function getGDriveConnection(userId: string) {
  const db = useDrizzle();
  const results = await db
    .select()
    .from(gdriveFolders)
    .where(eq(gdriveFolders.userId, userId));
  return results && results.length > 0 ? results[0] : null;
}

/**
 * Ensures a specific path of folders exists in Google Drive, creating them if necessary.
 * Returns the folder ID of the final folder in the path.
 */
export async function ensureGDrivePath(
  accessToken: string,
  rootFolderId: string,
  path: string
): Promise<string> {
  const segments = path.split("/").filter(Boolean);
  let currentParentId = rootFolderId;

  for (const segment of segments) {
    const items = await listGDriveFolder(accessToken, currentParentId);
    const existing = items.find(
      (item) =>
        item.name.toLowerCase() === segment.toLowerCase() &&
        item.mimeType === "application/vnd.google-apps.folder"
    );

    if (existing) {
      currentParentId = existing.id;
    } else {
      const created = await createGDriveFolder(accessToken, currentParentId, segment);
      currentParentId = created.id;
    }
  }

  return currentParentId;
}
