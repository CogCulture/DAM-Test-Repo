import { getFiles, getFolder } from "~~/server/utils/db";
import { verifyBucket } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const { user } = await verifyBucket(event);
  const { bucket, id } = getRouterParams(event);
  let breadcrumb: FolderBreadcrumb[] = [];
  if (id !== "root") {
    // @ts-ignore
    const folder = await getFolder(id, user.organizationId);
    if (folder && folder.path) {
      breadcrumb = await getBreadcrumb(bucket, folder.path);
    }
  }
  //@ts-ignore
  const files = await getFiles(event, user.id);
  const data = files.data.map((file) => ({
    ...file,
    visibility: getVisibility(breadcrumb, file.visibility),
  }));
  return { data, nextPage: files.nextPage };
});
