import {
  asc,
  eq,
  ne,
  sql,
  and,
  or,
  desc,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  like,
} from "drizzle-orm";
import { ulid } from "ulidx";
import { users, files, buckets, favorites, shared, nomenclatures, folderRequests, organizations, orgDepartments, orgPermissions, gdriveFolders, orgGDriveRules, userPermissionOverrides, userDepartmentAccess, deptInvites, userOrganizations } from "../database/schema";
import { useDrizzle } from "./drizzle";
import { copyBlob, moveBlob } from "./blob";
import { enqueueIngestionJob } from "./ingestionQueue";
import { deletePineconeFileVectors } from "./pinecone";
import { logPipelineEvent } from "./auditLogger";
import { cleanPath, getFileType, formatTrashTimestamp, getVisibility } from "../../shared/utils/helper";
import { FILE_PERMISSION_KEYS, getAccessibleDepartmentIds, resolvePermission } from "../../shared/utils/access-control";

const perPage = 100;

const getStoragePath = (item: { path: string; storagePath?: string | null }) => item.storagePath || item.path;

const hasOtherStorageReference = async (storagePath: string, excludedId: string) => {
  const [reference] = await useDrizzle()
    .select({ id: files.id })
    .from(files)
    .where(and(
      ne(files.id, excludedId),
      or(
        eq(files.storagePath, storagePath),
        and(isNull(files.storagePath), eq(files.path, storagePath)),
      ),
    ))
    .limit(1);
  return Boolean(reference);
};

const fileColumns = {
  id: files.id,
  name: files.name,
  path: files.path,
  storagePath: files.storagePath,
  duplicateOfId: files.duplicateOfId,
  parentId: files.parentId,
  bucketName: files.bucketName,
  type: files.type,
  contentType: files.contentType,
  size: files.size,
  preview: files.preview,
  visibility: files.visibility,
  sharedCount: files.sharedCount,
  count: files.count,
  dimensions: files.dimensions,
  md5: files.md5,
  assetMetadata: files.assetMetadata,
  tags: files.tags,
  customMetadata: files.customMetadata,
  createdAt: files.createdAt,
  updatedAt: files.updatedAt,
  deletedAt: files.deletedAt,
};

export async function createUser(data: CreateUserType) {
  return await useDrizzle().insert(users).values(data);
}

export async function isOrganizationSuspended(orgId: string): Promise<boolean> {
  if (!orgId || orgId === "org_default") return false;
  const [org] = await useDrizzle()
    .select({ status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return org?.status === "suspended";
}

export async function getUserByEmail(email: string) {
  if (!email || typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  const result = await useDrizzle()
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${normalized}`);
  if (result && result.length > 0) {
    const userRow: any = result[0];
    if (userRow.organizationId && userRow.organizationId !== "org_default") {
      const [org] = await useDrizzle()
        .select({ status: organizations.status, orgType: organizations.orgType, setupComplete: organizations.setupComplete })
        .from(organizations)
        .where(eq(organizations.id, userRow.organizationId));
      userRow.organizationStatus = org?.status || "active";
      userRow.orgType = org?.orgType || "s3";
      userRow.setupComplete = org ? org.setupComplete : true;
    } else {
      userRow.organizationStatus = "active";
      userRow.orgType = "s3";
      userRow.setupComplete = true;
    }
    return userRow;
  }
  return null;
}

export async function getUser(id: string) {
  const result = await useDrizzle()
    .select()
    .from(users)
    .where(eq(users.id, id));
  if (result && result.length > 0) {
    const userRow: any = result[0];
    if (userRow.organizationId && userRow.organizationId !== "org_default") {
      const [org] = await useDrizzle()
        .select({
          status: organizations.status,
          orgType: organizations.orgType,
          setupComplete: organizations.setupComplete,
          name: organizations.name,
        })
        .from(organizations)
        .where(eq(organizations.id, userRow.organizationId));
      userRow.organizationStatus = org?.status || "active";
      userRow.orgType = org?.orgType || "s3";
      userRow.setupComplete = org ? org.setupComplete : true;
      userRow.organizationName = org?.name || "Organization";
    } else if (userRow.organizationId === "org_default") {
      userRow.organizationStatus = "active";
      userRow.orgType = "s3";
      userRow.setupComplete = true;
      userRow.organizationName = "Default Organization";
    } else {
      userRow.organizationStatus = "active";
      userRow.orgType = "s3";
      userRow.setupComplete = false;
      userRow.organizationName = "";
    }
    const db = useDrizzle();
    const allDepartments = userRow.organizationId ? await db
      .select({ id: orgDepartments.id })
      .from(orgDepartments)
      .where(eq(orgDepartments.organizationId, userRow.organizationId)) : [];
    const grants = userRow.organizationId ? await db
      .select({ departmentId: userDepartmentAccess.departmentId })
      .from(userDepartmentAccess)
      .where(and(
        eq(userDepartmentAccess.userId, userRow.id),
        eq(userDepartmentAccess.organizationId, userRow.organizationId),
      )) : [];

    if (userRow.role !== "admin" && userRow.organizationId) {
      const perms = await getOrgPermissions(userRow.organizationId);
      const roleMatches = (permRole: string, userRole: string) =>
        permRole === userRole ||
        (userRole === "intern" && permRole === "guest") ||
        (userRole === "guest" && permRole === "intern");

      const departmentRole = perms.find((p) =>
        roleMatches(p.role, userRole.role) && p.departmentId === userRow.departmentId
      );
      const globalRole = perms.find((p) =>
        roleMatches(p.role, userRow.role) && p.departmentId === "global"
      );
      const [override] = await db
        .select()
        .from(userPermissionOverrides)
        .where(eq(userPermissionOverrides.userId, userRow.id));

      const resolved: Record<string, boolean | number | null | undefined> = {
        canApproveUsers: departmentRole?.canApproveUsers ?? globalRole?.canApproveUsers ?? false,
        canEditNomenclature: departmentRole?.canEditNomenclature ?? globalRole?.canEditNomenclature ?? false,
      };
      for (const key of FILE_PERMISSION_KEYS) {
        resolved[key] = resolvePermission({
          isAdmin: false,
          individual: override?.[key],
          departmentRole: departmentRole?.[key],
          globalRole: globalRole?.[key],
        });
      }
      userRow.permissions = resolved;
      userRow.allDepartmentAccess = override?.allDepartmentAccess ?? false;
    } else {
      userRow.permissions = Object.fromEntries([
        ...FILE_PERMISSION_KEYS.map((key) => [key, true]),
        ["canApproveUsers", true],
        ["canEditNomenclature", true],
      ]);
      userRow.allDepartmentAccess = userRow.role === "admin";
    }

    userRow.accessibleDepartmentIds = getAccessibleDepartmentIds({
      isAdmin: userRow.role === "admin",
      ownDepartmentId: userRow.departmentId,
      grantedDepartmentIds: grants.map((grant) => grant.departmentId),
      allDepartmentIds: allDepartments.map((department) => department.id),
      allDepartments: !!userRow.allDepartmentAccess,
    });
    return userRow;
  }
  return null;
}

export const makeSorting = (dbQuery: any, model: any, queryString: any) => {
  const { sortBy = "name", order = "asc" } = queryString;

  const folderPriority = sql`CASE WHEN ${model.type} = 'folder' THEN 0 ELSE 1 END ASC`;

  if (sortBy === "name" || !sortBy) {
    const nameOrder = order === "desc"
      ? sql`LOWER(${model.name}) DESC`
      : sql`LOWER(${model.name}) ASC`;
    return dbQuery.orderBy(folderPriority, nameOrder);
  }

  const sortColumn = model[sortBy] || model.createdAt;
  if (sortColumn) {
    return dbQuery.orderBy(
      folderPriority,
      order === "asc" ? asc(sortColumn) : desc(sortColumn)
    );
  }
  return dbQuery;
};

export const makePaginate = (dbQuery: any, queryString: any) => {
  const { page = 1 } = queryString;

  if (Number(page) <= 0) {
    throw createError({
      status: 404,
      message: "Invalid Request",
    });
  }

  const offset = (Number(page) - 1) * Number(perPage);
  return dbQuery.limit(Number(perPage)).offset(offset);
};

export const getBucket = async (name: string) => {
  const result = await useDrizzle()
    .select()
    .from(buckets)
    .where(eq(buckets.name, name));
  if (result && result.length > 0) {
    return result[0];
  }
  return null;
};
export const getBucketSize = async (bucketName: string) => {
  const result = await useDrizzle()
    .select({
      size: sql`SUM(${files.size})`,
    })
    .from(files)
    .where(and(eq(files.bucketName, bucketName), ne(files.type, "folder")));
  if (result && result.length > 0) {
    return result[0].size || 0;
  }
  return 0;
};
export const getUserBucket = async (userId: string) => {
  try {
    const result = await useDrizzle()
      .select()
      .from(buckets)
      .where(eq(buckets.userId, userId));
    if (result && result.length > 0) {
      const size = await getBucketSize(result[0].name);

      return {
        ...result[0],
        size,
      };
    }
    return null;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const createBucket = async (name: string, userId: string) => {
  const hasBucket = await getBucket(name);
  if (hasBucket) {
    throw createError({
      status: 400,
      message: "Bucket already exists",
    });
  }
  const response = await useDrizzle()
    .insert(buckets)
    .values({
      id: ulid() as string,
      name,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  if (response && response.length > 0) {
    return response[0];
  }
};

// Removed makeVirtualFolder// @ts-ignore
export const getFiles = async (event, userId) => {
  const queryString = getQuery(event);
  const params = getRouterParams(event);

  const filters = [];

  const currentUser = await getUser(userId);
  const orgId = currentUser?.organizationId || "org_default";
  const role = currentUser?.role;
  const userDept = currentUser?.departmentId;

  // Add organization scoping filter to all database queries
  filters.push(eq(files.organizationId, orgId));

  // All users belonging to the organization can see and contribute to all organization folders and files
  // Filters are scoped to eq(files.organizationId, orgId) above.

  // Resolve folder ID for parent scoping
  let parentId = params.id || "root";
  if (Array.isArray(parentId)) {
    parentId = parentId.filter(Boolean).pop() || "root";
  }
  if (parentId !== "root") {
    const resolvedFolder = await getFolder(parentId, orgId);
    if (resolvedFolder) {
      parentId = resolvedFolder.id;
    }
  }

  // Fallback / standard physical folder / private bucket logic
  let dataQuery = useDrizzle()
    .select({
      ...fileColumns,
      isFavorite: favorites.createdAt,
    })
    .from(files)
    .leftJoin(
      favorites,
      and(eq(files.id, favorites.fileId), eq(favorites.userId, userId))
    )
    .$dynamic();

  filters.push(isNull(files.deletedAt));
  filters.push(sql`(json_extract(${files.assetMetadata}, '$.source') IS NULL OR json_extract(${files.assetMetadata}, '$.source') != 'rag')`);
  filters.push(sql`${files.name} NOT LIKE '%_parsed.md'`);
  const includeEntireDrive = queryString["filters[drive]"] === "true";
  if (!includeEntireDrive) {
    if (parentId === "root") {
      filters.push(or(eq(files.parentId, "root"), isNull(files.parentId)));
    } else {
      filters.push(eq(files.parentId, parentId));
    }
  }

  if (queryString["filters[contentType]"]) {
    filters.push(eq(files.type, queryString["filters[contentType]"] as string));
  }
  if (queryString["filters[shared]"]) {
    if (queryString["filters[shared]"] === "no")
      filters.push(eq(files.sharedCount, 0));
    if (queryString["filters[shared]"] === "yes")
      filters.push(ne(files.sharedCount, 0));
  }
  if (
    queryString["filters[visibility]"] &&
    ["public", "private"].includes(queryString["filters[visibility]"] as string)
  ) {
    filters.push(
      eq(files.visibility, queryString["filters[visibility]"] as string)
    );
  }

  const tagFilter = queryString["filters[tags]"];
  if (typeof tagFilter === "string" && tagFilter.trim()) {
    for (const tag of tagFilter.split(",").map((value) => value.trim()).filter(Boolean)) {
      filters.push(sql`EXISTS (
        SELECT 1 FROM json_each(${files.tags})
        WHERE json_each.value = ${tag}
      )`);
    }
  }

  for (const [key, rawValue] of Object.entries(queryString)) {
    const match = key.match(/^filters\[meta\]\[(.+)\]$/);
    if (!match || typeof rawValue !== "string" || !rawValue.trim()) continue;
    const jsonPath = `$.${match[1]}`;
    const values = rawValue.split(",").map((value) => value.trim()).filter(Boolean);
    const metadataConditions = values.map(
      (value) => sql`json_extract(${files.customMetadata}, ${jsonPath}) = ${value}`
    );
    if (metadataConditions.length > 0) {
      filters.push(or(...metadataConditions));
    }
  }

  dataQuery = dataQuery.where(and(...filters));

  // 🔸 Sorting
  dataQuery = makeSorting(dataQuery, files, queryString);

  // 🔸 Pagination
  dataQuery = makePaginate(dataQuery, queryString);

  const data = await dataQuery;

  const nextPage =
    data.length === perPage ? Number(queryString.page) + 1 : null;
  return {
    data,
    nextPage,
  };
};

export const getFile = async (
  bucketName: string,
  path: string,
  deletedAt?: Date,
  orgId?: string
) => {
  const clean = cleanPath(path);
  const filters: any[] = [
    or(eq(files.path, clean), eq(files.path, path)),
  ];
  if (deletedAt) {
    filters.push(eq(files.deletedAt, deletedAt));
  } else {
    filters.push(isNull(files.deletedAt));
  }
  if (orgId) {
    filters.push(eq(files.organizationId, orgId));
  }
  const result = await useDrizzle()
    .select()
    .from(files)
    .where(and(...filters));
  if (result && result.length > 0) {
    return result[0];
  }
  return null;
};

export const getFolder = async (id: any, orgId?: string) => {
  if (!id || id === "root") return null;
  let rawId = id;
  if (Array.isArray(id)) {
    rawId = id.filter(Boolean).pop();
  }
  if (!rawId || rawId === "root") return null;

  const db = useDrizzle();
  const clean = typeof rawId === "string" ? cleanPath(rawId) : String(rawId);

  // 1. Precise lookup by unique folder ID first
  const byIdConditions: any[] = [
    eq(files.id, rawId),
    eq(files.type, "folder"),
    isNull(files.deletedAt),
  ];
  if (orgId) byIdConditions.push(eq(files.organizationId, orgId));
  const byId = await db.select().from(files).where(and(...byIdConditions)).limit(1);
  if (byId.length > 0) {
    return byId[0];
  }

  // 2. Lookup by exact unique folder path
  const byPathConditions: any[] = [
    eq(files.type, "folder"),
    isNull(files.deletedAt),
    or(
      eq(files.path, clean),
      eq(files.path, rawId),
      eq(files.path, `org/${clean}`),
      eq(files.path, `org/${rawId}`)
    ),
  ];
  if (orgId) byPathConditions.push(eq(files.organizationId, orgId));
  const byPath = await db.select().from(files).where(and(...byPathConditions)).limit(1);
  if (byPath.length > 0) {
    return byPath[0];
  }

  return null;
};

export const ensurePath = async (
  bucketName: string,
  fullPath: string,
  userId: string,
  isFile?: boolean,
  isFreshEmptyFolder?: boolean
) => {
  // replace leading, trailing and duplicate slashes
  fullPath = cleanPath(fullPath);
  // Check and create parent folders if they don't exist
  const pathSegments = fullPath.split("/");
  // Remove the file name (last segment)
  if (isFile) pathSegments.pop();
  let current = { id: "root", path: "" };

  const userObj = await getUser(userId);
  const organizationId = userObj?.organizationId || "org_default";

  // If there are path segments (not a root-level file)
  if (pathSegments.length > 1) {
    // Set the current path to the bucket
    current.path = pathSegments[0];
    // Iterate through each folder level
    for (let i = 1; i < pathSegments.length; i++) {
      // Build the current path level
      current.path = current.path
        ? `${current.path}/${pathSegments[i]}`
        : pathSegments[i];

      // Check if this folder level exists
      const folderExists = await getFile(bucketName, current.path, undefined, organizationId);

      if (!folderExists) {
        // Check if this segment corresponds to an organization department
        const depts = await getOrgDepartments(organizationId);
        const segment = pathSegments[i];
        const dept = depts.find((d) => d.id === segment || `dept_${d.id}` === segment);
        if (dept && (current.path === `${bucketName}/${dept.id}` || current.path === `${bucketName}/dept_${dept.id}`)) {
          current.id = `dept_${dept.id}`;
          continue;
        }

        // Create the missing folder
        const folderId = ulid() as string;
        const folderData = {
          id: folderId,
          name: pathSegments[i],
          path: current.path,
          type: "folder",
          contentType: "folder",
          size: 0,
          parentId: current.id,
          bucketName: bucketName,
          userId: userId,
          organizationId,
          departmentId: userObj?.departmentId || null,
          processingStatus: "processed",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        try {
          await useDrizzle().insert(files).values(folderData);
          current.id = folderId;
        } catch (e: any) {
          // If concurrent insert occurred and unique constraint failed, query the newly created folder
          const folderAlreadyExists = await getFile(bucketName, current.path, undefined, organizationId);
          if (folderAlreadyExists) {
            current.id = folderAlreadyExists.id;
            current.path = folderAlreadyExists.path;
          } else {
            throw e;
          }
        }
      } else {
        // If folder exists but isn't a folder type, throw error
        if (folderExists.type !== "folder") {
          throw createError({
            status: 400,
            message: `Path conflict: '${current.path}' exists but is not a folder`,
          });
        }

        // CRITICAL BUG FIX: If user is importing a brand new empty folder, NEVER merge it into a pre-existing folder that already has files!
        const isLeafFolder = i === pathSegments.length - 1;
        if (isLeafFolder && isFreshEmptyFolder) {
          const childFiles = await useDrizzle()
            .select({ count: sql`COUNT(*)` })
            .from(files)
            .where(and(
              eq(files.parentId, folderExists.id),
              eq(files.organizationId, organizationId),
              isNull(files.deletedAt)
            ));
          const hasExistingContent = Number(childFiles[0]?.count || 0) > 0;

          if (hasExistingContent) {
            // Pre-existing folder has files! Generate a unique numbered folder name for the new empty folder
            let copyNum = 1;
            let uniqueName = `${pathSegments[i]} (${copyNum})`;
            const parentPrefix = current.path.substring(0, current.path.lastIndexOf("/"));
            let uniquePath = parentPrefix ? `${parentPrefix}/${uniqueName}` : uniqueName;

            while (await getFile(bucketName, uniquePath, undefined, organizationId)) {
              copyNum++;
              uniqueName = `${pathSegments[i]} (${copyNum})`;
              uniquePath = parentPrefix ? `${parentPrefix}/${uniqueName}` : uniqueName;
            }

            const newFolderId = ulid() as string;
            const newFolderData = {
              id: newFolderId,
              name: uniqueName,
              path: uniquePath,
              type: "folder",
              contentType: "folder",
              size: 0,
              parentId: current.id,
              bucketName: bucketName,
              userId: userId,
              organizationId,
              departmentId: userObj?.departmentId || null,
              processingStatus: "processed",
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await useDrizzle().insert(files).values(newFolderData);
            current.id = newFolderId;
            current.path = uniquePath;
            continue;
          }
        }

        current.id = folderExists.id;
        current.path = folderExists.path;
      }
    }
  }
  return current;
};

export const insertUpdateFile = async (
  bucketName: string,
  parentId: string,
  data: any
) => {
  const { userId, blobPath, md5, assetMetadata } = data;
  const userObj = await getUser(userId);
  const organizationId = userObj?.organizationId || "org_default";

  // let parent = await getParent(bucketName, parentId, organizationId);
  const logicalPath = cleanPath(data.fullPath);
  const physicalPath = blobPath || logicalPath;

  let targetParentId = parentId || "root";
  const fileType = getFileType(data.contentType);
  const preview = fileType === "image" ? physicalPath : null;

  if (targetParentId !== "root") {
    const parentFolder = await getFolder(targetParentId, organizationId);
    if (parentFolder) {
      targetParentId = parentFolder.id;
    }
  } else {
    const pathParts = logicalPath.split("/").filter(Boolean);
    const hasSubfolders = (pathParts[0] === bucketName && pathParts.length > 2) || (pathParts[0] !== bucketName && pathParts.length > 1);
    if (hasSubfolders) {
      let parent = await ensurePath(bucketName, logicalPath, userId, true);
      targetParentId = parent.id;
      if (preview) {
        await setFolderThumbnail(parent.id, preview);
      }
    }
  }

  let resolvedDepartmentId = data.departmentId || null;
  if (!resolvedDepartmentId && targetParentId && targetParentId !== "root") {
    resolvedDepartmentId = await getFileDepartmentId(targetParentId, organizationId);
  }
  if (!resolvedDepartmentId) {
    resolvedDepartmentId = userObj?.departmentId || null;
  }

  const processingStatus = data.processingStatus || "pending_processing";

  const file = await getFile(bucketName, logicalPath, undefined, organizationId);
  if (file) {
    return await useDrizzle()
      .update(files)
      .set({
        size: data.size,
        updatedAt: new Date(),
        md5: md5 || file.md5,
        assetMetadata: assetMetadata || file.assetMetadata,
        path: logicalPath,
        storagePath: physicalPath,
        duplicateOfId: data.duplicateOfId || null,
        name: logicalPath.split("/").pop() || file.name,
        departmentId: resolvedDepartmentId || file.departmentId,
        processingStatus: processingStatus || file.processingStatus,
      })
      .where(eq(files.id, file.id));
  }

  const insertFile = {
    id: ulid() as string,
    name: logicalPath.split("/").pop() || "",
    path: logicalPath,
    storagePath: physicalPath,
    duplicateOfId: data.duplicateOfId || null,
    type: fileType,
    size: data.size,
    contentType: data.contentType,
    dimensions: data.dimensions,
    userId: data.userId,
    organizationId,
    departmentId: resolvedDepartmentId,
    processingStatus,
    bucketName: bucketName,
    parentId: targetParentId,
    createdAt: new Date(),
    updatedAt: new Date(),
    preview,
    md5,
    assetMetadata,
  };
  const response = await useDrizzle()
    .insert(files)
    .values(insertFile)
    .returning();
  if (response && response.length > 0) {
    if (targetParentId !== "root") {
      await updateCount(targetParentId);
    }
    const createdRecord = response[0];
    if (createdRecord.type !== "folder") {
      enqueueIngestionJob({
        fileId: createdRecord.id,
        organizationId: createdRecord.organizationId,
        departmentId: createdRecord.departmentId,
        blobPath: createdRecord.storagePath || createdRecord.path,
        contentType: createdRecord.contentType,
      }).catch((err) => {
        console.error("[insertUpdateFile] Failed to enqueue ingestion job:", err);
      });
    }
    return createdRecord;
  }
};

export const getParent = async (bucketName: string, id: string, orgId?: string) => {
  let parent = {
    path: bucketName,
    id: "root",
  };
  if (id && id !== "root") {
    if (orgId) {
      const depts = await getOrgDepartments(orgId);
      const rawDeptId = id.startsWith("dept_") ? id.substring(5) : id;
      const dept = depts.find(
        (d) => d.id === rawDeptId || d.id === id || d.gdriveFolderId === id
      );
      if (dept) {
        return {
          path: `${bucketName}/${dept.id}`,
          id: id.startsWith("dept_") ? id : `dept_${dept.id}`,
        };
      }
    }
    const folder = await getFolder(id, orgId);
    if (
      folder &&
      folder.type === "folder" &&
      (!folder.bucketName || folder.bucketName === bucketName || bucketName === "org")
    ) {
      parent = {
        path: folder.path,
        id: folder.id,
      };
    } else {
      throw createError({
        status: 404,
        message: "Folder not found",
      });
    }
  }
  return parent;
};

export const isParentPublic = async (
  bucketName: string,
  path: string
): Promise<boolean> => {
  const parentPath = path.split("/").slice(0, -1).join("/");
  if (parentPath) {
    const parent = await getFile(bucketName, parentPath);
    if (parent && parent.visibility === "public") {
      return true;
    }
    if (parent && parent.visibility === "inherit") {
      return await isParentPublic(bucketName, parentPath);
    }
  }
  return false;
};

export const searchFiles = async (
  bucketName: string,
  query: string | string[],
  orgId?: string,
  userId?: string,
  userRole?: string
) => {
  const filters: any[] = [];

  let dataQuery = useDrizzle()
    .select({
      id: files.id,
      name: files.name,
      path: files.path,
      storagePath: files.storagePath,
      duplicateOfId: files.duplicateOfId,
      parentId: files.parentId,
      bucketName: files.bucketName,
      type: files.type,
      contentType: files.contentType,
      preview: files.preview,
      deletedAt: files.deletedAt,
      size: files.size,
      createdAt: files.createdAt,
    })
    .from(files)
    .$dynamic();

  // 🔸 Filtering
  filters.push(isNull(files.deletedAt));
  filters.push(sql`(json_extract(${files.assetMetadata}, '$.source') IS NULL OR json_extract(${files.assetMetadata}, '$.source') != 'rag')`);
  filters.push(sql`${files.name} NOT LIKE '%_parsed.md'`);

  if (orgId && orgId !== "org" && orgId !== "org_default") {
    filters.push(
      or(
        eq(files.organizationId, orgId),
        eq(files.organizationId, "org_default"),
        isNull(files.organizationId),
        eq(files.bucketName, bucketName)
      )
    );
  }

  const rawTerms = Array.isArray(query) ? query : [query];
  const validTerms = Array.from(new Set(rawTerms.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean)));

  if (validTerms.length > 0) {
    const termConditions: any[] = [];
    for (const term of validTerms) {
      termConditions.push(like(sql`LOWER(${files.name})`, `%${term}%`));
    }
    filters.push(or(...termConditions));
  }

  dataQuery = dataQuery.where(and(...filters));

  const data = await dataQuery;
  return data;
};

export const setFavorite = async (userId: string, fileId: string) => {
  const favorite = await useDrizzle()
    .select()
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.fileId, fileId)));
  if (favorite && favorite.length > 0) {
    return await useDrizzle()
      .update(favorites)
      .set({
        createdAt: new Date(),
      })
      .where(and(eq(favorites.userId, userId), eq(favorites.fileId, fileId)));
  } else {
    return await useDrizzle().insert(favorites).values({
      userId,
      fileId,
      createdAt: new Date(),
    });
  }
};
export const unsetFavorite = async (userId: string, fileId: string) => {
  return await useDrizzle()
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.fileId, fileId)));
};
export const ensureFile = async (bucketName: string, id: string) => {
  let file = await getFolder(id);
  if (!file) {
    const [byPath] = await useDrizzle()
      .select()
      .from(files)
      .where(or(eq(files.id, id), eq(files.path, id), eq(files.storagePath, id)))
      .limit(1);
    file = byPath || null;
  }
  if (!file) {
    throw createError({
      status: 404,
      message: "File not found",
    });
  }
  return file;
};

export const getBreadcrumb = async (bucketName: string, path: string) => {
  // Skip if path is empty or just the bucket
  if (!path || path === bucketName) return [];

  // Generate all potential parent paths
  const pathSegments = path.split("/");
  const pathsToQuery = [];

  for (let i = 1; i <= pathSegments.length; i++) {
    const currentPath = pathSegments.slice(0, i).join("/");
    if (currentPath && currentPath !== bucketName) {
      pathsToQuery.push(currentPath);
    }
  }

  if (pathsToQuery.length === 0) return [];

  // Query all paths in a single database call
  const breadcrumbFiles = await useDrizzle()
    .select({
      id: files.id,
      name: files.name,
      path: files.path,
  storagePath: files.storagePath,
  duplicateOfId: files.duplicateOfId,
  parentId: files.parentId,
  bucketName: files.bucketName,
      visibility: files.visibility,
      size: files.size,
      count: files.count,
    })
    .from(files)
    .where(
      and(eq(files.bucketName, bucketName), inArray(files.path, pathsToQuery))
    )
    .orderBy(sql`LENGTH(${files.path})`);

  // Sort breadcrumbs in path order since SQL might return in a different order
  const breadcrumbMap = breadcrumbFiles.reduce(
    (acc: { [key: string]: any }, file) => {
      acc[file.path] = file;
      return acc;
    },
    {}
  );

  // Now create the ordered breadcrumbs array
  const orderedBreadcrumbs = [];
  for (const currentPath of pathsToQuery) {
    if (breadcrumbMap[currentPath]) {
      orderedBreadcrumbs.push({
        id: breadcrumbMap[currentPath].id,
        name: breadcrumbMap[currentPath].name,
        visibility: breadcrumbMap[currentPath].visibility,
      });
    } else {
      // Check if it's a virtual department path
      const parts = currentPath.split("/");
      if (parts.length >= 2 && parts[0] === "org") {
        const deptId = parts[parts.length - 1];
        
        // Query the database for the department details
        const deptResult = await useDrizzle()
          .select()
          .from(orgDepartments)
          .where(eq(orgDepartments.id, deptId));

        if (deptResult && deptResult.length > 0) {
          orderedBreadcrumbs.push({
            id: `dept_${deptResult[0].id}`,
            name: deptResult[0].name,
            visibility: "private",
          });
        } else {
          // Fallback to hardcoded list
          const baseDept = deptId.includes("_") ? deptId.substring(deptId.indexOf("_") + 1) : deptId;
          const dept = DEFAULT_DEPARTMENTS_LIST.find((d) => d.id === deptId || d.id === baseDept || d.id === `dept_${baseDept}`);
          if (dept) {
            orderedBreadcrumbs.push({
              id: `dept_${dept.id}`,
              name: dept.name,
              visibility: "private",
            });
          }
        }
      }
    }
  }

  return orderedBreadcrumbs;
};

export const getFavorites = async (event: any, userId: string) => {
  const queryString = getQuery(event);
  const params = getRouterParams(event);
  const favoriteFilters: any[] = [
    eq(favorites.userId, userId),
    eq(files.bucketName, params.bucket),
    isNull(files.deletedAt),
  ];

  if (queryString["filters[contentType]"]) {
    favoriteFilters.push(eq(files.type, queryString["filters[contentType]"] as string));
  }
  if (queryString["filters[shared]"] === "no") favoriteFilters.push(eq(files.sharedCount, 0));
  if (queryString["filters[shared]"] === "yes") favoriteFilters.push(ne(files.sharedCount, 0));
  if (["public", "private"].includes(String(queryString["filters[visibility]"] || ""))) {
    favoriteFilters.push(eq(files.visibility, queryString["filters[visibility]"] as string));
  }

  const tagFilter = queryString["filters[tags]"];
  if (typeof tagFilter === "string" && tagFilter.trim()) {
    for (const tag of tagFilter.split(",").map((value) => value.trim()).filter(Boolean)) {
      favoriteFilters.push(sql`EXISTS (
        SELECT 1 FROM json_each(${files.tags})
        WHERE json_each.value = ${tag}
      )`);
    }
  }

  for (const [key, rawValue] of Object.entries(queryString)) {
    const match = key.match(/^filters\[meta\]\[(.+)\]$/);
    if (!match || typeof rawValue !== "string" || !rawValue.trim()) continue;
    const jsonPath = `$.${match[1]}`;
    const values = rawValue.split(",").map((value) => value.trim()).filter(Boolean);
    const conditions = values.map(
      (value) => sql`json_extract(${files.customMetadata}, ${jsonPath}) = ${value}`,
    );
    if (conditions.length) favoriteFilters.push(or(...conditions));
  }

  let dataQuery = useDrizzle()
    .select({
      ...fileColumns,
      isFavorite: favorites.createdAt,
    })
    .from(favorites)
    .leftJoin(files, eq(favorites.fileId, files.id))
    .where(and(...favoriteFilters))
    .$dynamic();

  dataQuery = makeSorting(dataQuery, files, queryString);
  dataQuery = makePaginate(dataQuery, queryString);

  const data = await dataQuery;
  const nextPage = data.length === perPage ? Number(queryString.page) + 1 : null;
  return { data, nextPage };
};
export const getSharedWithMe = async (userId: string, queryString: any) => {
  let dataQuery = useDrizzle()
    .select({
      ...fileColumns,
      role: shared.role,
      sharedAt: shared.createdAt,
    })
    .from(shared)
    .leftJoin(files, eq(shared.fileId, files.id))
    .where(and(eq(shared.userId, userId), isNull(files.deletedAt)))
    .$dynamic();

  // 🔸 Sorting
  dataQuery = makeSorting(dataQuery, files, queryString);

  // 🔸 Pagination
  dataQuery = makePaginate(dataQuery, queryString);

  const data = await dataQuery;

  const nextPage =
    data.length === perPage ? Number(queryString.page) + 1 : null;
  return {
    data,
    nextPage,
  };
};

export const getPublished = async (event: any, userId: string, orgId?: string) => {
  const queryString = getQuery(event);
  const filters = [];

  let dataQuery = useDrizzle()
    .select({
      ...fileColumns,
      isFavorite: favorites.createdAt,
    })
    .from(files)
    .leftJoin(
      favorites,
      and(eq(files.id, favorites.fileId), eq(favorites.userId, userId))
    )
    .$dynamic();

  // 🔸 Filtering
  if (orgId && orgId !== "org_default") {
    filters.push(or(eq(files.organizationId, orgId), eq(files.userId, userId)));
  } else {
    filters.push(eq(files.userId, userId));
  }
  filters.push(eq(files.visibility, "public"));
  filters.push(isNull(files.deletedAt));

  if (queryString["filters[contentType]"]) {
    filters.push(eq(files.type, queryString["filters[contentType]"] as string));
  }
  if (queryString["filters[shared]"]) {
    if (queryString["filters[shared]"] === "no")
      filters.push(eq(files.sharedCount, 0));
    if (queryString["filters[shared]"] === "yes")
      filters.push(ne(files.sharedCount, 0));
  }

  dataQuery = dataQuery.where(and(...filters));

  // 🔸 Sorting
  dataQuery = makeSorting(dataQuery, files, queryString);

  // 🔸 Pagination
  dataQuery = makePaginate(dataQuery, queryString);

  const data = await dataQuery;

  const nextPage =
    data.length === perPage ? Number(queryString.page) + 1 : null;
  return {
    data,
    nextPage,
  };
};
export const getRecent = async (event: any, userId: string) => {
  const queryString = getQuery(event);
  const params = getRouterParams(event);
  const bucketName = params.bucket;

  const currentUser = await getUser(userId);
  const orgId = currentUser?.organizationId || "org_default";

  const filters = [];

  // User scoping: a user sees their own uploads in Recent Activity
  filters.push(eq(files.userId, userId));
  if (bucketName) {
    filters.push(eq(files.bucketName, bucketName));
  }
  filters.push(isNull(files.deletedAt));

  // Time window: only uploads and activity from the previous 12 hours
  const twelveHoursAgoSec = Math.floor(Date.now() / 1000) - 12 * 3600;
  filters.push(
    sql`(${files.updatedAt} >= ${twelveHoursAgoSec} OR ${files.createdAt} >= ${twelveHoursAgoSec})`
  );

  // Exclude internal RAG parsed files
  filters.push(sql`${files.name} NOT LIKE '%_parsed.md'`);
  filters.push(sql`(json_extract(${files.assetMetadata}, '$.source') IS NULL OR json_extract(${files.assetMetadata}, '$.source') != 'rag')`);

  // Content type / filter query params if any
  if (queryString["filters[contentType]"]) {
    filters.push(eq(files.type, queryString["filters[contentType]"] as string));
  }
  if (queryString["filters[shared]"]) {
    if (queryString["filters[shared]"] === "no")
      filters.push(eq(files.sharedCount, 0));
    if (queryString["filters[shared]"] === "yes")
      filters.push(ne(files.sharedCount, 0));
  }
  if (
    queryString["filters[visibility]"] &&
    ["public", "private"].includes(queryString["filters[visibility]"] as string)
  ) {
    filters.push(
      eq(files.visibility, queryString["filters[visibility]"] as string)
    );
  }

  // Fetch all candidate recent items ordered by latest activity
  const rawRecent = await useDrizzle()
    .select({
      ...fileColumns,
      isFavorite: favorites.createdAt,
    })
    .from(files)
    .leftJoin(
      favorites,
      and(eq(files.id, favorites.fileId), eq(favorites.userId, userId))
    )
    .where(and(...filters))
    .orderBy(desc(files.updatedAt));

  // Build parent map of all active folders for ancestor hierarchy resolution
  const allOrgFolders = await useDrizzle()
    .select({ id: files.id, parentId: files.parentId })
    .from(files)
    .where(
      and(
        bucketName ? eq(files.bucketName, bucketName) : undefined,
        orgId !== "org_default" ? eq(files.organizationId, orgId) : undefined,
        eq(files.type, "folder"),
        isNull(files.deletedAt)
      )
    );
  const folderParentMap = new Map<string, string>();
  for (const f of allOrgFolders) {
    if (f.parentId) folderParentMap.set(f.id, f.parentId);
  }

  // Collect all folder IDs that are present in the candidate recent set
  const recentFolderIds = new Set(
    rawRecent.filter((item) => item.type === "folder").map((item) => item.id)
  );

  const isDescendantOfAnyRecentFolder = (item: any): boolean => {
    let currParent = item.parentId;
    while (currParent && currParent !== "root") {
      if (recentFolderIds.has(currParent)) return true;
      currParent = folderParentMap.get(currParent);
    }
    return false;
  };

  // Filter out:
  // 1. System/hidden files and folders (.agent, .git, __MACOSX, __pycache__, node_modules, etc.)
  // 2. Child items (subfolders and component files) whose parent or ancestor folder is already in the recent list
  const topLevelRecent = rawRecent.filter((item) => {
    const name = item.name || "";
    if (
      name.startsWith(".") ||
      name.startsWith("__") ||
      name === "node_modules" ||
      name === "Thumbs.db" ||
      name === ".DS_Store"
    ) {
      return false;
    }

    if (isDescendantOfAnyRecentFolder(item)) {
      return false;
    }

    return true;
  });

  // Apply pagination
  const page = Math.max(1, Number(queryString.page) || 1);
  const perPageCount = 100;
  const startIndex = (page - 1) * perPageCount;
  const data = topLevelRecent.slice(startIndex, startIndex + perPageCount);
  const nextPage =
    startIndex + perPageCount < topLevelRecent.length ? page + 1 : null;

  return {
    data,
    nextPage,
  };
};

export const setVisibility = async (bucketName: string, data: IFile) => {
  let file = await getFolder(data.id);
  if (!file) {
    const [byPath] = await useDrizzle()
      .select()
      .from(files)
      .where(or(eq(files.id, data.id), eq(files.path, data.id), eq(files.storagePath, data.id)))
      .limit(1);
    file = byPath || null;
  }
  if (file) {
    return await useDrizzle()
      .update(files)
      .set({
        visibility: data.visibility,
        updatedAt: new Date(),
      })
      .where(eq(files.id, file.id));
  }
};

export const shareFiles = async (
  bucketName: string,
  filesList: IFile[],
  members: { email: string; role: string }[],
  sender?: any,
) => {
  for (const member of members) {
    const rawEmail = member.email.trim().toLowerCase();
    let user = await getUserByEmail(rawEmail);
    if (!user) {
      const newUserId = ulid();
      const orgId = sender?.organizationId || "org_default";
      const nameStem = rawEmail.split("@")[0].replace(/[._-]/g, " ");
      const userName = nameStem.replace(/\b\w/g, (c) => c.toUpperCase());
      const newUserObj = {
        id: newUserId,
        name: userName,
        email: rawEmail,
        avatar: null,
        role: "team_member",
        organizationId: orgId,
        departmentId: sender?.departmentId || null,
        status: "active",
        approvalStatus: "active",
        createdAt: new Date(),
      };
      await useDrizzle().insert(users).values(newUserObj);
      user = newUserObj as any;
    }

    for (const file of filesList) {
      const existing = await useDrizzle()
        .select()
        .from(shared)
        .where(and(eq(shared.fileId, file.id), eq(shared.userId, user.id)))
        .limit(1);

      if (existing.length > 0) {
        await useDrizzle()
          .update(shared)
          .set({ role: member.role || "viewer" })
          .where(and(eq(shared.fileId, file.id), eq(shared.userId, user.id)));
      } else {
        await useDrizzle()
          .insert(shared)
          .values({
            fileId: file.id,
            userId: user.id,
            role: member.role || "viewer",
            organizationId: user.organizationId || sender?.organizationId || "org_default",
            createdAt: new Date(),
          });

        await useDrizzle()
          .update(files)
          .set({ sharedCount: sql`${files.sharedCount} + 1` })
          .where(eq(files.id, file.id));
      }
    }
  }
  return { success: true };
};

export const getNestedFolders = async (bucketName: string, userId: string) => {
  const currentUser = await getUser(userId);
  const role = currentUser?.role;
  const userDept = currentUser?.departmentId;
  const orgId = currentUser?.organizationId || "org_default";

  // Let's get all folders in the database
  const folders = await useDrizzle()
    .select()
    .from(files)
    .where(
      and(
        eq(files.bucketName, bucketName),
        eq(files.type, "folder"),
        isNull(files.deletedAt)
      )
    );

  if (bucketName !== "org") {
    // Standard user-specific folder picker for other buckets (if any)
    const filteredFolders = folders.filter((f) => f.userId === userId);
    return makeNested(filteredFolders, "root");
  }

  // Shared org bucket: Build tree starting from the virtual department folders
  const allDepts = await getOrgDepartments(orgId);
  const topDepts = allDepts.filter((d: any) => d.parentId === null);
  let allowedDepts = topDepts;

  if (role !== "admin" && userDept) {
    const baseDeptId = userDept.startsWith(`${orgId}_`) ? userDept.substring(orgId.length + 1) : userDept;
    const myDept = allDepts.find((d: any) => d.id === baseDeptId);
    const topDeptId = myDept?.parentId || baseDeptId;
    allowedDepts = topDepts.filter((d: any) => d.id === topDeptId);
  }

  const buildDeptSubtree = (deptId: string, deptName: string): any => {
    // Find sub-departments
    const subDepts = allDepts.filter((d: any) => d.parentId === deptId);
    let allowedSubDepts = subDepts;
    if (role !== "admin" && userDept) {
      const baseDeptId = userDept.startsWith(`${orgId}_`) ? userDept.substring(orgId.length + 1) : userDept;
      allowedSubDepts = subDepts.filter((d: any) => d.id === baseDeptId);
    }

    const subDeptNodes = allowedSubDepts.map((d: any) => buildDeptSubtree(d.id, d.name));
    let physicalNodes = makeNested(folders, `dept_${deptId}`);

    if (deptId === "founders") {
      const rootFolders = folders.filter((f) => f.parentId === "root");
      const rootNodes = rootFolders.map((f) => ({
        id: f.id,
        path: f.path,
        name: f.name,
        label: f.name,
        icon: "lucide:folder",
        children: makeNested(folders, f.id),
      }));
      physicalNodes = [...physicalNodes, ...rootNodes];
    }

    return {
      id: `dept_${deptId}`,
      path: `org/${deptId}`,
      name: deptName,
      label: deptName,
      icon: "lucide:folder",
      children: [...subDeptNodes, ...physicalNodes],
    };
  };

  const tree = allowedDepts.map((d: any) => buildDeptSubtree(d.id, d.name));
  
  // Include all physical root folders at the top level
  const rootFolders = folders.filter((f) => f.parentId === "root");
  const rootNodes = rootFolders.map((f) => ({
    id: f.id,
    path: f.path,
    name: f.name,
    label: f.name,
    icon: "lucide:folder",
    children: makeNested(folders, f.id),
  }));

  return [...tree, ...rootNodes];
};

export const makeNested = (list: any[], parentId: string): any[] => {
  return list
    .filter((item) => item.parentId === parentId)
    .map((item: IFile) => ({
      id: item.id,
      path: item.path,
      name: item.name,
      label: item.name,
      icon: "lucide:folder",
      children: makeNested(list, item.id),
    }));
};

export const updateContentType = async (id: string, contentType: string) => {
  return await useDrizzle()
    .update(files)
    .set({
      contentType,
    })
    .where(eq(files.id, id));
};

export const getComputedVisibility = async (bucketName: string, file: any) => {
  if (file.visibility && file.visibility !== "inherit") {
    return file.visibility;
  }
  if (file.parentId === "root") {
    return "private";
  }
  const folderPath = file.path.split("/").slice(0, -1).join("/");
  const breadcrumb = await getBreadcrumb(bucketName, folderPath);
  return getVisibility(breadcrumb, file.visibility);
};

export const transformList = async (bucketName: string, files: any) => {
  const data = await Promise.all(
    files.data.map(async (file: any) => ({
      ...file,
      visibility: await getComputedVisibility(bucketName, file),
    }))
  );
  return { data, nextPage: files.nextPage };
};

export const setFolderThumbnail = async (id: string, previewUrl: string) => {
  // Get the folder
  const folder = await getFolder(id);

  if (folder && folder.type === "folder") {
    try {
      // Parse existing previews or initialize empty array
      let previews = [];
      if (folder.preview) {
        try {
          previews = JSON.parse(folder.preview);
          // Ensure it's an array
          if (!Array.isArray(previews)) {
            previews = [];
          }
        } catch (e) {
          // If parsing fails, start with empty array
          previews = [];
        }
      }

      // Check if the preview URL already exists in the array
      const existingIndex = previews.indexOf(previewUrl);

      // Only add if not already present and less than 4 previews
      if (existingIndex === -1 && previews.length < 4) {
        previews.push(previewUrl);
        // Update the folder in the database
        await useDrizzle()
          .update(files)
          .set({
            preview: JSON.stringify(previews),
            updatedAt: new Date(),
          })
          .where(eq(files.id, id));
      }
    } catch (error) {
      console.error("Error updating folder thumbnail:", error);
      throw error;
    }
  }
};

export const updateCount = async (id: string) => {
  if (id === "root") return;
  return await useDrizzle()
    .update(files)
    .set({
      count: sql`count + 1`,
    })
    .where(eq(files.id, id));
};

export const getFilesRecursive = async (
  bucketName: string,
  items: string[]
) => {
  const allIds: string[] = [];
  const response = await useDrizzle()
    .select()
    .from(files)
    .where(and(eq(files.bucketName, bucketName), inArray(files.id, items)));
  if (response && response.length > 0) {
    const folderIds: string[] = [];
    response.forEach((item) => {
      if (item.type === "folder") folderIds.push(item.id);
      allIds.push(item.id);
    });
    if (folderIds.length > 0) {
      const children = await useDrizzle()
        .select()
        .from(files)
        .where(
          and(
            eq(files.bucketName, bucketName),
            inArray(files.parentId, folderIds)
          )
        );
      if (children && children.length > 0) {
        const childrenIds = await getFilesRecursive(
          bucketName,
          children?.map((item) => item.id) || []
        );
        if (childrenIds) {
          allIds.push(...childrenIds);
        }
      }
    }
  }
  return allIds;
};

export const deleteFiles = async (bucketName: string, items: string[]) => {
  const allIds = await getFilesRecursive(bucketName, items);

  const alreadyTrashed = await useDrizzle()
    .select()
    .from(files)
    .where(
      and(
        eq(files.bucketName, bucketName),
        inArray(files.id, allIds),
        isNotNull(files.deletedAt)
      )
    );

  const notTrashed = await useDrizzle()
    .select()
    .from(files)
    .where(
      and(
        eq(files.bucketName, bucketName),
        inArray(files.id, allIds),
        isNull(files.deletedAt)
      )
    );

  const deletedAt = new Date();

  // 1. Soft delete items that are NOT currently in the trash
  if (notTrashed.length > 0) {
    const notTrashedIds = notTrashed.map(item => item.id);
    const response = await useDrizzle()
      .update(files)
      .set({ deletedAt })
      .where(inArray(files.id, notTrashedIds))
      .returning();

    await Promise.all(
      response.map(async (item) => {
        if (item.type !== "folder") {
          const storagePath = getStoragePath(item);
          if (!await hasOtherStorageReference(storagePath, item.id)) {
            const safeTime = formatTrashTimestamp(item.deletedAt);
            await moveBlob(
              storagePath,
              `.trash/${bucketName}/${safeTime}/${storagePath}`
            );
          }
        }
      })
    );
  }

  // 2. Permanently delete items that are ALREADY in the trash
  if (alreadyTrashed.length > 0) {
    const alreadyTrashedIds = alreadyTrashed.map(item => item.id);
    const storageGroups = new Map<string, typeof alreadyTrashed>();
    for (const item of alreadyTrashed.filter((entry) => entry.type !== "folder")) {
      const storagePath = getStoragePath(item);
      storageGroups.set(storagePath, [...(storageGroups.get(storagePath) || []), item]);
    }
    for (const [storagePath, group] of storageGroups) {
      const [externalReference] = await useDrizzle()
        .select({ id: files.id })
        .from(files)
        .where(and(
          notInArray(files.id, alreadyTrashedIds),
          or(
            eq(files.storagePath, storagePath),
            and(isNull(files.storagePath), eq(files.path, storagePath)),
          ),
        ))
        .limit(1);
      if (!externalReference) {
        try {
          if (await localBlob().head(storagePath)) await localBlob().del(storagePath);
          for (const item of group) {
            const safeTime = formatTrashTimestamp(item.deletedAt);
            await localBlob().del(`.trash/${bucketName}/${safeTime}/${storagePath}`);
            try {
              await localBlob().del(`.trash/${bucketName}/${item.deletedAt?.toISOString()}/${storagePath}`);
            } catch {}
          }
        } catch (e) {
          // ignore if the final shared binary was already deleted
        }
      }
    }
    for (const item of alreadyTrashed) {
      if (item.type !== "folder") {
        try {
          const deletedVectors = await deletePineconeFileVectors(item.id, item.organizationId);
          await logPipelineEvent({
            organizationId: item.organizationId,
            departmentId: item.departmentId,
            fileId: item.id,
            eventType: "file_deleted",
            stage: "stage_5",
            status: "info",
            details: {
              deletedVectorsCount: deletedVectors,
              fileName: item.name,
            },
          });
        } catch (err: any) {
          console.warn(`[deleteFiles] Warning purging vectors for ${item.id}:`, err?.message || err);
        }
      }
    }

    await useDrizzle()
      .delete(files)
      .where(inArray(files.id, alreadyTrashedIds));
  }

  return { success: true, deleted: allIds.length };
};

export const restoreFiles = async (bucketName: string, items: string[]) => {
  const allIds = await getFilesRecursive(bucketName, items);
  const trashedItems = await useDrizzle()
    .select()
    .from(files)
    .where(
      and(
        eq(files.bucketName, bucketName),
        inArray(files.id, allIds),
        isNotNull(files.deletedAt),
      ),
    );

  await Promise.all(
    trashedItems.map(async (item) => {
      if (item.type !== "folder" && item.deletedAt) {
        const storagePath = getStoragePath(item);
        if (!await localBlob().head(storagePath)) {
          const safeTime = formatTrashTimestamp(item.deletedAt);
          const trashPath = `.trash/${bucketName}/${safeTime}/${storagePath}`;
          const oldTrashPath = `.trash/${bucketName}/${item.deletedAt.toISOString()}/${storagePath}`;
          if (await localBlob().head(trashPath)) {
            await moveBlob(trashPath, storagePath);
          } else if (await localBlob().head(oldTrashPath)) {
            await moveBlob(oldTrashPath, storagePath);
          }
        }
      }
    }),
  );

  if (trashedItems.length > 0) {
    await useDrizzle()
      .update(files)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(inArray(files.id, trashedItems.map((item) => item.id)));
  }

  return { success: true, restored: trashedItems.length };
};
export const getTrashed = async (event: any, userId: string) => {
  const queryString = getQuery(event);
  const params = getRouterParams(event);
  const bucketName = params.bucket;

  const currentUser = await getUser(userId);
  const role = currentUser?.role;
  const userDept = currentUser?.departmentId;

  const filters = [];
  filters.push(eq(files.bucketName, bucketName));
  filters.push(isNotNull(files.deletedAt));

  if (bucketName === "org" && role !== "admin") {
    if (userDept) {
      filters.push(
        or(
          like(files.path, `org/${userDept}/%`),
          eq(files.path, `org/${userDept}`)
        )
      );
    } else {
      filters.push(eq(files.id, "none"));
    }
  } else if (role !== "admin") {
    filters.push(eq(files.userId, userId));
  }

  // Fetch all candidate trashed items
  const rawTrashed = await useDrizzle()
    .select({
      ...fileColumns,
      deletedAt: files.deletedAt,
    })
    .from(files)
    .where(and(...filters))
    .orderBy(desc(files.deletedAt));

  // Collect all folder IDs that are currently in trash
  const trashedFolderIds = new Set(
    rawTrashed.filter((item) => item.type === "folder").map((item) => item.id)
  );

  // Keep only top-level deleted items (exclude child items whose parent folder is also in trash, and hidden/system files)
  const topLevelTrashed = rawTrashed.filter((item) => {
    const name = item.name || "";
    if (
      name.startsWith(".") ||
      name.startsWith("__") ||
      name === "node_modules" ||
      name === "Thumbs.db" ||
      name === ".DS_Store"
    ) {
      return false;
    }
    if (!item.parentId || item.parentId === "root") return true;
    return !trashedFolderIds.has(item.parentId);
  });

  // Apply pagination
  const page = Math.max(1, Number(queryString.page) || 1);
  const perPageCount = 100;
  const startIndex = (page - 1) * perPageCount;
  const data = topLevelTrashed.slice(startIndex, startIndex + perPageCount);
  const nextPage = startIndex + perPageCount < topLevelTrashed.length ? page + 1 : null;

  return {
    data,
    nextPage,
  };
};

// ─── RBAC User Helpers ───────────────────────────────────────────────────────

export const getDeptUserIds = async (departmentId: string): Promise<string[]> => {
  const result = await useDrizzle()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.departmentId, departmentId));
  return result.map((u) => u.id);
};

export const countAllUsers = async (): Promise<number> => {
  const result = await useDrizzle()
    .select({ count: sql<number>`COUNT(*)` })
    .from(users);
  return result[0]?.count ?? 0;
};

export const getAllUsers = async (organizationId: string, departmentId?: string) => {
  const orgFilter = organizationId === "org_default"
    ? or(eq(users.organizationId, "org_default"), isNull(users.organizationId), eq(users.organizationId, ""))
    : eq(users.organizationId, organizationId);
    
  const filters: any[] = [orgFilter];
  if (departmentId) filters.push(eq(users.departmentId, departmentId));
  return await useDrizzle()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      role: users.role,
      departmentId: users.departmentId,
      approvalStatus: users.approvalStatus,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...filters))
    .orderBy(desc(users.createdAt));
};

export const getPendingUsers = async (organizationId: string, departmentId?: string) => {
  const orgFilter = organizationId === "org_default"
    ? or(eq(users.organizationId, "org_default"), isNull(users.organizationId), eq(users.organizationId, ""))
    : eq(users.organizationId, organizationId);

  const filters: any[] = [
    orgFilter,
    eq(users.approvalStatus, "pending"),
  ];
  if (departmentId) filters.push(eq(users.departmentId, departmentId));
  return await useDrizzle()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      role: users.role,
      departmentId: users.departmentId,
      departmentName: orgDepartments.name,
      approvalStatus: users.approvalStatus,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(orgDepartments, eq(users.departmentId, orgDepartments.id))
    .where(and(...filters))
    .orderBy(asc(users.createdAt));
};

export const updateUserApproval = async (
  userId: string,
  approvalStatus: "active" | "pending" | "rejected"
) => {
  return await useDrizzle()
    .update(users)
    .set({ approvalStatus })
    .where(eq(users.id, userId));
};

export const updateUserRole = async (
  userId: string,
  role: string,
  departmentId: string | null
) => {
  return await useDrizzle()
    .update(users)
    .set({ role, departmentId })
    .where(eq(users.id, userId));
};

export const completeUserProfile = async (
  userId: string,
  role: string,
  departmentId: string
) => {
  return await useDrizzle()
    .update(users)
    .set({ role, departmentId, approvalStatus: "pending" })
    .where(eq(users.id, userId));
};

// ─── Nomenclature Helpers ─────────────────────────────────────────────────────

export const getNomenclature = async (departmentId: string) => {
  const result = await useDrizzle()
    .select()
    .from(nomenclatures)
    .where(eq(nomenclatures.departmentId, departmentId));
  return result[0] ?? null;
};

export const upsertNomenclature = async (
  departmentId: string,
  organizationId: string,
  template: string,
  segments: any[],
  allowedExtensions: string[] | null,
  updatedBy: string,
  folderTemplate?: string | null,
  folderSegments?: any[] | null,
) => {
  const existing = await getNomenclature(departmentId);
  const folderValues = folderTemplate === undefined && folderSegments === undefined
    ? {}
    : {
        folderTemplate: folderTemplate || null,
        folderSegments: folderSegments?.length ? folderSegments : null,
      };
  if (existing) {
    return await useDrizzle()
      .update(nomenclatures)
      .set({ organizationId, template, segments, allowedExtensions, ...folderValues, updatedBy, updatedAt: new Date() })
      .where(eq(nomenclatures.departmentId, departmentId));
  }
  return await useDrizzle().insert(nomenclatures).values({
    departmentId,
    organizationId,
    template,
    segments,
    updatedBy,
    allowedExtensions,
    folderTemplate: folderTemplate || null,
    folderSegments: folderSegments?.length ? folderSegments : null,
    updatedAt: new Date(),
  });
};

// ─── Folder Request Helpers ───────────────────────────────────────────────────

export const createFolderRequest = async (data: {
  requestedBy: string;
  departmentId: string;
  folderName: string;
  parentId: any;
  bucketName: string;
}) => {
  const id = ulid() as string;
  let pId = data.parentId;
  if (Array.isArray(pId)) {
    pId = pId[0];
  } else if (typeof pId === "object" && pId !== null) {
    pId = String(pId);
  }
  
  const requester = await getUser(data.requestedBy);
  const organizationId = requester?.organizationId || "org_default";
  const normalizedFolderName = data.folderName.trim();
  const [pendingDuplicate] = await useDrizzle()
    .select({ id: folderRequests.id })
    .from(folderRequests)
    .where(and(
      eq(folderRequests.organizationId, organizationId),
      eq(folderRequests.parentId, pId),
      eq(folderRequests.bucketName, data.bucketName),
      eq(folderRequests.status, "pending"),
      sql`lower(${folderRequests.folderName}) = ${normalizedFolderName.toLocaleLowerCase()}`,
    ))
    .limit(1);
  if (pendingDuplicate) {
    throw createError({ status: 409, message: "A pending request already exists for this folder name and destination." });
  }


  await useDrizzle()
    .insert(folderRequests)
    .values({ ...data, folderName: normalizedFolderName, parentId: pId, id, organizationId, createdAt: new Date(), updatedAt: new Date() });
  return { id };
};

export const getFolderRequests = async (organizationId: string, departmentId?: string, requestedBy?: string) => {
  const filters: any[] = [eq(folderRequests.organizationId, organizationId)];
  if (departmentId) filters.push(eq(folderRequests.departmentId, departmentId));
  if (requestedBy) filters.push(eq(folderRequests.requestedBy, requestedBy));
  return await useDrizzle()
    .select({
      id: folderRequests.id,
      requestedBy: folderRequests.requestedBy,
      departmentId: folderRequests.departmentId,
      folderName: folderRequests.folderName,
      parentId: folderRequests.parentId,
      bucketName: folderRequests.bucketName,
      status: folderRequests.status,
      reviewedBy: folderRequests.reviewedBy,
      reviewNote: folderRequests.reviewNote,
      reviewedAt: folderRequests.reviewedAt,
      finalFolderName: folderRequests.finalFolderName,
      createdAt: folderRequests.createdAt,
      updatedAt: folderRequests.updatedAt,
      requesterName: users.name,
      parentPath: files.path,
    })
    .from(folderRequests)
    .leftJoin(users, eq(folderRequests.requestedBy, users.id))
    .leftJoin(files, eq(folderRequests.parentId, files.id))
    .where(and(...filters))
    .orderBy(desc(folderRequests.createdAt));
};

export const updateFolderRequestStatus = async (
  id: string,
  status: "approved" | "rejected",
  reviewedBy: string,
  reviewNote?: string,
  finalFolderName?: string,
) => {
  return await useDrizzle()
    .update(folderRequests)
    .set({ status, reviewedBy, reviewNote, finalFolderName, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(folderRequests.id, id));
};

export const getFolderRequestById = async (id: string) => {
  const result = await useDrizzle()
    .select()
    .from(folderRequests)
    .where(eq(folderRequests.id, id));
  return result[0] ?? null;
};

export const moveItem = async (bucketName: string, itemId: string, targetParentId: string) => {
  const item = await getFolder(itemId);
  if (!item || item.bucketName !== bucketName) {
    throw createError({ status: 404, message: "Item not found." });
  }

  // Calculate new path
  let parentPath = bucketName;
  if (targetParentId.startsWith("dept_")) {
    const deptId = targetParentId.substring(5);
    parentPath = `${bucketName}/${deptId}`;
  } else if (targetParentId !== "root") {
    const parentFolder = await getFolder(targetParentId);
    if (!parentFolder || parentFolder.type !== "folder") {
      throw createError({ status: 404, message: "Destination folder not found." });
    }
    parentPath = parentFolder.path;
  }

  const newPath = cleanPath(`${parentPath}/${item.name}`);

  if (item.type !== "folder") {
    // It's a file - simple move
    const sourceStoragePath = getStoragePath(item);
    if (sourceStoragePath === item.path) await moveBlob(sourceStoragePath, newPath);
    else await copyBlob(sourceStoragePath, newPath);
    await useDrizzle()
      .update(files)
      .set({
        parentId: targetParentId,
        path: newPath,
        storagePath: newPath,
        preview: item.type === "image" ? newPath : item.preview,
        updatedAt: new Date(),
      })
      .where(eq(files.id, itemId));
  } else {
    // It's a folder - recursive move
    const oldPathPrefix = item.path;
    const newPathPrefix = newPath;

    // Fetch all descendants recursively
    const allIds = await getFilesRecursive(bucketName, [itemId]);

    // Update all items (including the folder itself)
    const dbItems = await useDrizzle()
      .select()
      .from(files)
      .where(inArray(files.id, allIds));

    for (const dbItem of dbItems) {
      const relativePath = dbItem.path.substring(oldPathPrefix.length);
      const itemNewPath = cleanPath(`${newPathPrefix}/${relativePath}`);

      if (dbItem.id === itemId) {
        // Update folder record
        await useDrizzle()
          .update(files)
          .set({
            parentId: targetParentId,
            path: itemNewPath,
            storagePath: itemNewPath,
            preview: dbItem.type === "image" ? itemNewPath : dbItem.preview,
            updatedAt: new Date(),
          })
          .where(eq(files.id, dbItem.id));
      } else {
        // Update descendant record
        await useDrizzle()
          .update(files)
          .set({
            path: itemNewPath,
            storagePath: itemNewPath,
            preview: dbItem.type === "image" ? itemNewPath : dbItem.preview,
            updatedAt: new Date(),
          })
          .where(eq(files.id, dbItem.id));
      }

      if (dbItem.type !== "folder") {
        // Move blob
        const sourceStoragePath = getStoragePath(dbItem);
        if (sourceStoragePath === dbItem.path) await moveBlob(sourceStoragePath, itemNewPath);
        else await copyBlob(sourceStoragePath, itemNewPath);
      }
    }
  }
  return { success: true };
};

export const copyItem = async (bucketName: string, itemId: string, newName: string, userId: string) => {
  const file = await getFolder(itemId);
  if (!file || file.bucketName !== bucketName) {
    throw createError({ status: 404, message: "File not found." });
  }
  if (file.type === "folder") {
    throw createError({ status: 400, message: "Copying folders is not supported." });
  }

  const normalizedName = String(newName || "").trim();
  if (!normalizedName || normalizedName === "." || normalizedName === ".." || /[\\/]/.test(normalizedName)) {
    throw createError({ status: 400, message: "Enter a valid filename without folder separators." });
  }

  const pathParts = file.path.split("/");
  pathParts.pop(); // remove original filename
  const newPath = cleanPath(`${pathParts.join("/")}/${normalizedName}`);

  // check if file already exists at target path
  const existing = await getFile(bucketName, newPath);
  if (existing) {
    throw createError({ status: 400, message: "A file with this name already exists in this folder." });
  }

  // Copy blob in storage
  await copyBlob(getStoragePath(file), newPath);

  // Insert new record in DB
  const newId = ulid() as string;
  const insertFile = {
    id: newId,
    name: normalizedName,
    path: newPath,
    storagePath: newPath,
    duplicateOfId: null,
    type: file.type,
    size: file.size,
    contentType: file.contentType,
    dimensions: file.dimensions,
    userId: userId, // The user performing the copy
    bucketName: bucketName,
    parentId: file.parentId,
    createdAt: new Date(),
    updatedAt: new Date(),
    preview: file.type === "image" ? newPath : null,
    visibility: file.visibility,
    organizationId: file.organizationId,
    md5: file.md5,
    assetMetadata: file.assetMetadata,
    tags: file.tags,
    customMetadata: file.customMetadata,
  };

  let response;
  try {
    response = await useDrizzle()
      .insert(files)
      .values(insertFile)
      .returning();
  } catch (error) {
    await localBlob().del(newPath);
    throw error;
  }

  if (response && response.length > 0) {
    if (file.parentId && file.parentId !== "root") {
      await updateCount(file.parentId);
    }
    return response[0];
  }
  throw createError({ status: 500, message: "Failed to create copied file record." });
};

export const renameItem = async (bucketName: string, itemId: string, newName: string) => {
  const item = await getFolder(itemId);
  if (!item || item.bucketName !== bucketName) {
    throw createError({ status: 404, message: "Item not found." });
  }

  const pathParts = item.path.split("/");
  pathParts.pop(); // remove old name
  const newPath = cleanPath(`${pathParts.join("/")}/${newName}`);

  // check if file/folder already exists at target path
  const existing = await getFile(bucketName, newPath);
  if (existing) {
    throw createError({ status: 400, message: "An item with this name already exists." });
  }

  if (item.type !== "folder") {
    // File rename
    const sourceStoragePath = getStoragePath(item);
    if (sourceStoragePath === item.path) await moveBlob(sourceStoragePath, newPath);
    else await copyBlob(sourceStoragePath, newPath);
    await useDrizzle()
      .update(files)
      .set({
        name: newName,
        path: newPath,
        storagePath: newPath,
        preview: item.type === "image" ? newPath : item.preview,
        updatedAt: new Date(),
      })
      .where(eq(files.id, itemId));
  } else {
    // Folder recursive rename
    const oldPathPrefix = item.path;
    const newPathPrefix = newPath;

    // Fetch descendants
    const allIds = await getFilesRecursive(bucketName, [itemId]);

    const dbItems = await useDrizzle()
      .select()
      .from(files)
      .where(inArray(files.id, allIds));

    for (const dbItem of dbItems) {
      const relativePath = dbItem.path.substring(oldPathPrefix.length);
      const itemNewPath = cleanPath(`${newPathPrefix}/${relativePath}`);

      if (dbItem.id === itemId) {
        // Update folder name and path
        await useDrizzle()
          .update(files)
          .set({
            name: newName,
            path: itemNewPath,
            updatedAt: new Date(),
          })
          .where(eq(files.id, dbItem.id));
      } else {
        // Update descendant path and preview
        await useDrizzle()
          .update(files)
          .set({
            path: itemNewPath,
            storagePath: itemNewPath,
            preview: dbItem.type === "image" ? itemNewPath : dbItem.preview,
            updatedAt: new Date(),
          })
          .where(eq(files.id, dbItem.id));
      }

      if (dbItem.type !== "folder") {
        const sourceStoragePath = getStoragePath(dbItem);
        if (sourceStoragePath === dbItem.path) await moveBlob(sourceStoragePath, itemNewPath);
        else await copyBlob(sourceStoragePath, itemNewPath);
      }
    }
  }
  return { success: true };
};

// ─── Organization & Permission Helpers ────────────────────────────────────────

export const getOrgDepartments = async (organizationId: string) => {
  const db = useDrizzle();
  const result = await db
    .select()
    .from(orgDepartments)
    .where(eq(orgDepartments.organizationId, organizationId));
  
  return result || [];
};

export const getOrgPermissions = async (organizationId: string) => {
  if (!organizationId) return [];

  const result = await useDrizzle()
    .select()
    .from(orgPermissions)
    .where(eq(orgPermissions.organizationId, organizationId));

  if (!result || result.length === 0) {
    const [org] = await useDrizzle()
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    if (!org) {
      return [];
    }

    const roles = ["dept_head", "team_lead", "team_member", "guest"];
    const db = useDrizzle();
    const inserted = [];
    for (const r of roles) {
      const permRow = {
        id: ulid() as string,
        organizationId,
        departmentId: "global",
        role: r,
        maxCount: null,
        canView: true,
        canUpload: true,
        canDownload: true,
        canDelete: r === "dept_head" || r === "team_lead",
        canCreateFolder: r === "dept_head" || r === "team_lead",
        canApproveUsers: r === "dept_head",
        canEditNomenclature: r === "dept_head",
        canShare: r === "dept_head" || r === "team_lead",
        canRename: r === "dept_head" || r === "team_lead",
        canEditMetadata: r === "dept_head" || r === "team_lead",
        canUseRag: r !== "guest" && r !== "intern",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      try {
        await db.insert(orgPermissions).values(permRow);
        inserted.push(permRow);
      } catch (insertErr) {
        console.warn(`[getOrgPermissions] Failed to insert default perm for ${organizationId} role ${r}:`, insertErr);
      }
    }
    return inserted;
  }
  return result;
};

export const createOrganization = async (
  name: string,
  orgType: "s3" | "gdrive" = "s3",
  creatorUserId?: string
) => {
  const orgId = ulid() as string;
  const defaultFeatures = {
    nomenclature: true,
    hierarchy: true,
    userPermissions: true,
    templateFolders: true,
  };
  await useDrizzle().insert(organizations).values({
    id: orgId,
    name,
    orgType,
    status: "active",
    features: defaultFeatures,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Seed default global permissions for roles
  await getOrgPermissions(orgId);

  // Link creator as admin if provided
  if (creatorUserId) {
    const db = useDrizzle();
    await db.insert(userOrganizations).values({
      id: `uo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: creatorUserId,
      organizationId: orgId,
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return orgId;
};

export const updateOrganizationSettings = async (
  organizationId: string,
  name?: string,
  departmentsList?: any[],
  permissionsList?: any[],
  userId?: string
) => {
  const db = useDrizzle();
  
  // 1. Update organization name if provided
  if (name !== undefined) {
    await db.update(organizations)
      .set({ name, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));
  }

  // 2. Save departments hierarchy if provided (preserving any existing folder mappings without generating asset folders)
  if (departmentsList !== undefined) {
    const existingDepts = await db.select().from(orgDepartments).where(eq(orgDepartments.organizationId, organizationId));
    const existingFolderMap = new Map(existingDepts.map(d => [d.id, d.folderId]));
    const existingGDriveFolderMap = new Map(existingDepts.map(d => [d.id, d.gdriveFolderId]));

    await db.delete(orgDepartments).where(eq(orgDepartments.organizationId, organizationId));

    for (const d of departmentsList) {
      await db.insert(orgDepartments).values({
        id: d.id,
        organizationId,
        name: d.name,
        parentId: d.parentId || null,
        folderId: d.folderId || existingFolderMap.get(d.id) || null,
        gdriveFolderId: d.gdriveFolderId || existingGDriveFolderMap.get(d.id) || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // 3. Update / Upsert permissions if provided (includes global and department overrides)
  if (permissionsList !== undefined) {
    const validDeptIds = (departmentsList || []).map((d) => d.id);
    if (departmentsList !== undefined) {
      await db.delete(orgPermissions)
        .where(and(
          eq(orgPermissions.organizationId, organizationId),
          ne(orgPermissions.departmentId, "global"),
          notInArray(orgPermissions.departmentId, validDeptIds.length ? validDeptIds : ["dummy"])
        ));
    }

    for (const perm of permissionsList) {
      const deptId = perm.departmentId || "global";
      const rolesToMatch = perm.role === "guest" ? ["guest", "intern"] : [perm.role];
      const existing = await db.select()
        .from(orgPermissions)
        .where(and(
          eq(orgPermissions.organizationId, organizationId),
          eq(orgPermissions.departmentId, deptId),
          inArray(orgPermissions.role, rolesToMatch)
        ));

      if (existing && existing.length > 0) {
        await db.update(orgPermissions)
          .set({
            role: perm.role,
            canView: perm.canView ?? true,
            canUpload: perm.canUpload,
            canDownload: perm.canDownload,
            canDelete: perm.canDelete,
            canCreateFolder: perm.canCreateFolder,
            canApproveUsers: perm.canApproveUsers,
            canEditNomenclature: perm.canEditNomenclature,
            canShare: perm.canShare,
            canRename: perm.canRename ?? false,
            canEditMetadata: perm.canEditMetadata ?? false,
            canUseRag: perm.canUseRag ?? false,
            maxCount: perm.maxCount !== undefined && perm.maxCount !== "" ? Number(perm.maxCount) : null,
            updatedAt: new Date(),
          })
          .where(eq(orgPermissions.id, existing[0].id));

        if (existing.length > 1) {
          for (let i = 1; i < existing.length; i++) {
            await db.delete(orgPermissions).where(eq(orgPermissions.id, existing[i].id));
          }
        }
      } else {
        await db.insert(orgPermissions).values({
          id: ulid() as string,
          organizationId,
          departmentId: deptId,
          role: perm.role,
          maxCount: perm.maxCount !== undefined && perm.maxCount !== "" ? Number(perm.maxCount) : null,
          canView: perm.canView ?? true,
          canUpload: perm.canUpload,
          canDownload: perm.canDownload,
          canDelete: perm.canDelete,
          canCreateFolder: perm.canCreateFolder,
          canApproveUsers: perm.canApproveUsers,
          canEditNomenclature: perm.canEditNomenclature,
          canShare: perm.canShare,
          canRename: perm.canRename ?? false,
          canEditMetadata: perm.canEditMetadata ?? false,
          canUseRag: perm.canUseRag ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  return { success: true };
};

export const getOrgFeatures = async (orgId: string) => {
  const DEFAULT_FEATURES = {
    nomenclature: true,
    hierarchy: true,
    userPermissions: true,
    templateFolders: true,
  };
  const db = useDrizzle();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return DEFAULT_FEATURES;
  // features may be a JSON string (legacy) or an object; always parse and merge with defaults
  let parsed = org.features as any;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  return { ...DEFAULT_FEATURES, ...(parsed || {}) };
};

/**
 * Returns the Google Drive governance rules for an organization.
 * If none exist, returns safe defaults (all features permissive).
 */
export const getGDriveRules = async (orgId: string) => {
  const db = useDrizzle();
  const effectiveOrgId = orgId || "org_default";
  const [rules] = await db
    .select()
    .from(orgGDriveRules)
    .where(
      or(
        eq(orgGDriveRules.organizationId, effectiveOrgId),
        eq(orgGDriveRules.organizationId, "org_default")
      )
    )
    .orderBy(desc(orgGDriveRules.updatedAt));
  return rules ?? {
    enforceNomenclature: false,
    enforceHierarchy: false,
    allowInterDeptVisibility: true,
  };
};

/**
 * Creates or updates the Google Drive governance rules for an organization.
 */
export const upsertGDriveRules = async (
  orgId: string,
  rules: {
    enforceNomenclature: boolean;
    enforceHierarchy: boolean;
    allowInterDeptVisibility: boolean;
  }
) => {
  const db = useDrizzle();
  const effectiveOrgId = orgId || "org_default";
  const existing = await db
    .select()
    .from(orgGDriveRules)
    .where(
      or(
        eq(orgGDriveRules.organizationId, effectiveOrgId),
        eq(orgGDriveRules.organizationId, "org_default")
      )
    );

  if (existing && existing.length > 0) {
    await db
      .update(orgGDriveRules)
      .set({
        enforceNomenclature: rules.enforceNomenclature,
        enforceHierarchy: rules.enforceHierarchy,
        allowInterDeptVisibility: rules.allowInterDeptVisibility,
        updatedAt: new Date(),
      })
      .where(
        or(
          eq(orgGDriveRules.organizationId, effectiveOrgId),
          eq(orgGDriveRules.organizationId, "org_default")
        )
      );
  } else {
    await db.insert(orgGDriveRules).values({
      id: ulid() as string,
      organizationId: effectiveOrgId,
      enforceNomenclature: rules.enforceNomenclature,
      enforceHierarchy: rules.enforceHierarchy,
      allowInterDeptVisibility: rules.allowInterDeptVisibility,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return { success: true };
};

/**
 * Returns the nomenclature template for a department (or org-level / any configured department if no dept match).
 */
export const getNomenclatureForDept = async (orgId: string, departmentId?: string | null) => {
  const db = useDrizzle();
  const effectiveOrgId = orgId || "org_default";

  // 1. Try exact department match within this org or org_default
  if (departmentId) {
    const [deptNomenclature] = await db
      .select()
      .from(nomenclatures)
      .where(
        and(
          or(
            eq(nomenclatures.organizationId, effectiveOrgId),
            eq(nomenclatures.organizationId, "org_default")
          ),
          eq(nomenclatures.departmentId, departmentId)
        )
      );
    // If it has non-empty segments configured, return it
    if (
      deptNomenclature &&
      ((Array.isArray(deptNomenclature.segments) && deptNomenclature.segments.length > 0) ||
       (Array.isArray(deptNomenclature.folderSegments) && deptNomenclature.folderSegments.length > 0))
    ) {
      return deptNomenclature;
    }
  }

  // 2. Fallback to any nomenclature record in this org (or org_default) that has configured segments
  const allNomenclatures = await db
    .select()
    .from(nomenclatures)
    .where(
      or(
        eq(nomenclatures.organizationId, effectiveOrgId),
        eq(nomenclatures.organizationId, "org_default")
      )
    )
    .orderBy(desc(nomenclatures.updatedAt));

  const matchWithSegments = allNomenclatures.find(
    (n) =>
      (Array.isArray(n.segments) && n.segments.length > 0) ||
      (Array.isArray(n.folderSegments) && n.folderSegments.length > 0)
  );

  return matchWithSegments ?? allNomenclatures[0] ?? null;
};


// Update a file's tags and customMetadata
export const updateFileMetadata = async (
  fileId: string,
  orgId: string,
  data: { tags?: string[]; customMetadata?: Record<string, any> }
) => {
  const [updated] = await useDrizzle()
    .update(files)
    .set({
      tags: data.tags,
      customMetadata: data.customMetadata,
      updatedAt: new Date(),
    })
    .where(and(eq(files.id, fileId), eq(files.organizationId, orgId)))
    .returning();
  return updated;
};

// Faceted search: filter by name query AND custom metadata dimensions
// metaFilters: { [key]: value_or_array_of_values }
export const searchFilesWithFacets = async (
  orgId: string,
  bucketName: string,
  {
    q,
    tags,
    metaFilters,
    type,
    page = 1,
  }: {
    q?: string;
    tags?: string[];
    metaFilters?: Record<string, string | string[]>;
    type?: string;
    page?: number;
  }
) => {
  const db = useDrizzle();
  const conditions: any[] = [
    eq(files.organizationId, orgId),
    eq(files.bucketName, bucketName),
    isNull(files.deletedAt),
  ];

  // Text search on name
  if (q) {
    conditions.push(sql`LOWER(${files.name}) LIKE LOWER(${'%' + q + '%'})`);
  }

  // File type filter
  if (type) {
    conditions.push(eq(files.type, type));
  }

  // Tag filter (checks if the stored JSON array contains ALL requested tags)
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM json_each(${files.tags})
          WHERE json_each.value = ${tag}
        )`
      );
    }
  }

  // Custom metadata facet filters via SQLite json_extract
  if (metaFilters) {
    for (const [key, value] of Object.entries(metaFilters)) {
      const jsonPath = `$.${key}`;
      if (Array.isArray(value)) {
        // multiselect: match any of the provided values
        const orConditions = value.map(
          (v) => sql`json_extract(${files.customMetadata}, ${jsonPath}) = ${v}`
        );
        if (orConditions.length > 0) {
          conditions.push(or(...orConditions));
        }
      } else {
        conditions.push(
          sql`json_extract(${files.customMetadata}, ${jsonPath}) = ${value}`
        );
      }
    }
  }

  const offset = (page - 1) * perPage;
  const data = await db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.updatedAt))
    .limit(perPage)
    .offset(offset);

  return {
    data,
    nextPage: data.length === perPage ? page + 1 : null,
  };
};
