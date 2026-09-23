import type { UserRole } from "~~/shared/constants/roles";
import { hasMinRole, getRoleLabel } from "~~/shared/constants/roles";
import { getDepartmentName } from "~~/shared/constants/departments";

export function useRole() {
  const { user, loggedIn } = useUserSession();

  const role = computed<UserRole | null>(
    () => (user.value as any)?.role ?? null
  );
  const departmentId = computed<string | null>(
    () => (user.value as any)?.departmentId ?? null
  );
  const approvalStatus = computed<string | null>(
    () => (user.value as any)?.approvalStatus ?? null
  );
  const orgType = computed<string>(
    () => (user.value as any)?.orgType ?? "s3"
  );


  const isApproved = computed(() => approvalStatus.value === "active");
  const isPending = computed(() => approvalStatus.value === "pending");
  const needsProfile = computed(() => approvalStatus.value === "needs_profile");

  const isAdmin = computed(() => role.value === "admin");
  const isDeptHead = computed(() => role.value === "dept_head");
  const isTeamLead = computed(() => role.value === "team_lead");
  const isTeamMember = computed(() => role.value === "team_member");
  const isGuest = computed(() => role.value === "guest" || role.value === "intern");
  const isIntern = isGuest;

  const userPermissions = computed(() => (user.value as any)?.permissions || {});

  const canView = computed(() =>
    isApproved.value && (userPermissions.value.canView !== false)
  );
  const canUpload = computed(() =>
    isApproved.value && (userPermissions.value.canUpload !== false)
  );
  const canDownload = computed(() =>
    isApproved.value && (userPermissions.value.canDownload !== false)
  );
  const canCreateFolder = computed(() =>
    isApproved.value && (userPermissions.value.canCreateFolder ?? hasMinRole(role.value || "guest", "team_lead"))
  );
  const canApproveUsers = computed(() =>
    isApproved.value && (userPermissions.value.canApproveUsers ?? (role.value === "admin" || role.value === "dept_head"))
  );
  const canEditNomenclature = computed(() =>
    isApproved.value && (userPermissions.value.canEditNomenclature ?? (role.value === "admin" || role.value === "dept_head"))
  );
  const canManageDepts = computed(() => isAdmin.value);
  // Team leads submit requests, dept heads create directly
  const canCreateFolderDirectly = computed(() =>
    isApproved.value && !!role.value && hasMinRole(role.value, "dept_head")
  );

  const canShare = computed(() =>
    isApproved.value && (userPermissions.value.canShare ?? hasMinRole(role.value || "guest", "team_lead"))
  );
  const canDelete = computed(() =>
    isApproved.value && (userPermissions.value.canDelete ?? hasMinRole(role.value || "guest", "team_lead"))
  );
  const canRename = computed(() =>
    isApproved.value && (userPermissions.value.canRename ?? hasMinRole(role.value || "guest", "team_lead"))
  );
  const canEditMetadata = computed(() =>
    isApproved.value && (userPermissions.value.canEditMetadata ?? false)
  );
  const canUseRag = computed(() =>
    isAdmin.value || (isApproved.value && (userPermissions.value.canUseRag ?? true))
  );

  const roleLabel = computed(() =>
    role.value ? getRoleLabel(role.value) : ""
  );
  const departmentLabel = computed(() =>
    departmentId.value ? getDepartmentName(departmentId.value) : ""
  );

  return {
    role,
    departmentId,
    approvalStatus,
    isApproved,
    isPending,
    needsProfile,
    isAdmin,
    isDeptHead,
    isTeamLead,
    isTeamMember,
    isGuest,
    isIntern,
    canView,
    canUpload,
    canDownload,
    canDelete,
    canRename,
    canEditMetadata,
    canUseRag,
    canShare,
    canCreateFolder,
    canCreateFolderDirectly,
    canApproveUsers,
    canEditNomenclature,
    canManageDepts,
    roleLabel,
    departmentLabel,
    orgType,
  };
};
