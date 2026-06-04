import { getFolder, getBreadcrumb, getOrgDepartments } from "~~/server/utils/db";
import { verifyBucket } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { user } = await verifyBucket(event);
  const params = getRouterParams(event);
  const orgId = user?.organizationId || "org_default";

  try {
    if (params.id.startsWith("dept_")) {
      const deptId = params.id.substring(5);
      const depts = await getOrgDepartments(orgId);
      const dept = depts.find((d) => d.id === deptId);
      if (dept) {
        const breadcrumb = [];
        let currentDept = dept;
        while (currentDept) {
          breadcrumb.unshift({
            id: `dept_${currentDept.id}`,
            name: currentDept.name,
            visibility: "private",
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
          path: `org/${deptId}`,
          breadcrumb,
        };
      }
    }

    const folder = await getFolder(params.id, orgId);
    if (folder) {
      const breadcrumb = await getBreadcrumb(params.bucket, folder.path);
      return {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        breadcrumb,
      };
    }
    return null;
  } catch (err) {
    return null;
  }
});
