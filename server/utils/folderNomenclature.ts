import { validateFolderNomenclature } from "~~/shared/utils/file-nomenclature";
import { getGDriveRules, getNomenclatureForDept, getOrgFeatures } from "~~/server/utils/db";

type FolderPolicyUser = {
  organizationId?: string | null;
  departmentId?: string | null;
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
  const organizationId = user.organizationId || "org_default";
  const [features, rules, nomenclature] = await Promise.all([
    getOrgFeatures(organizationId),
    getGDriveRules(organizationId),
    getNomenclatureForDept(organizationId, departmentId ?? user.departmentId),
  ]);
  const folderSegments = Array.isArray(nomenclature?.folderSegments)
    ? nomenclature.folderSegments
    : [];

  if (features.nomenclature === false || !rules.enforceNomenclature || !folderSegments.length) {
    return;
  }

  const result = validateFolderNomenclature(folderName.trim(), folderSegments);
  if (!result.valid) {
    throw createError({ status: 400, message: result.message || "Invalid folder name." });
  }
};
