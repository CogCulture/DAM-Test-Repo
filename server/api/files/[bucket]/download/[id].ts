import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { getFolder, getItemById } from "~~/server/utils/db";
import { localBlob } from "~~/server/utils/localBlob";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canDownload");
  const { id } = await getRouterParams(event);

  const query = getQuery(event);
  const isInline = query.inline === "true";

  if (id) {
    // @ts-ignore
    const item = (await getItemById(id, user.organizationId)) || (await getFolder(id, user.organizationId));
    if (item && (item.bucketName === bucket.name || item.bucketName === "org")) {
      await requireFileDepartmentAccess(user, item.id);
      if (isInline) {
        setHeader(
          event,
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(item.name)}"`
        );
        if (item.contentType) {
          setHeader(event, "Content-Type", item.contentType);
        }
      } else {
        // Set Content-Disposition to indicate this should be downloaded
        setHeader(
          event,
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(item.name)}"`
        );
      }

      // Disable caching
      setHeader(event, "Cache-Control", "no-cache, no-store, must-revalidate");
      setHeader(event, "Pragma", "no-cache");
      setHeader(event, "Expires", "0");

      //   setHeader(event, "Content-Security-Policy", "default-src 'none';");
      return localBlob().serve(event, item.storagePath || item.path);
    }
  } else {
    throw createError({
      message: "Invalid request",
      status: 400,
    });
  }
});
