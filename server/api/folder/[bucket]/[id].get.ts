import { getFolder, getBreadcrumb, getOrgDepartments } from "~~/server/utils/db";
import { verifyBucket } from "~~/server/utils/permission";
import {
  getGDriveAccessToken,
  getGDriveConnection,
  getGDriveItem,
  type GDriveItem,
} from "~~/server/utils/gdrive";
import { users } from "~~/server/database/schema";
import { eq, and } from "drizzle-orm";
import { useDrizzle } from "~~/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const { user } = await verifyBucket(event, "canView");
  const params = getRouterParams(event);
  const orgId = user?.organizationId || "org_default";

  if (!params.id) return null;

  try {
    // 1. Check departments (supports "dept_123", raw id "123", or gdriveFolderId)
    const depts = await getOrgDepartments(orgId);
    const rawDeptId = params.id.startsWith("dept_") ? params.id.substring(5) : params.id;
    const dept = depts.find(
      (d) => d.id === rawDeptId || d.id === params.id || d.gdriveFolderId === params.id
    );

    if (dept) {
      const breadcrumb = [];
      let currentDept: any = dept;
      while (currentDept) {
        breadcrumb.unshift({
          id: `dept_${currentDept.id}`,
          name: currentDept.name,
          visibility: "private" as const,
        });
        if (currentDept.parentId) {
          const parent = depts.find((d) => d.id === currentDept.parentId);
          if (parent) {
            currentDept = parent;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      return {
        id: params.id,
        name: dept.name,
        path: `org/${dept.id}`,
        breadcrumb,
      };
    }

    // 2. Check local SQLite folders
    const localFolder = await getFolder(params.id, orgId);
    if (localFolder && localFolder.type === "folder") {
      let breadcrumb = await getBreadcrumb(params.bucket, localFolder.path);

      // If path query yielded no breadcrumbs but parentId exists, traverse parentId
      if (
        (!breadcrumb || breadcrumb.length === 0) &&
        localFolder.parentId &&
        localFolder.parentId !== "root"
      ) {
        let currId: string | null = localFolder.parentId;
        const chain: any[] = [];
        while (currId && currId !== "root" && chain.length < 15) {
          const parentFolder = await getFolder(currId, orgId);
          if (!parentFolder) break;
          chain.unshift({
            id: parentFolder.id,
            name: parentFolder.name,
            visibility: parentFolder.visibility,
          });
          currId = parentFolder.parentId || null;
        }
        breadcrumb = chain;
      }

      // Ensure folder itself is in breadcrumb
      if (!breadcrumb.some((b: any) => b.id === localFolder.id)) {
        breadcrumb.push({
          id: localFolder.id,
          name: localFolder.name,
          visibility: localFolder.visibility || "inherit",
        });
      }

      return {
        id: localFolder.id,
        name: localFolder.name,
        path: localFolder.path,
        breadcrumb,
      };
    }

    // 3. Check Google Drive folder hierarchy if org uses Google Drive
    let adminUserId = user.id;
    if (user.role !== "admin" && orgId) {
      const [orgAdmin] = await useDrizzle()
        .select()
        .from(users)
        .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));
      if (orgAdmin) {
        adminUserId = orgAdmin.id;
      }
    }

    const connection = await getGDriveConnection(adminUserId);
    if (connection && connection.status === "approved") {
      try {
        const token = await getGDriveAccessToken(adminUserId);
        const rootFolderId = connection.folderId;
        const currentItem = await getGDriveItem(token, params.id);

        if (currentItem && currentItem.name) {
          const chain: Array<{ id: string; name: string; visibility: "inherit" }> = [];
          let curr: GDriveItem | null = currentItem;
          const visited = new Set<string>();

          while (curr && curr.id && !visited.has(curr.id) && chain.length < 20) {
            visited.add(curr.id);
            chain.unshift({
              id: curr.id,
              name: curr.name,
              visibility: "inherit",
            });

            if (curr.id === rootFolderId || !curr.parents || curr.parents.length === 0) {
              break;
            }
            const parentId = curr.parents[0];
            if (!parentId || parentId === rootFolderId) {
              break;
            }
            try {
              curr = await getGDriveItem(token, parentId);
            } catch {
              break;
            }
          }

          return {
            id: currentItem.id,
            name: currentItem.name,
            path: chain.map((c) => c.name).join("/"),
            breadcrumb: chain,
          };
        }
      } catch (gdriveErr) {
        console.warn("GDrive folder lookup notice for:", params.id, gdriveErr);
      }
    }

    // 4. Fallback if localFolder exists
    if (localFolder) {
      return {
        id: localFolder.id,
        name: localFolder.name,
        path: localFolder.path,
        breadcrumb: [{ id: localFolder.id, name: localFolder.name, visibility: "inherit" }],
      };
    }

    return null;
  } catch (err) {
    console.error("Error in folder endpoint:", err);
    return null;
  }
});
