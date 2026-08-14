import type { UserRole } from "~~/shared/constants/roles";

type FolderCreationMode = "denied" | "request" | "direct";

export const resolveFolderCreationMode = ({
  role,
  canCreateFolder,
}: {
  role?: UserRole | string | null;
  canCreateFolder: boolean;
}): FolderCreationMode => {
  if (!canCreateFolder) return "denied";
  return role === "admin" || role === "dept_head" ? "direct" : "request";
};

export const canReviewFolderRequest = (
  reviewer: { role?: UserRole | string | null; departmentId?: string | null },
  requestDepartmentId?: string | null,
) => reviewer.role === "admin"
  || (reviewer.role === "dept_head"
    && Boolean(reviewer.departmentId)
    && reviewer.departmentId === requestDepartmentId);

export const isDuplicatePendingFolderRequest = (
  requestedName: string,
  pendingNames: string[],
) => pendingNames.some((name) => name.localeCompare(requestedName, undefined, { sensitivity: "accent" }) === 0);

export const canTransitionFolderRequest = (
  currentStatus: string,
  action: "approve" | "reject",
) => currentStatus === "pending" && (action === "approve" || action === "reject");
