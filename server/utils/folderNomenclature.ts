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

  // Feature disabled or enforcement not toggled on — no restriction
  if (features.nomenclature === false || !rules.enforceNomenclature) return [];

  // Prefer explicit folderSegments if configured.
  // Fall back to file segments so that the SAME {Dept}_{Campaign} pattern
  // enforces both folder names and file names without extra configuration.
  const hasExplicitFolderSegs =
    Array.isArray(nomenclature?.folderSegments) &&
    (nomenclature.folderSegments as any[]).length > 0;

  if (hasExplicitFolderSegs) {
    return nomenclature!.folderSegments as any[];
  }

  // Fall back to file-naming segments
  return Array.isArray(nomenclature?.segments)
    ? (nomenclature!.segments as any[])
    : [];
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
