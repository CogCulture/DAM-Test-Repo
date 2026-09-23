import { allowedExtensions, fileIcons, fileTypes } from "./constants";

export const cleanPath = (path: string) => {
  // replace leading, trailing and duplicate slashes
  return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
};

export const pathShouldStartWithBucketName = (
  bucketName: string,
  path: string
) => {
  if (!path.startsWith(bucketName + "/")) {
    return path;
  } else {
    throw createError({
      status: 400,
      message: "Path Missing Bucket Name",
    });
  }
};

export const formatTrashTimestamp = (d: Date | string | number | null | undefined): string => {
  if (!d) return String(Date.now());
  const date = new Date(d);
  // Replace ':' and '.' which are forbidden in Windows file paths
  return date.toISOString().replace(/[:.]/g, "-");
};

export const getPreviewUrl = (path: string, deletedAt?: string) => {
  return (
    "/preview/" +
    encodeURI(path) +
    (deletedAt ? `?trashed=${formatTrashTimestamp(deletedAt)}` : "")
  );
};

export const encodeURI = (path: string) => {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
};

export const fileIcon = (type: string): string => {
  const simpleType = fileTypes[type] || type;
  // @ts-ignore
  return fileIcons[simpleType] || fileIcons["default"];
};

export const getFolderPath = (path: string) => {
  const pathParts = path.split("/");

  // Remove the last segment (filename)
  pathParts.pop();

  // Join the remaining path segments
  return pathParts.join("/");
};

export const getContentType = (path: string) => {
  const extension = path.split(".").pop()?.toLowerCase();
  // @ts-ignore
  return allowedExtensions[extension] || "application/octet-stream";
};

export const getVisibility = (
  breadcrumb: FolderBreadcrumb[],
  visibility: string
) => {
  if (visibility && visibility !== "inherit") {
    return visibility;
  }
  if (!breadcrumb || breadcrumb.length === 0) {
    return "private";
  }
  const reversedBreadcrumb = [...breadcrumb].reverse();
  for (const folder of reversedBreadcrumb) {
    if (folder.visibility && folder.visibility !== "inherit") {
      return folder.visibility;
    }
  }
  return "private";
};

export const getFileType = (contentType: string) => {
  return fileTypes[contentType] || contentType.split("/")[0];
};
