import {
  validateFolderNomenclature,
  validateFolderPathNomenclature,
} from "~~/shared/utils/file-nomenclature";
import { getGDriveRules, getNomenclatureForDept, getOrgFeatures } from "~~/server/utils/db";

type FolderPolicyUser = {
  organizationId?: string | null;
  departmentId?: string | null;
};

const loadFolderSegments = async (
  user: FolderPolicyUser,
  departmentId?: string | null,
) => {
  const organizationId = user.organizationId || "org_default";
  const [features, rules, nomenclature] = await Promise.all([
    getOrgFeatures(organizationId),
    getGDriveRules(organizationId),
    getNomenclatureForDept(organizationId, departmentId ?? user.departmentId),
  ]);
  if (features.nomenclature === false || !rules.enforceNomenclature) return [];
  return Array.isArray(nomenclature?.folderSegments) ? nomenclature.folderSegments : [];
};

export const requireValidFolderName = async ({
  user,
  folderName,
  departmentId,
}: {
  user: FolderPolicyUser;
  folderName: string;
  departmentId?: string | null;
}) => {
  const folderSegments = await loadFolderSegments(user, departmentId);
  if (!folderSegments.length) return;

  const result = validateFolderNomenclature(folderName.trim(), folderSegments);
  if (!result.valid) {
    throw createError({ status: 400, message: result.message || "Invalid folder name." });
  }
};

export const requireValidFolderPath = async ({
  user,
  relativePath,
  departmentId,
}: {
  user: FolderPolicyUser;
  relativePath: string;
  departmentId?: string | null;
}) => {
  const folderSegments = await loadFolderSegments(user, departmentId);
  if (!folderSegments.length || !relativePath) return;
  const result = validateFolderPathNomenclature(relativePath, folderSegments);
  if (!result.valid) {
    throw createError({ status: 400, message: result.message || "Invalid folder path." });
  }
};

export const requireValidFolderPaths = async ({
  user,
  paths,
  departmentId,
}: {
  user: FolderPolicyUser;
  paths: string[];
  departmentId?: string | null;
}) => {
  const folderSegments = await loadFolderSegments(user, departmentId);
  if (!folderSegments.length) return;
  const violations: Array<{ path: string; message: string }> = [];
  for (const path of paths) {
    const result = validateFolderPathNomenclature(path, folderSegments);
    if (!result.valid) {
      violations.push({ path, message: result.message || "Invalid folder path." });
    }
  }
  if (violations.length) {
    throw createError({
      status: 400,
      message: violations[0]?.message || "One or more folder names do not follow the configured nomenclature.",
      data: { violations },
    });
  }
};
