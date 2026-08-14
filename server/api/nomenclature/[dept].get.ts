import { getNomenclature, getOrgDepartments } from "~~/server/utils/db";
import { getApprovedUser } from "~~/server/utils/permission";
import { DEPARTMENT_MAP } from "~~/shared/constants/departments";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);
  const { dept } = getRouterParams(event);

  const orgId = (user as any)?.organizationId || "org_default";

  // Check if it is a valid static department OR a valid custom department in the organization
  const baseDept = dept.split("_").pop() || "";
  const isStaticValid = !!DEPARTMENT_MAP[baseDept] || !!DEPARTMENT_MAP[dept];

  let isValid = isStaticValid;
  if (!isValid) {
    const orgDepts = await getOrgDepartments(orgId);
    isValid = orgDepts.some(d => d.id === dept || d.id === `${orgId}_${dept}`);
  }

  if (!isValid) {
    throw createError({ status: 400, message: "Invalid department." });
  }

  const nomenclature = await getNomenclature(dept) as any;

  // Return default if none set
  if (!nomenclature?.segments?.length) {
    return {
      ...nomenclature,
      departmentId: dept,
      template: "Brand_Campaign_Channel_Asset_Format_Version_Date",
      allowedExtensions: null,
      folderTemplate: nomenclature?.folderTemplate ?? null,
      folderSegments: Array.isArray(nomenclature?.folderSegments) ? nomenclature.folderSegments : [],
      segments: [
        { key: "Brand", label: "Brand", allowedValues: [] },
        { key: "Campaign", label: "Campaign", allowedValues: [] },
        { key: "Channel", label: "Channel", allowedValues: [] },
        { key: "Asset", label: "Asset Type", allowedValues: [] },
        { key: "Format", label: "Format", allowedValues: [] },
        { key: "Version", label: "Version", allowedValues: [] },
        { key: "Date", label: "Date", allowedValues: [] },
      ],
    };
  }
  return {
    ...nomenclature,
    folderTemplate: nomenclature.folderTemplate ?? null,
    folderSegments: Array.isArray(nomenclature.folderSegments) ? nomenclature.folderSegments : [],
  };
});

