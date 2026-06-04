import {
  sqliteTable,
  text,
  integer,
  unique,
  index,
} from "drizzle-orm/sqlite-core";

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
  // 's3' | 'gdrive'
  orgType: text("org_type").default("s3").notNull(),
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
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    index("idx_org_depts_org").on(t.organizationId),
  ]
);

export const orgPermissions = sqliteTable(
  "org_permissions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    departmentId: text("department_id").default("global").notNull(), // 'global' or orgDepartments.id
    role: text("role").notNull(),
    maxCount: integer("max_count"), // nullable limit of users for this position in department
    canUpload: integer("can_upload", { mode: "boolean" }).default(true).notNull(),
    canDownload: integer("can_download", { mode: "boolean" }).default(true).notNull(),
    canDelete: integer("can_delete", { mode: "boolean" }).default(false).notNull(),
    canCreateFolder: integer("can_create_folder", { mode: "boolean" }).default(false).notNull(),
    canApproveUsers: integer("can_approve_users", { mode: "boolean" }).default(false).notNull(),
    canEditNomenclature: integer("can_edit_nomenclature", { mode: "boolean" }).default(false).notNull(),
    canShare: integer("can_share", { mode: "boolean" }).default(false).notNull(),
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
    visibility: text("visibility").default("inherit").notNull(), // public, private, inherit
    metadata: text("metadata", { mode: "json" }),
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

// Pending organization creation requests (Super Admin must approve before org is created)
export const organizationRequests = sqliteTable("organization_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  orgName: text("org_name").notNull(),
  // 's3' | 'gdrive'
  orgType: text("org_type").default("s3").notNull(),
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
