import { requireFilePermission } from "~~/server/utils/permission";
import { getGDriveAccessToken, listGDriveFolder, getGDriveConnection } from "~~/server/utils/gdrive";
import { getFiles, getGDriveRules, getOrgDepartments } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { users } from "~~/server/database/schema";
import { eq, and } from "drizzle-orm";
import { getFileType } from "~~/shared/utils/helper";
import { mergeGDriveListing } from "~~/shared/utils/gdrive-listing";
import { processFileDuplicates } from "~~/shared/utils/file-collision";

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canView");
  const { id } = getRouterParams(event);
  const orgId = (user as any).organizationId;
  const db = useDrizzle();
  const localFilesPromise = getFiles(event, user.id);

  // Find the admin of this organization to get their Google Drive connection credentials
  let adminUserId = user.id;
  if (user.role !== "admin" && orgId) {
    const [orgAdmin] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
    if (orgAdmin) {
      adminUserId = orgAdmin.id;
    }
  }

  const connection = await getGDriveConnection(adminUserId);
  if (!connection || connection.status !== "approved") {
    throw createError({ status: 403, message: "Google Drive folder hosting is not approved." });
  }

  const token = await getGDriveAccessToken(adminUserId);
  const targetId = id === "root" ? connection.folderId : id;

  // Guard: reject invalid/empty folder IDs before hitting the GDrive API
  if (!targetId || targetId === "." || targetId === ".." || targetId.startsWith(".")) {
    throw createError({ status: 400, message: `Invalid GDrive folder ID: "${targetId}". Please check your GDrive connection settings.` });
  }

  let rawFiles: Awaited<ReturnType<typeof listGDriveFolder>> = [];
  let driveWarning: string | null = null;
  try {
    rawFiles = await listGDriveFolder(token, targetId);
  } catch (error: any) {
    driveWarning = error?.message || "Google Drive is temporarily unavailable.";
    console.warn(`Google Drive listing failed for ${targetId}; showing local DAM files instead.`, driveWarning);
  }


  // Department-first visibility: a user sees their home department plus grants.
  if (orgId && orgId !== "org_default" && user.role !== "admin") {
    const departments = await getOrgDepartments(orgId);
    const accessibleIds = new Set((user as any).accessibleDepartmentIds || []);
    const requestedDepartment = departments.find((department) => department.gdriveFolderId === targetId);
    if (requestedDepartment && !accessibleIds.has(requestedDepartment.id)) {
      throw createError({ status: 403, message: "You do not have access to this department." });
    }

    if (id === "root") {
      const accessibleDepartments = departments.filter((department) => accessibleIds.has(department.id));
      const accessibleFolderIds = new Set(accessibleDepartments.map((department) => department.gdriveFolderId).filter(Boolean));
      const accessibleNames = new Set(accessibleDepartments.map((department) => department.name.toLowerCase()));
      rawFiles = rawFiles.filter((file) =>
        file.mimeType === "application/vnd.google-apps.folder" &&
        (accessibleFolderIds.has(file.id) || accessibleNames.has(file.name.toLowerCase()))
      );
    }
  }
  const query = getQuery(event);
  const data = rawFiles.map((file) => {
    const effectiveMimeType = file.shortcutDetails?.targetMimeType || file.mimeType;
    const isFolder = effectiveMimeType === "application/vnd.google-apps.folder";
    return {
      id: file.id,
      name: file.name,
      type: isFolder ? "folder" : getFileType(effectiveMimeType),
      contentType: effectiveMimeType,
      duplicateOfId: file.shortcutDetails?.targetId,
      bucketName: "gdrive",
      storageProvider: "gdrive" as const,
      size: file.size ? parseInt(file.size, 10) : 0,
      path: file.id,
      visibility: "private",
      sharedCount: 0,
      count: 0,
      dimensions: null,
      preview: null,
      createdAt: file.createdTime ? new Date(file.createdTime) : new Date(),
      updatedAt: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
    };
  });

  const localFiles = await localFilesPromise;
  const localData = (localFiles?.data || []).map((file) => ({
    ...file,
    storageProvider: "local" as const,
  }));
  let combinedData: any[] = mergeGDriveListing({
    driveFiles: data,
    localFiles: localData,
    driveAvailable: !driveWarning,
  });
  const typeFilter = String(query["filters[contentType]"] || "");
  const visibilityFilter = String(query["filters[visibility]"] || "");
  const sharedFilter = String(query["filters[shared]"] || "");

  if (typeFilter) combinedData = combinedData.filter((file) => file.type === typeFilter);
  if (visibilityFilter) combinedData = combinedData.filter((file) => file.visibility === visibilityFilter);
  if (sharedFilter === "yes") combinedData = combinedData.filter((file) => Number(file.sharedCount) > 0);
  if (sharedFilter === "no") combinedData = combinedData.filter((file) => Number(file.sharedCount) === 0);
  const hasTagFilter = typeof query["filters[tags]"] === "string" && String(query["filters[tags]"]).trim().length > 0;
  const hasMetadataFilter = Object.keys(query).some((key) => key.startsWith("filters[meta]["));
  if (hasTagFilter || hasMetadataFilter) {
    combinedData = combinedData.filter((file) => file.storageProvider !== "gdrive");
  }

  const sortBy = ["name", "createdAt", "updatedAt", "size"].includes(String(query.sortBy))
    ? String(query.sortBy)
    : "createdAt";
  const direction = query.order === "desc" ? -1 : 1;
  combinedData.sort((left, right) => {
    if (sortBy === "name") {
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) * direction;
    }
    if (sortBy === "size") {
      return (Number(left.size || 0) - Number(right.size || 0)) * direction;
    }
    return (new Date(left[sortBy]).getTime() - new Date(right[sortBy]).getTime()) * direction;
  });

  const processedData = processFileDuplicates(combinedData);
  return {
    data: processedData,
    nextPage: localFiles?.nextPage ?? null,
    warning: driveWarning,
  };
});
