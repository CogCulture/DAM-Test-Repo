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
import { users, files, buckets, favorites, shared, nomenclatures, folderRequests, organizations, orgDepartments, orgPermissions, gdriveFolders } from "../database/schema";

const perPage = 12;

const fileColumns = {
  id: files.id,
  name: files.name,
  path: files.path,
  type: files.type,
  contentType: files.contentType,
  size: files.size,
  preview: files.preview,
  visibility: files.visibility,
  sharedCount: files.sharedCount,
  count: files.count,
  dimensions: files.dimensions,
  createdAt: files.createdAt,
  updatedAt: files.updatedAt,
};

export async function createUser(data: CreateUserType) {
  return await useDrizzle().insert(users).values(data);
}

export async function getUserByEmail(email: string) {
  const result = await useDrizzle()
    .select()
    .from(users)
    .where(eq(users.email, email));
  if (result && result.length > 0) {
    return result[0];
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
    if (!userRow.organizationId) {
      userRow.organizationId = "org_default";
    }
    if (userRow.organizationId && userRow.role !== "admin") {
      const perms = await getOrgPermissions(userRow.organizationId);
      // Check department override first, then fallback to global
      let rolePerm = perms.find((p) => p.role === userRow.role && p.departmentId === userRow.departmentId);
      if (!rolePerm) {
        rolePerm = perms.find((p) => p.role === userRow.role && p.departmentId === "global");
      }
      userRow.permissions = rolePerm || null;
    } else if (userRow.role === "admin") {
      // Admins bypass all limits
      userRow.permissions = {
        canUpload: true,
        canDownload: true,
        canDelete: true,
        canCreateFolder: true,
        canApproveUsers: true,
        canEditNomenclature: true,
        canShare: true,
      };
    }
    return userRow;
  }
  return null;
}

export const makeSorting = (dbQuery: any, model: any, queryString: any) => {
  const { sortBy, order = "desc" } = queryString;

  const sortColumn =
    typeof sortBy === "string" && model[sortBy]
      ? model[sortBy]
      : model.createdAt;

  if (sortColumn) {
    return dbQuery.orderBy(
      order === "asc" ? asc(sortColumn) : desc(sortColumn)
    );
  }
  dbQuery;
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

import { DEPARTMENTS } from "~~/shared/constants/departments";

const makeVirtualFolder = (deptId: string, name: string) => ({
  id: `dept_${deptId}`,
  name,
  path: `org/${deptId}`,
  type: "folder",
  contentType: "folder",
  bucketName: "org",
  size: 0,
  visibility: "private",
  sharedCount: 0,
  count: 0,
  dimensions: null,
  preview: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// @ts-ignore
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

  // Resolve virtual folders
  const parentId = params.id || "root";

  if (params.bucket === "org") {
    const orgDepts = await getOrgDepartments(orgId);

    if (parentId === "root") {
      const topDepts = orgDepts.filter((d) => d.parentId === null);
      let allowedDepts = topDepts;

      if (role !== "admin" && userDept) {
        const myDept = orgDepts.find((d) => d.id === userDept || d.id === `${orgId}_${userDept}`);
        const topDeptId = myDept?.parentId || myDept?.id || userDept;
        
        let normalizedTopDeptId = topDeptId;
        if (!topDeptId.startsWith(`${orgId}_`)) {
          normalizedTopDeptId = `${orgId}_${topDeptId}`;
        }
        allowedDepts = topDepts.filter((d) => d.id === normalizedTopDeptId);
      }

      const virtualFolders = allowedDepts.map((d) => makeVirtualFolder(d.id, d.name));

      const TEMPLATE_ROOT_FOLDERS = ["Clients", "Onboarding", "Projects", "Finance", "HR"];

      const physicalRootFiles = await useDrizzle()
        .select({
          ...fileColumns,
          isFavorite: favorites.createdAt,
        })
        .from(files)
        .leftJoin(
          favorites,
          and(eq(files.id, favorites.fileId), eq(favorites.userId, userId))
        )
        .where(
          and(
            eq(files.bucketName, "org"),
            eq(files.organizationId, orgId),
            eq(files.parentId, "root"),
            isNull(files.deletedAt),
            inArray(files.name, TEMPLATE_ROOT_FOLDERS)
          )
        );

      return {
        data: [...virtualFolders, ...physicalRootFiles],
        nextPage: null,
      };
    }

    if (parentId.startsWith("dept_")) {
      const deptId = parentId.substring(5);

      // Get sub-departments of this department
      const subDepts = orgDepts.filter((d) => d.parentId === deptId);
      let allowedSubDepts = subDepts;

      if (role !== "admin" && userDept) {
        const dbUserDept = userDept.startsWith(`${orgId}_`) ? userDept : `${orgId}_${userDept}`;
        allowedSubDepts = subDepts.filter((d) => d.id === dbUserDept);
      }

      const virtualFolders = allowedSubDepts.map((d) => makeVirtualFolder(d.id, d.name));

      // Get physical folders/files under this department folder
      filters.push(eq(files.bucketName, params.bucket));
      filters.push(isNull(files.deletedAt));

      // If Founders Team, fetch both files inside dept_founders AND legacy root files
      if (deptId === "founders" || deptId === `${orgId}_founders`) {
        filters.push(
          or(
            eq(files.parentId, parentId),
            eq(files.parentId, "root")
          )
        );
      } else {
        filters.push(eq(files.parentId, parentId));
      }

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
        .where(and(...filters))
        .$dynamic();

      dataQuery = makeSorting(dataQuery, files, queryString);
      dataQuery = makePaginate(dataQuery, queryString);

      const physicalFiles = await dataQuery;
      const allItems = [...virtualFolders, ...physicalFiles];

      return {
        data: allItems,
        nextPage: physicalFiles.length === perPage ? Number(queryString.page) + 1 : null,
      };
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

  if (params.bucket !== "org") {
    filters.push(eq(files.userId, userId));
  }
  filters.push(isNull(files.deletedAt));
  filters.push(eq(files.parentId, parentId));

  if (queryString["filters[contentType]"]) {
    filters.push(
      eq(files.contentType, queryString["filters[contentType]"] as string)
    );
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
  if (bucketName === "org" && path.startsWith("org/")) {
    const deptId = path.substring(4);
    const depts = await getOrgDepartments(orgId || "org_default");
    let dept = depts.find((d: any) => d.id === deptId);
    if (!dept) {
      const results = await useDrizzle()
        .select()
        .from(orgDepartments)
        .where(eq(orgDepartments.id, deptId));
      if (results && results.length > 0) {
        dept = results[0];
      }
    }
    if (dept) {
      return makeVirtualFolder(dept.id, dept.name);
    }
  }
  const filters = [];
  filters.push(eq(files.bucketName, bucketName));
  filters.push(eq(files.path, path));
  if (deletedAt) {
    filters.push(eq(files.deletedAt, deletedAt));
  } else {
    filters.push(isNull(files.deletedAt));
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
  let folderId = id;
  if (Array.isArray(id)) {
    folderId = id[0];
  } else if (typeof id === "object" && id !== null) {
    folderId = String(id);
  }
  if (!folderId || folderId === "root") return null;
  if (typeof folderId === "string" && folderId.startsWith("dept_")) {
    const deptId = folderId.substring(5);
    const depts = await getOrgDepartments(orgId || "org_default");
    let dept = depts.find((d: any) => d.id === deptId);
    if (!dept) {
      const results = await useDrizzle()
        .select()
        .from(orgDepartments)
        .where(eq(orgDepartments.id, deptId));
      if (results && results.length > 0) {
        dept = results[0];
      }
    }
    if (dept) {
      return makeVirtualFolder(dept.id, dept.name);
    }
  }
  const result = await useDrizzle()
    .select()
    .from(files)
    .where(eq(files.id, folderId));
  if (result && result.length > 0) {
    return result[0];
  }
  return null;
};

export const ensurePath = async (
  bucketName: string,
  fullPath: string,
  userId: string,
  isFile?: boolean
) => {
  // pathShouldStartWithBucketName(bucketName, fullPath);
  // replace leading, trailing and duplicate slashes
  fullPath = cleanPath(fullPath);
  // Check and create parent folders if they don't exist
  const pathSegments = fullPath.split("/");
  // Remove the file name (last segment)
  if (isFile) pathSegments.pop();
  // const fileName = pathSegments.pop();
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
  const { userId } = data;
  const userObj = await getUser(userId);
  const organizationId = userObj?.organizationId || "org_default";

  // let parent = await getParent(bucketName, parentId, organizationId);
  const path = cleanPath(data.fullPath);

  const file = await getFile(bucketName, path, undefined, organizationId);
  if (file) {
    return await useDrizzle()
      .update(files)
      .set({
        size: data.size,
        updatedAt: new Date(),
      })
      .where(eq(files.path, path));
  }
  let parent = await ensurePath(bucketName, path, userId, true);
  const fileType = getFileType(data.contentType);
  const preview = fileType === "image" ? path : null;
  if (preview) {
    await setFolderThumbnail(parent.id, preview);
  }

  const insertFile = {
    id: ulid() as string,
    name: path.split("/").pop() || "",
    path: path,
    type: fileType,
    size: data.size,
    contentType: data.contentType,
    dimensions: data.dimensions,
    userId: data.userId,
    organizationId,
    bucketName: bucketName,
    parentId: parent.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    preview,
  };
  const response = await useDrizzle()
    .insert(files)
    .values(insertFile)
    .returning();
  if (response && response.length > 0) {
    await updateCount(parent.id);
    return response[0];
  }
};

export const getParent = async (bucketName: string, id: string, orgId?: string) => {
  let parent = {
    path: bucketName,
    id: "root",
  };
  if (id && id !== "root") {
    const folder = await getFolder(id, orgId);
    if (
      folder &&
      folder.type === "folder" &&
      folder.bucketName === bucketName
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

export const searchFiles = async (bucketName: string, query: string) => {
  const filters = [];

  let dataQuery = useDrizzle()
    .select({
      id: files.id,
      name: files.name,
      path: files.path,
      type: files.type,
      contentType: files.contentType,
    })
    .from(files)
    .$dynamic();

  // 🔸 Filtering
  filters.push(eq(files.bucketName, bucketName));
  filters.push(isNull(files.deletedAt));
  if (query) {
    filters.push(sql`LOWER(name) LIKE LOWER(${`%${query}%`})`);
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
  const file = await getFolder(id);
  if (!file || file.bucketName !== bucketName) {
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
          const dept = DEPARTMENTS.find((d) => d.id === deptId || d.id === baseDept);
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
  let dataQuery = useDrizzle()
    .select({
      ...fileColumns,
      isFavorite: favorites.createdAt,
    })
    .from(favorites)
    .leftJoin(files, eq(favorites.fileId, files.id))
    .where(
      and(
        eq(favorites.userId, userId),
        eq(files.bucketName, params.bucket),
        isNull(files.deletedAt)
      )
    )
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

export const getPublished = async (event: any, userId: string) => {
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
  filters.push(eq(files.userId, userId));
  filters.push(eq(files.visibility, "public"));
  filters.push(isNull(files.deletedAt));

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
  filters.push(eq(files.userId, userId));
  filters.push(isNull(files.deletedAt));
  dataQuery = dataQuery.where(and(...filters));

  // 🔸 Sorting
  dataQuery = dataQuery.orderBy(desc(files.updatedAt));

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

export const setVisibility = async (bucketName: string, data: IFile) => {
  const file = await getFolder(data.id);
  if (file && file.bucketName === bucketName) {
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
  members: { email: string; role: string }[]
) => {
  for (const member of members) {
    const user = await getUserByEmail(member.email);
    if (!user) {
      throw createError({
        status: 404,
        message: `User with email "${member.email}" not found.`,
      });
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
          .set({ role: member.role })
          .where(and(eq(shared.fileId, file.id), eq(shared.userId, user.id)));
      } else {
        await useDrizzle()
          .insert(shared)
          .values({
            fileId: file.id,
            userId: user.id,
            role: member.role,
            createdAt: new Date(),
          });
      }
    }
  }
  return { success: true };
};

export const getNestedFolders = async (bucketName: string, userId: string) => {
  const currentUser = await getUser(userId);
  const role = currentUser?.role;
  const userDept = currentUser?.departmentId;

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
  const topDepts = DEPARTMENTS.filter((d) => d.parentId === null);
  let allowedDepts = topDepts;

  if (role !== "admin" && userDept) {
    const orgId = currentUser?.organizationId || "org_default";
    const baseDeptId = userDept.startsWith(`${orgId}_`) ? userDept.substring(orgId.length + 1) : userDept;
    const myDept = DEPARTMENTS.find((d) => d.id === baseDeptId);
    const topDeptId = myDept?.parentId || baseDeptId;
    allowedDepts = topDepts.filter((d) => d.id === topDeptId);
  }

  const buildDeptSubtree = (deptId: string, deptName: string): any => {
    // Find sub-departments
    const subDepts = DEPARTMENTS.filter((d) => d.parentId === deptId);
    let allowedSubDepts = subDepts;
    if (role !== "admin" && userDept) {
      const orgId = currentUser?.organizationId || "org_default";
      const baseDeptId = userDept.startsWith(`${orgId}_`) ? userDept.substring(orgId.length + 1) : userDept;
      allowedSubDepts = subDepts.filter((d) => d.id === baseDeptId);
    }

    const subDeptNodes = allowedSubDepts.map((d) => buildDeptSubtree(d.id, d.name));
    let physicalNodes = makeNested(folders, `dept_${deptId}`);

    if (deptId === "founders") {
      const rootFolders = folders.filter((f) => f.parentId === "root");
      const rootNodes = rootFolders.map((f) => ({
        id: f.id,
        path: f.path,
        label: f.name,
        icon: "lucide:folder",
        children: makeNested(folders, f.id),
      }));
      physicalNodes = [...physicalNodes, ...rootNodes];
    }

    return {
      id: `dept_${deptId}`,
      path: `org/${deptId}`,
      label: deptName,
      icon: "lucide:folder",
      children: [...subDeptNodes, ...physicalNodes],
    };
  };

  const tree = allowedDepts.map((d) => buildDeptSubtree(d.id, d.name));
  
  // Include physical root folders at the top level
  const TEMPLATE_ROOT_FOLDERS = ["Clients", "Onboarding", "Projects", "Finance", "HR"];
  const rootFolders = folders.filter((f) => f.parentId === "root" && TEMPLATE_ROOT_FOLDERS.includes(f.name));
  const rootNodes = rootFolders.map((f) => ({
    id: f.id,
    path: f.path,
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
          await moveBlob(
            item.path,
            `.trash/${bucketName}/${item.deletedAt?.toISOString()}/${item.path}`
          );
        }
      })
    );
  }

  // 2. Permanently delete items that are ALREADY in the trash
  if (alreadyTrashed.length > 0) {
    const alreadyTrashedIds = alreadyTrashed.map(item => item.id);
    await Promise.all(
      alreadyTrashed.map(async (item) => {
        if (item.type !== "folder") {
          const trashPath = `.trash/${bucketName}/${item.deletedAt?.toISOString()}/${item.path}`;
          try {
            await hubBlob().del(trashPath);
          } catch (e) {
            // ignore if already deleted
          }
        }
      })
    );
    await useDrizzle()
      .delete(files)
      .where(inArray(files.id, alreadyTrashedIds));
  }

  return { success: true, deleted: allIds.length };
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

  let dataQuery = useDrizzle()
    .select({
      ...fileColumns,
      deletedAt: files.deletedAt,
    })
    .from(files)
    .where(and(...filters))
    .$dynamic();

  // 🔸 Sorting
  dataQuery = dataQuery.orderBy(desc(files.deletedAt));

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
      approvalStatus: users.approvalStatus,
      createdAt: users.createdAt,
    })
    .from(users)
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
  template: string,
  segments: any[],
  updatedBy: string
) => {
  const existing = await getNomenclature(departmentId);
  if (existing) {
    return await useDrizzle()
      .update(nomenclatures)
      .set({ template, segments, updatedBy, updatedAt: new Date() })
      .where(eq(nomenclatures.departmentId, departmentId));
  }
  return await useDrizzle().insert(nomenclatures).values({
    departmentId,
    template,
    segments,
    updatedBy,
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

  await useDrizzle()
    .insert(folderRequests)
    .values({ ...data, parentId: pId, id, organizationId, createdAt: new Date(), updatedAt: new Date() });
  return { id };
};

export const getFolderRequests = async (organizationId: string, departmentId?: string) => {
  const filters: any[] = [eq(folderRequests.organizationId, organizationId)];
  if (departmentId) filters.push(eq(folderRequests.departmentId, departmentId));
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
  reviewNote?: string
) => {
  return await useDrizzle()
    .update(folderRequests)
    .set({ status, reviewedBy, reviewNote, updatedAt: new Date() })
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
    await moveBlob(item.path, newPath);
    await useDrizzle()
      .update(files)
      .set({
        parentId: targetParentId,
        path: newPath,
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
            preview: dbItem.type === "image" ? itemNewPath : dbItem.preview,
            updatedAt: new Date(),
          })
          .where(eq(files.id, dbItem.id));
      }

      if (dbItem.type !== "folder") {
        // Move blob
        await moveBlob(dbItem.path, itemNewPath);
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

  const pathParts = file.path.split("/");
  pathParts.pop(); // remove original filename
  const newPath = cleanPath(`${pathParts.join("/")}/${newName}`);

  // check if file already exists at target path
  const existing = await getFile(bucketName, newPath);
  if (existing) {
    throw createError({ status: 400, message: "A file with this name already exists in this folder." });
  }

  // Copy blob in storage
  await copyBlob(file.path, newPath);

  // Insert new record in DB
  const newId = ulid() as string;
  const insertFile = {
    id: newId,
    name: newName,
    path: newPath,
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
  };

  const response = await useDrizzle()
    .insert(files)
    .values(insertFile)
    .returning();

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
    await moveBlob(item.path, newPath);
    await useDrizzle()
      .update(files)
      .set({
        name: newName,
        path: newPath,
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
            preview: dbItem.type === "image" ? itemNewPath : dbItem.preview,
            updatedAt: new Date(),
          })
          .where(eq(files.id, dbItem.id));
      }

      if (dbItem.type !== "folder") {
        await moveBlob(dbItem.path, itemNewPath);
      }
    }
  }
  return { success: true };
};

// ─── Organization & Permission Helpers ────────────────────────────────────────

export const getOrgDepartments = async (organizationId: string) => {
  const result = await useDrizzle()
    .select()
    .from(orgDepartments)
    .where(eq(orgDepartments.organizationId, organizationId));
  
  if (!result || result.length === 0) {
    const defaultDepts = [
      { id: "hr", name: "HR", parentId: null },
      { id: "finance", name: "Finance", parentId: null },
      { id: "marketing", name: "Marketing", parentId: null },
      { id: "creative", name: "Creative Team", parentId: null },
      { id: "video", name: "Video Team", parentId: "creative" },
      { id: "graphic", name: "Graphic Team", parentId: "creative" },
      { id: "it", name: "IT Team", parentId: null },
      { id: "business_dev", name: "Business Development Team", parentId: null },
      { id: "client_servicing", name: "Client Servicing", parentId: null },
      { id: "founders", name: "Founders Team", parentId: null },
    ];

    const db = useDrizzle();
    const inserted = [];
    for (const d of defaultDepts) {
      const dbId = `${organizationId}_${d.id}`;
      const dbParentId = d.parentId ? `${organizationId}_${d.parentId}` : null;
      const deptRow = {
        id: dbId,
        organizationId,
        name: d.name,
        parentId: dbParentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(orgDepartments).values(deptRow);
      inserted.push(deptRow);
    }
    return inserted;
  }
  return result;
};

export const getOrgPermissions = async (organizationId: string) => {
  const result = await useDrizzle()
    .select()
    .from(orgPermissions)
    .where(eq(orgPermissions.organizationId, organizationId));

  if (!result || result.length === 0) {
    const roles = ["dept_head", "team_lead", "team_member", "intern"];
    const db = useDrizzle();
    const inserted = [];
    for (const r of roles) {
      const permRow = {
        id: ulid() as string,
        organizationId,
        departmentId: "global",
        role: r,
        maxCount: null,
        canUpload: true,
        canDownload: true,
        canDelete: r === "dept_head" || r === "team_lead",
        canCreateFolder: r === "dept_head" || r === "team_lead",
        canApproveUsers: r === "dept_head",
        canEditNomenclature: r === "dept_head",
        canShare: r === "dept_head" || r === "team_lead",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(orgPermissions).values(permRow);
      inserted.push(permRow);
    }
    return inserted;
  }
  return result;
};

export const createOrganization = async (name: string, orgType: "s3" | "gdrive" = "s3") => {
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

  // Seed departments and permissions immediately
  await getOrgDepartments(orgId);
  await getOrgPermissions(orgId);

  return orgId;
};

export const updateOrganizationSettings = async (
  organizationId: string,
  name: string,
  departmentsList: any[],
  permissionsList: any[]
) => {
  const db = useDrizzle();
  
  // 1. Update organization name
  await db.update(organizations)
    .set({ name, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));

  // 2. Save departments hierarchy
  await db.delete(orgDepartments).where(eq(orgDepartments.organizationId, organizationId));
  for (const d of departmentsList) {
    await db.insert(orgDepartments).values({
      id: d.id,
      organizationId,
      name: d.name,
      parentId: d.parentId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // 3. Update / Upsert permissions (includes global and department overrides)
  // First clear any permissions that belong to a deleted department
  const validDeptIds = departmentsList.map((d) => d.id);
  await db.delete(orgPermissions)
    .where(and(
      eq(orgPermissions.organizationId, organizationId),
      ne(orgPermissions.departmentId, "global"),
      notInArray(orgPermissions.departmentId, validDeptIds.length ? validDeptIds : ["dummy"])
    ));

  for (const perm of permissionsList) {
    const deptId = perm.departmentId || "global";
    const existing = await db.select()
      .from(orgPermissions)
      .where(and(
        eq(orgPermissions.organizationId, organizationId),
        eq(orgPermissions.departmentId, deptId),
        eq(orgPermissions.role, perm.role)
      ));

    if (existing && existing.length > 0) {
      await db.update(orgPermissions)
        .set({
          canUpload: perm.canUpload,
          canDownload: perm.canDownload,
          canDelete: perm.canDelete,
          canCreateFolder: perm.canCreateFolder,
          canApproveUsers: perm.canApproveUsers,
          canEditNomenclature: perm.canEditNomenclature,
          canShare: perm.canShare,
          maxCount: perm.maxCount !== undefined && perm.maxCount !== "" ? Number(perm.maxCount) : null,
          updatedAt: new Date(),
        })
        .where(eq(orgPermissions.id, existing[0].id));
    } else {
      await db.insert(orgPermissions).values({
        id: ulid() as string,
        organizationId,
        departmentId: deptId,
        role: perm.role,
        maxCount: perm.maxCount !== undefined && perm.maxCount !== "" ? Number(perm.maxCount) : null,
        canUpload: perm.canUpload,
        canDownload: perm.canDownload,
        canDelete: perm.canDelete,
        canCreateFolder: perm.canCreateFolder,
        canApproveUsers: perm.canApproveUsers,
        canEditNomenclature: perm.canEditNomenclature,
        canShare: perm.canShare,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return { success: true };
};

export const getOrgFeatures = async (orgId: string) => {
  const db = useDrizzle();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return org?.features ?? {
    nomenclature: true,
    hierarchy: true,
    userPermissions: true,
    templateFolders: true,
  };
};
