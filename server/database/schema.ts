import {
  sqliteTable,
  text,
  integer,
  unique,
  index,
  customType,
} from "drizzle-orm/sqlite-core";

const customJson = customType<{ data: any; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(val: any): string {
    return JSON.stringify(val);
  },
  fromDriver(val: string): any {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  },
});

const autoIncrement = integer({ mode: "number" }).primaryKey({
  autoIncrement: true,
});
const createdAt = integer("created_at", { mode: "timestamp" }).notNull();
const updatedAt = integer("updated_at", { mode: "timestamp" }).notNull();
const deletedAt = integer("deleted_at", { mode: "timestamp" });

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  // 'active' | 'suspended'
  status: text("status").default("active").notNull(),
  // 's3' | 'gdrive' | 'byos'
  orgType: text("org_type").default("s3").notNull(),
  setupComplete: integer("setup_complete", { mode: "boolean" }).default(false).notNull(),
  // JSON: { nomenclature: bool, hierarchy: bool, userPermissions: bool, templateFolders: bool }
  features: text("features", { mode: "json" }).$type<{
    nomenclature: boolean;
    hierarchy: boolean;
    userPermissions: boolean;
    templateFolders: boolean;
  }>(),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export const orgDepartments = sqliteTable(
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

export const deptInvites = sqliteTable("dept_invites", {
  id: text("id").primaryKey(),              // ULID
  organizationId: text("organization_id").notNull(),
  departmentId: text("department_id").notNull(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),  // random UUID for the invite link
  status: text("status").default("pending").notNull(), // pending | accepted | expired
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: createdAt,
});

export const userPermissionOverrides = sqliteTable("user_permission_overrides", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  organizationId: text("organization_id").notNull(),
  departmentId: text("department_id").notNull(),
  canView: integer("can_view", { mode: "boolean" }),
  canUpload: integer("can_upload", { mode: "boolean" }),        // null = use role default
  canDownload: integer("can_download", { mode: "boolean" }),
  canDelete: integer("can_delete", { mode: "boolean" }),
  canCreateFolder: integer("can_create_folder", { mode: "boolean" }),
  canShare: integer("can_share", { mode: "boolean" }),
  canRename: integer("can_rename", { mode: "boolean" }),
  canEditMetadata: integer("can_edit_metadata", { mode: "boolean" }),
  canUseRag: integer("can_use_rag", { mode: "boolean" }),
  allDepartmentAccess: integer("all_department_access", { mode: "boolean" }).default(false).notNull(),
  updatedAt: updatedAt,
});

export const userDepartmentAccess = sqliteTable(
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

export const permissionAuditLogs = sqliteTable(
  "permission_audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    targetUserId: text("target_user_id"),
    targetRole: text("target_role"),
    departmentId: text("department_id"),
    changes: text("changes", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt,
  },
  (t) => [
    index("idx_permission_audit_org").on(t.organizationId),
    index("idx_permission_audit_target").on(t.targetUserId),
  ],
);

export const orgPermissions = sqliteTable(
  "org_permissions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    departmentId: text("department_id").default("global").notNull(), // 'global' or orgDepartments.id
    role: text("role").notNull(),
    maxCount: integer("max_count"), // nullable limit of users for this position in department
    canView: integer("can_view", { mode: "boolean" }).default(true).notNull(),
    canUpload: integer("can_upload", { mode: "boolean" }).default(true).notNull(),
    canDownload: integer("can_download", { mode: "boolean" }).default(true).notNull(),
    canDelete: integer("can_delete", { mode: "boolean" }).default(false).notNull(),
    canCreateFolder: integer("can_create_folder", { mode: "boolean" }).default(false).notNull(),
    canApproveUsers: integer("can_approve_users", { mode: "boolean" }).default(false).notNull(),
    canEditNomenclature: integer("can_edit_nomenclature", { mode: "boolean" }).default(false).notNull(),
    canShare: integer("can_share", { mode: "boolean" }).default(false).notNull(),
    canRename: integer("can_rename", { mode: "boolean" }).default(false).notNull(),
    canEditMetadata: integer("can_edit_metadata", { mode: "boolean" }).default(false).notNull(),
    canUseRag: integer("can_use_rag", { mode: "boolean" }).default(false).notNull(),
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    unique().on(t.organizationId, t.departmentId, t.role),
  ]
);

export const users = sqliteTable("users", {
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

export const buckets = sqliteTable("buckets", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  userId: text("user_id").notNull(),
  organizationId: text("organization_id").default("org_default").notNull(),
  size: integer("size").default(0).notNull(),
  count: integer("count").default(0).notNull(), // file /folder count in this folder
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
    path: text("path").notNull(),
    storagePath: text("storage_path"),
    duplicateOfId: text("duplicate_of_id"),
    visibility: text("visibility").default("inherit").notNull(), // public, private, inherit
    metadata: text("metadata", { mode: "json" }),
    md5: text("md5"),
    assetMetadata: customJson("asset_metadata"),
    // Phase 3: Tags (array of strings) and custom metadata (key-value pairs) stored as JSON for RAG compatibility
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    customMetadata: text("custom_metadata", { mode: "json" }).$type<Record<string, any>>(),
    preview: text("preview"),
    dimensions: text("dimensions"),
    count: integer("count").default(0).notNull(), // file/folder count in this folder
    parentId: text("parent_id").default("root").notNull(),
    bucketName: text("bucket_name").notNull(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").default("org_default").notNull(),
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
  ]
);

export const favorites = sqliteTable(
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

export const shared = sqliteTable(
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

export const website = sqliteTable("website", {
  id: autoIncrement,
  fileId: text("file_id").notNull().unique(),
  domain: text("domain").notNull().unique(),
  bucketName: text("bucket_name").notNull(),
  createdAt: createdAt,
});

// Per-department upload nomenclature templates
export const nomenclatures = sqliteTable("nomenclatures", {
  id: autoIncrement,
  departmentId: text("department_id").notNull().unique(), // matches id in org_departments table
  organizationId: text("organization_id").default("org_default").notNull(),
  template: text("template").notNull().default("Brand_Campaign_Channel_Asset_Format_Version_Date"),
  // JSON: Array of { key: string, label: string, allowedValues: string[] }
  segments: text("segments", { mode: "json" }),
  allowedExtensions: text("allowed_extensions", { mode: "json" }).$type<string[] | null>(),
  folderTemplate: text("folder_template"),
  folderSegments: text("folder_segments", { mode: "json" }).$type<Array<{
    key: string;
    label: string;
    allowedValues?: string[] | null;
  }> | null>(),
  updatedBy: text("updated_by").notNull(), // userId of the dept_head who last updated
  updatedAt: updatedAt,
});

// Folder creation requests from team leads pending dept head approval
export const folderRequests = sqliteTable(
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
    reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
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
export const gdriveFolders = sqliteTable("gdrive_folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  organizationId: text("organization_id").default("org_default").notNull(),
  folderId: text("folder_id"),
  folderName: text("folder_name"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at").notNull(),
  status: text("status").default("pending").notNull(), // pending | approved | rejected
  createdAt: createdAt,
  updatedAt: updatedAt,
});

// BYOS (Bring Your Own Storage) credentials provided by the org creator during signup
export const byosStorageConfigs = sqliteTable("byos_storage_configs", {
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
  gcsTokenExpiresAt: integer("gcs_token_expires_at"),
  // 'pending' | 'verified'
  status: text("status").default("pending").notNull(),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

// Pending organization creation requests (Super Admin must approve before org is created)
export const organizationRequests = sqliteTable("organization_requests", {
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
export const orgGDriveRules = sqliteTable("org_gdrive_rules", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().unique(),
  // Enforce nomenclature: uploaded files must match the org nomenclature template
  enforceNomenclature: integer("enforce_nomenclature", { mode: "boolean" }).default(false).notNull(),
  // Enforce hierarchy: folders can only be created under approved department parent folders
  enforceHierarchy: integer("enforce_hierarchy", { mode: "boolean" }).default(false).notNull(),
  // Inter-dept visibility: if false, users only see their own dept's files; if true, all depts are visible to each other
  allowInterDeptVisibility: integer("allow_inter_dept_visibility", { mode: "boolean" }).default(true).notNull(),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

// Phase 3: Taxonomy / Controlled Vocabulary definitions per organization
// Admins/Dept Heads define metadata field schemas (name, type, allowed options).
// These drive both the asset metadata editor UI and faceted search filters.
export const taxonomies = sqliteTable(
  "taxonomies",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    // null = org-wide; set to a departmentId to scope to that department only
    departmentId: text("department_id"),
    // Human-readable field name shown in UI (e.g. "Campaign", "Status", "Brand")
    name: text("name").notNull(),
    // Key used in the customMetadata JSON object (e.g. "campaign", "status")
    key: text("key").notNull(),
    // 'text' | 'select' | 'multiselect'
    type: text("type").default("select").notNull(),
    // JSON array of allowed string values; null = free-text allowed
    options: text("options", { mode: "json" }).$type<string[]>(),
    isRequired: integer("is_required", { mode: "boolean" }).default(false).notNull(),
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    unique().on(t.organizationId, t.key),
    index("idx_taxonomies_org").on(t.organizationId),
  ]
);
