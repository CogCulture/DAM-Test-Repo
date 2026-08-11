export type UploadStorageTarget = "local" | "gdrive";

export const resolveUploadStorageTarget = ({
  orgType,
}: {
  orgType?: string | null;
}): UploadStorageTarget => orgType === "gdrive" ? "gdrive" : "local";

export const isUploadRouteAllowed = ({
  orgType,
  requestedTarget,
}: {
  orgType?: string | null;
  requestedTarget: UploadStorageTarget;
}): boolean => resolveUploadStorageTarget({ orgType }) === requestedTarget;

export const resolveDriveRouteFolderId = ({
  idParam,
  organizationId,
}: {
  idParam?: string | string[] | null;
  organizationId?: string | null;
}): string => {
  const segments = Array.isArray(idParam)
    ? idParam.filter(Boolean)
    : idParam
      ? [idParam]
      : [];
  const routeId = segments.join("/");

  if (!routeId || routeId === organizationId) return "root";
  return routeId;
};
