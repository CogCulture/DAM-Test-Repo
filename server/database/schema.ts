import {
  pgTable,
  text,
  integer,
  bigint,
  bigserial,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

const autoIncrement = bigserial("id", { mode: "number" }).primaryKey();
const createdAt = timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull();
const deletedAt = timestamp("deleted_at", { withTimezone: true, mode: "date" });

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  // 'active' | 'suspended'
  status: text("status").default("active").notNull(),
  // 's3' | 'gdrive' | 'byos'
  orgType: text("org_type").default("s3").notNull(),
  setupComplete: boolean("setup_complete").default(false).notNull(),
  // JSON: { nomenclature: bool, hierarchy: bool, userPermissions: bool, templateFolders: bool }
  features: jsonb("features").$type<{
    nomenclature: boolean;
    hierarchy: boolean;
    userPermissions: boolean;
    templateFolders: boolean;
  }>(),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export const orgDepartments = pgTable(
  "org_departments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    parentId: text("parent_id"), // hierarchy self-reference
    folderId: text("folder_id"), // physical folder id mapping
    gdriveFolderId: text("gdrive_folder_id"), // links each DB dept to its real GDrive folder ID
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    index("idx_org_depts_org").on(t.organizationId),
  ]
);

export const deptInvites = pgTable("dept_invites", {
  id: text("id").primaryKey(),              // ULID
  organizationId: text("organization_id").notNull(),
  departmentId: text("department_id").notNull(),
  role: text("role").default("team_member").notNull(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),  // random UUID for the invite link
  status: text("status").default("pending").notNull(), // pending | accepted | expired
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: createdAt,
});

export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  organizationId: text("organization_id").notNull(),
  departmentId: text("department_id").notNull(),
  canView: boolean("can_view"),
  canUpload: boolean("can_upload"),        // null = use role default
  canDownload: boolean("can_download"),
  canDelete: boolean("can_delete"),
  canCreateFolder: boolean("can_create_folder"),
  canShare: boolean("can_share"),
  canRename: boolean("can_rename"),
  canEditMetadata: boolean("can_edit_metadata"),
  canUseRag: boolean("can_use_rag"),
  allDepartmentAccess: boolean("all_department_access").default(false).notNull(),
  updatedAt: updatedAt,
});

export const userDepartmentAccess = pgTable(
  "user_department_access",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    departmentId: text("department_id").notNull(),
    createdAt: createdAt,
  },
  (t) => [
    unique().on(t.userId, t.departmentId),
    index("idx_user_department_access_user").on(t.userId),
    index("idx_user_department_access_org").on(t.organizationId),
  ],
);

export const userOrganizations = pgTable(
  "user_organizations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    role: text("role").default("team_member").notNull(),
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    unique().on(t.userId, t.organizationId),
    index("idx_user_orgs_user").on(t.userId),
    index("idx_user_orgs_org").on(t.organizationId),
  ]
);

export const permissionAuditLogs = pgTable(
  "permission_audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    targetUserId: text("target_user_id"),
    targetRole: text("target_role"),
    departmentId: text("department_id"),
    changes: jsonb("changes").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt,
  },
  (t) => [
    index("idx_permission_audit_org").on(t.organizationId),
    index("idx_permission_audit_target").on(t.targetUserId),
  ],
);

export const pipelineAuditLogs = pgTable(
  "pipeline_audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    departmentId: text("department_id"),
    fileId: text("file_id").notNull(),
    eventType: text("event_type").notNull(),
    stage: text("stage").notNull(),
    status: text("status").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: createdAt,
  },
  (t) => [
    index("idx_pipeline_audit_org").on(t.organizationId),
    index("idx_pipeline_audit_file").on(t.fileId),
    index("idx_pipeline_audit_stage").on(t.stage),
  ],
);

export const orgPermissions = pgTable(
  "org_permissions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    departmentId: text("department_id").default("global").notNull(), // 'global' or orgDepartments.id
    role: text("role").notNull(),
    maxCount: integer("max_count"), // nullable limit of users for this position in department
    canView: boolean("can_view").default(true).notNull(),
    canUpload: boolean("can_upload").default(true).notNull(),
    canDownload: boolean("can_download").default(true).notNull(),
    canDelete: boolean("can_delete").default(false).notNull(),
    canCreateFolder: boolean("can_create_folder").default(false).notNull(),
    canApproveUsers: boolean("can_approve_users").default(false).notNull(),
    canEditNomenclature: boolean("can_edit_nomenclature").default(false).notNull(),
    canShare: boolean("can_share").default(false).notNull(),
    canRename: boolean("can_rename").default(false).notNull(),
    canEditMetadata: boolean("can_edit_metadata").default(false).notNull(),
    canUseRag: boolean("can_use_rag").default(false).notNull(),
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    unique().on(t.organizationId, t.departmentId, t.role),
  ]
);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  avatar: text("avatar"),
  country: text("country"),
  // 'active' | 'pending' | 'suspended'
  status: text("status").default("active").notNull(),
  provider: text("provider"),
  // RBAC fields
  role: text("role").default("team_member").notNull(), // founder | dept_head | team_lead | team_member | intern
  departmentId: text("department_id"), // matches id in org_departments table
  organizationId: text("organization_id"),
  approvalStatus: text("approval_status").default("pending").notNull(), // pending | active | rejected
  createdAt: createdAt,
});

export const buckets = pgTable("buckets", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  userId: text("user_id").notNull(),
  organizationId: text("organization_id").default("org_default").notNull(),
  size: bigint("size", { mode: "number" }).default(0).notNull(),
  count: bigint("count", { mode: "number" }).default(0).notNull(), // file /folder count in this folder
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    type: text("type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    path: text("path").notNull(),
    storagePath: text("storage_path"),
    duplicateOfId: text("duplicate_of_id"),
    visibility: text("visibility").default("inherit").notNull(), // public, private, inherit
    metadata: jsonb("metadata"),
    md5: text("md5"),
    assetMetadata: jsonb("asset_metadata"),
    tags: jsonb("tags").$type<string[]>(),
    customMetadata: jsonb("custom_metadata").$type<Record<string, any>>(),
    preview: text("preview"),
    dimensions: text("dimensions"),
    count: bigint("count", { mode: "number" }).default(0).notNull(), // file/folder count in this folder
    parentId: text("parent_id").default("root").notNull(),
    bucketName: text("bucket_name").notNull(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").default("org_default").notNull(),
    departmentId: text("department_id"),
    processingStatus: text("processing_status").default("pending_processing").notNull(),
    sharedCount: integer("shared_count").default(0).notNull(),
    createdAt: createdAt,
    updatedAt: updatedAt,
    deletedAt: deletedAt,
  },
  (t) => [
    unique().on(t.path, t.deletedAt),
    index("idx_files_parent_id").on(t.parentId),
    index("idx_files_bucket_user").on(t.bucketName, t.userId),
    index("idx_files_deleted_at").on(t.deletedAt),
    index("idx_files_name").on(t.name),
    index("idx_files_type_parent").on(t.type, t.parentId),
    index("idx_files_org").on(t.organizationId),
    index("idx_files_department_id").on(t.departmentId),
    index("idx_files_processing_status").on(t.processingStatus),
  ]
);

export const favorites = pgTable(
  "favorites",
  {
    id: autoIncrement,
    fileId: text("file_id").notNull(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").default("org_default").notNull(),
    createdAt: createdAt,
  },
  (t) => [
    unique().on(t.fileId, t.userId),
    index("idx_favorites_user_id").on(t.userId),
  ]
);

export const shared = pgTable(
  "shared",
  {
    id: autoIncrement,
    fileId: text("file_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").default("viewer").notNull(),
    organizationId: text("organization_id").default("org_default").notNull(),
    createdAt: createdAt,
  },
  (t) => [
    unique().on(t.fileId, t.userId),
    index("idx_shared_user_id").on(t.userId),
    index("idx_shared_file_id").on(t.fileId),
  ]
);

export const website = pgTable("website", {
  id: autoIncrement,
  fileId: text("file_id").notNull().unique(),
  domain: text("domain").notNull().unique(),
  bucketName: text("bucket_name").notNull(),
  createdAt: createdAt,
});

// Per-department upload nomenclature templates
export const nomenclatures = pgTable("nomenclatures", {
  id: autoIncrement,
  departmentId: text("department_id").notNull().unique(), // matches id in org_departments table
  organizationId: text("organization_id").default("org_default").notNull(),
  template: text("template").notNull().default("Brand_Campaign_Channel_Asset_Format_Version_Date"),
  // JSON: Array of { key: string, label: string, allowedValues: string[] }
  segments: jsonb("segments"),
  allowedExtensions: jsonb("allowed_extensions").$type<string[] | null>(),
  folderTemplate: text("folder_template"),
  folderSegments: jsonb("folder_segments").$type<Array<{
    key: string;
    label: string;
    allowedValues?: string[] | null;
  }> | null>(),
  updatedBy: text("updated_by").notNull(), // userId of the dept_head who last updated
  updatedAt: updatedAt,
});

// Folder creation requests from team leads pending dept head approval
export const folderRequests = pgTable(
  "folder_requests",
  {
    id: text("id").primaryKey(),
    requestedBy: text("requested_by").notNull(), // userId
    departmentId: text("department_id").notNull(),
    organizationId: text("organization_id").default("org_default").notNull(),
    folderName: text("folder_name").notNull(),
    parentId: text("parent_id").default("root").notNull(), // parent folder id or 'root'
    bucketName: text("bucket_name").notNull(),
    status: text("status").default("pending").notNull(), // pending | approved | rejected
    reviewedBy: text("reviewed_by"), // userId of dept_head who reviewed
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    finalFolderName: text("final_folder_name"),
    reviewNote: text("review_note"),
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    index("idx_folder_requests_dept").on(t.departmentId),
    index("idx_folder_requests_status").on(t.status),
    index("idx_folder_requests_user").on(t.requestedBy),
  ]
);

// Google Drive folder hosting integrations and requests
export const gdriveFolders = pgTable("gdrive_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  organizationId: text("organization_id").default("org_default").notNull(),
  folderId: text("folder_id"),
  folderName: text("folder_name"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  status: text("status").default("pending").notNull(), // pending | approved | rejected
  createdAt: createdAt,
  updatedAt: updatedAt,
});

// BYOS (Bring Your Own Storage) credentials provided by the org creator during signup
export const byosStorageConfigs = pgTable("byos_storage_configs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // Organization id — set after Super Admin approves the org request
  organizationId: text("organization_id"),
  // 'aws' | 'r2' | 'gcs'
  provider: text("provider").notNull(),
  // AWS S3 / Cloudflare R2 fields
  accessKeyId: text("access_key_id"),
  secretAccessKey: text("secret_access_key"),
  bucketName: text("bucket_name").notNull(),
  region: text("region"),
  // Cloudflare R2 only: https://<accountId>.r2.cloudflarestorage.com
  endpoint: text("endpoint"),
  // Google Cloud Storage — service account fields (Option B)
  projectId: text("project_id"),
  clientEmail: text("client_email"),
  privateKey: text("private_key"),
  // Google Cloud Storage — OAuth token fields (Options A & C)
  // 'service_account' | 'oauth_manual' | 'oauth_auto'
  gcsConnectionMode: text("gcs_connection_mode"),
  gcsAccessToken: text("gcs_access_token"),
  gcsRefreshToken: text("gcs_refresh_token"),
  gcsTokenExpiresAt: bigint("gcs_token_expires_at", { mode: "number" }),
  // 'pending' | 'verified'
  status: text("status").default("pending").notNull(),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

// Pending organization creation requests (Super Admin must approve before org is created)
export const organizationRequests = pgTable(
  "organization_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    orgName: text("org_name").notNull(),
    // 's3' | 'gdrive' | 'byos'
    orgType: text("org_type").default("s3").notNull(),
    // Links to byosStorageConfigs when orgType === 'byos'
    byosConfigId: text("byos_config_id"),
    status: text("status").default("pending").notNull(), // pending | approved | rejected
    reviewNote: text("review_note"),
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    index("idx_org_requests_user").on(t.userId),
    index("idx_org_requests_status").on(t.status),
  ]
);

// Google Drive governance rules set by organization admin
export const orgGDriveRules = pgTable("org_gdrive_rules", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().unique(),
  // Enforce nomenclature: uploaded files must match the org nomenclature template
  enforceNomenclature: boolean("enforce_nomenclature").default(false).notNull(),
  // Enforce hierarchy: folders can only be created under approved department parent folders
  enforceHierarchy: boolean("enforce_hierarchy").default(false).notNull(),
  // Inter-dept visibility: if false, users only see their own dept's files; if true, all depts are visible to each other
  allowInterDeptVisibility: boolean("allow_inter_dept_visibility").default(true).notNull(),
  createdAt: createdAt,
  updatedAt: updatedAt,
});
