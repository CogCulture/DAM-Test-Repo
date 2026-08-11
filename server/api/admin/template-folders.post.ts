import { ensurePath, getBucket, getFile, getOrgFeatures } from "~~/server/utils/db";
import { getGDriveConnection, getGDriveAccessToken, ensureGDrivePath } from "~~/server/utils/gdrive";
import { ORG_BUCKET_NAME } from "~~/shared/constants/roles";

// Sub-folders created inside every client folder
const CLIENT_SUBFOLDERS = [
  "Brand Assets",
  "Corporate",
  "KT",
  "Monthly Reports",
  "Projects",
  "SM Calendars",
];

// Folder structure for each template
const TEMPLATES: Record<string, { root: string; subFolders?: string[] }> = {
  clients: {
    root: "Clients",
  },
  onboarding: {
    root: "Onboarding",
    subFolders: [
      "Company Standard Templates",
      "Cultural Integration",
      "Welcome Materials",
    ],
  },
  projects: {
    root: "Projects",
    subFolders: ["Active", "Completed", "Archives"],
  },
  finance: {
    root: "Finance",
    subFolders: ["Invoices", "Reports", "Budgets"],
  },
  hr: {
    root: "HR",
    subFolders: ["Policies", "Hiring", "Performance Reviews"],
  },
};

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  // Admin-only endpoint
  if ((user as any)?.role !== "admin") {
    throw createError({
      status: 403,
      message: "Only administrators can create template folders.",
    });
  }

  // Feature flag check
  const orgId = (user as any)?.organizationId || "org_default";
  const features = await getOrgFeatures(orgId);
  if (!features.templateFolders) {
    throw createError({ status: 403, message: "Template Folders feature is not enabled for your organization." });
  }

  const userId = (user as any).id as string;
  const orgType = (user as any).orgType || "s3";

  let gdriveConnection = null;
  let gdriveToken = null;
  if (orgType === "gdrive") {
    gdriveConnection = await getGDriveConnection(userId);
    if (gdriveConnection && gdriveConnection.status === "approved") {
      gdriveToken = await getGDriveAccessToken(userId);
    }
  }

  const {
    template,
    clientName,
  } = await readBody<{
    template: string;
    clientName?: string;
  }>(event);

  if (!template) {
    throw createError({ status: 400, message: "Template name is required." });
  }

  const bucket = await getBucket(ORG_BUCKET_NAME);
  if (!bucket) {
    throw createError({
      status: 404,
      message: "Organization bucket not found. Please contact your admin.",
    });
  }

  const created: string[] = [];

  // Helper to convert strings to PascalCase/camelCase (e.g. "Brand Assets" -> "BrandAssets")
  const toCamelCase = (str: string) => {
    return str
      .split(/[\s_-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
  };

  // Handle adding a new client under Clients/
  if (template === "clients_add_client") {
    if (!clientName?.trim()) {
      throw createError({ status: 400, message: "Client name is required." });
    }
    const sanitized = clientName.trim();
    const clientPrefix = toCamelCase(sanitized);

    for (const sub of CLIENT_SUBFOLDERS) {
      const subCamel = toCamelCase(sub);
      const folderPath = `${ORG_BUCKET_NAME}/Clients/${sanitized}/${clientPrefix}_${subCamel}`;
      const result = await ensurePath(ORG_BUCKET_NAME, folderPath, userId, false);
      created.push(result.id);
      if (gdriveToken && gdriveConnection) {
        const gdrivePath = `Clients/${sanitized}/${clientPrefix}_${subCamel}`;
        await ensureGDrivePath(gdriveToken, gdriveConnection.folderId, gdrivePath);
      }
    }
    return { success: true, created, clientName: sanitized };
  }

  // Handle named templates
  const tmpl = TEMPLATES[template];
  if (!tmpl) {
    throw createError({ status: 400, message: `Unknown template: ${template}` });
  }

  // Create root folder
  const rootPath = `${ORG_BUCKET_NAME}/${tmpl.root}`;
  const rootResult = await ensurePath(ORG_BUCKET_NAME, rootPath, userId, false);
  created.push(rootResult.id);
  if (gdriveToken && gdriveConnection) {
    await ensureGDrivePath(gdriveToken, gdriveConnection.folderId, tmpl.root);
  }

  // Create sub-folders
  if (tmpl.subFolders) {
    for (const sub of tmpl.subFolders) {
      const subPath = `${ORG_BUCKET_NAME}/${tmpl.root}/${sub}`;
      const subResult = await ensurePath(ORG_BUCKET_NAME, subPath, userId, false);
      created.push(subResult.id);
      if (gdriveToken && gdriveConnection) {
        await ensureGDrivePath(gdriveToken, gdriveConnection.folderId, `${tmpl.root}/${sub}`);
      }
    }
  }

  return { success: true, created, rootFolder: tmpl.root };
});
