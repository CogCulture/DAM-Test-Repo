-- Revised Supabase PostgreSQL Schema for Folder DAM Application
-- Incorporating feedback to maintain compatibility with existing Nuxt/Nitro application
-- Designed for multi-tenancy, robust RBAC, and Supabase compatibility
-- Run this in a fresh Supabase PostgreSQL database

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gi";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Organizations (tenants)
CREATE TABLE organizations (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    name VARCHAR(255) NOT NULL UNIQUE,
    -- 'active' | 'suspended'
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- 's3' | 'gdrive' | 'byos'
    org_type VARCHAR(10) NOT NULL DEFAULT 's3',
    setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
    -- JSON: { nomenclature: boolean, hierarchy: boolean, userPermissions: boolean, templateFolders: boolean }
    features JSONB NOT NULL DEFAULT '{"nomenclature": false, "hierarchy": false, "userPermissions": false, "templateFolders": false}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for organizations
CREATE INDEX idx_organizations_status ON organizations(status);
CREATE INDEX idx_organizations_org_type ON organizations(org_type);

-- Organization Departments (hierarchical)
CREATE TABLE org_departments (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id TEXT REFERENCES org_departments(id) ON DELETE SET NULL, -- hierarchy self-reference
    folder_id TEXT, -- physical folder id mapping (to buckets.id)
    gdrive_folder_id VARCHAR(255), -- links each DB dept to its real GDrive folder ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure department name is unique within an organization
    UNIQUE(organization_id, name)
);

-- Indexes for org_departments
CREATE INDEX idx_org_departments_organization ON org_departments(organization_id);
CREATE INDEX idx_org_departments_parent ON org_departments(parent_id);
CREATE INDEX idx_org_departments_folder ON org_departments(folder_id);
CREATE INDEX idx_org_departments_gdrive_folder ON org_departments(gdrive_folder_id);

-- Users (independent table, NOT linked to Supabase auth.users)
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text), -- App-generated ID (ULID-style)
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    avatar TEXT,
    country VARCHAR(100),
    -- 'active' | 'pending' | 'suspended'
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    provider VARCHAR(50), -- oauth provider (google, github, etc.)
    -- RBAC fields
    role VARCHAR(50) NOT NULL DEFAULT 'team_member', -- founder | dept_head | team_lead | team_member | intern
    department_id TEXT REFERENCES org_departments(id) ON DELETE SET NULL, -- matches id in org_departments table
    organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | active | rejected
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_approval_status ON users(approval_status);

-- User-Organization Membership (many-to-many with role)
CREATE TABLE user_organizations (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'team_member', -- founder | dept_head | team_lead | team_member | intern
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure user can only have one role per organization
    UNIQUE(user_id, organization_id)
);

-- Indexes for user_organizations
CREATE INDEX idx_user_organizations_user ON user_organizations(user_id);
CREATE INDEX idx_user_organizations_organization ON user_organizations(organization_id);
CREATE INDEX idx_user_organizations_role ON user_organizations(role);

-- User Department Access (explicit access to departments beyond org role)
CREATE TABLE user_department_access (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id TEXT NOT NULL REFERENCES org_departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure user can only have one entry per department per organization
    UNIQUE(user_id, department_id, organization_id)
);

-- Indexes for user_department_access
CREATE INDEX idx_user_department_access_user ON user_department_access(user_id);
CREATE INDEX idx_user_department_access_organization ON user_department_access(organization_id);
CREATE INDEX idx_user_department_access_department ON user_department_access(department_id);

-- Organization Permissions (role-based permissions matrix)
CREATE TABLE org_permissions (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id TEXT NOT NULL REFERENCES org_departments(id) ON DELETE CASCADE DEFAULT 'global', -- 'global' for organization-wide
    role VARCHAR(50) NOT NULL, -- founder | dept_head | team_lead | team_member | intern | etc.
    max_count INTEGER, -- nullable limit of users for this position in department
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_upload BOOLEAN NOT NULL DEFAULT TRUE,
    can_download BOOLEAN NOT NULL DEFAULT TRUE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    can_create_folder BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve_users BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_nomenclature BOOLEAN NOT NULL DEFAULT FALSE,
    can_share BOOLEAN NOT NULL DEFAULT FALSE,
    can_rename BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit_metadata BOOLEAN NOT NULL DEFAULT FALSE,
    can_use_rag BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure unique permission set per organization/department/role
    UNIQUE(organization_id, department_id, role)
);

-- Indexes for org_permissions
CREATE INDEX idx_org_permissions_organization ON org_permissions(organization_id);
CREATE INDEX idx_org_permissions_department ON org_permissions(department_id);
CREATE INDEX idx_org_permissions_role ON org_permissions(role);
CREATE INDEX idx_org_permissions_org_dept ON org_permissions(organization_id, department_id);

-- User Permission Overrides (exceptions to org_permissions)
CREATE TABLE user_permission_overrides (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id TEXT NOT NULL REFERENCES org_departments(id) ON DELETE CASCADE,
    can_view BOOLEAN,
    can_upload BOOLEAN,
    can_download BOOLEAN,
    can_delete BOOLEAN,
    can_create_folder BOOLEAN,
    can_share BOOLEAN,
    can_rename BOOLEAN,
    can_edit_metadata BOOLEAN,
    can_use_rag BOOLEAN,
    all_department_access BOOLEAN NOT NULL DEFAULT FALSE, -- if true, overrides apply to all depts in org
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure only one override set per user/organization/department
    UNIQUE(user_id, organization_id, department_id)
);

-- Indexes for user_permission_overrides
CREATE INDEX idx_user_permission_overrides_user ON user_permission_overrides(user_id);
CREATE INDEX idx_user_permission_overrides_organization ON user_permission_overrides(organization_id);
CREATE INDEX idx_user_permission_overrides_department ON user_permission_overrides(department_id);
CREATE INDEX idx_user_permission_overrides_org_dept ON user_permission_overrides(organization_id, department_id);

-- Files (main asset table)
CREATE TABLE files (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- file | folder
    size BIGINT NOT NULL,
    path TEXT NOT NULL, -- full path within bucket
    storage_path TEXT, -- actual storage path (e.g., S3 key)
    duplicate_of_id TEXT REFERENCES files(id) ON DELETE SET NULL, -- for deduplication
    visibility VARCHAR(20) NOT NULL DEFAULT 'inherit', -- public, private, inherit
    metadata JSONB, -- general metadata
    md5 CHAR(32), -- MD5 hash for deduplication
    asset_metadata JSONB, -- rich asset metadata (dimensions, duration, etc.)
    -- Phase 3: Tags and custom metadata for RAG compatibility
    tags JSONB DEFAULT '[]', -- array of strings
    custom_metadata JSONB DEFAULT '{}', -- key-value pairs
    preview TEXT, -- preview image URL/path
    dimensions TEXT, -- WxHxD or similar
    count INTEGER NOT NULL DEFAULT 0, -- file/folder count in this folder (for folders)
    parent_id TEXT NOT NULL DEFAULT 'root', -- parent folder id or 'root' (virtual)
    bucket_name VARCHAR(255) NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id TEXT REFERENCES org_departments(id) ON DELETE SET NULL,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'pending_processing',
    shared_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- soft delete
);

-- Indexes for files (critical for performance)
CREATE INDEX idx_files_path_deleted ON files(path, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_parent_id ON files(parent_id);
CREATE INDEX idx_files_bucket_user ON files(bucket_name, user_id);
CREATE INDEX idx_files_deleted_at ON files(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_files_name ON files(name);
CREATE INDEX idx_files_type_parent ON files(type, parent_id);
CREATE INDEX idx_files_org ON files(organization_id);
CREATE INDEX idx_files_department_id ON files(department_id);
CREATE INDEX idx_files_processing_status ON files(processing_status);
CREATE INDEX idx_files_md5 ON files(md5) WHERE md5 IS NOT NULL;
CREATE INDEX idx_files_visibility ON files(visibility);
-- GIN indexes for JSONB fields (tags, custom_metadata, metadata, asset_metadata)
CREATE INDEX idx_files_tags ON files USING GIN(tags);
CREATE INDEX idx_files_custom_metadata ON files USING GIN(custom_metadata);
CREATE INDEX idx_files_metadata ON files USING GIN(metadata);
CREATE INDEX idx_files_asset_metadata ON files USING GIN(asset_metadata);

-- Buckets (storage containers/folders)
CREATE TABLE buckets (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    name VARCHAR(255) NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 'org_default', -- org_default
    size BIGINT NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 0, -- file/folder count in this bucket
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for buckets
CREATE INDEX idx_buckets_user ON buckets(user_id);
CREATE INDEX idx_buckets_organization ON buckets(organization_id);
CREATE INDEX idx_buckets_name ON buckets(name);

-- Shared Files (explicit sharing between users)
CREATE TABLE shared (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer', -- viewer | editor | owner
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 'org_default', -- org_default
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure a file is only shared once with a specific user
    UNIQUE(file_id, user_id)
);

-- Indexes for shared
CREATE INDEX idx_shared_user_id ON shared(user_id);
CREATE INDEX idx_shared_file_id ON shared(file_id);
CREATE INDEX idx_shared_organization ON shared(organization_id);

-- Favorites (user file favorites)
CREATE TABLE favorites (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 'org_default', -- org_default
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure a user can only favorite a file once
    UNIQUE(file_id, user_id)
);

-- Indexes for favorites
CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_favorites_file_id ON favorites(file_id);
CREATE INDEX idx_favorites_organization ON favorites(organization_id);

-- Website Publishing
CREATE TABLE website (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    file_id TEXT NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL UNIQUE,
    bucket_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for website
CREATE INDEX idx_website_domain ON website(domain);
CREATE INDEX idx_website_bucket_name ON website(bucket_name);

-- ============================================================================
# INTEGRATION & WORKFLOW TABLES
# ============================================================================

# Per-department upload nomenclature templates
CREATE TABLE nomenclatures (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    department_id TEXT NOT NULL UNIQUE REFERENCES org_departments(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 'org_default', -- org_default
    template VARCHAR(255) NOT NULL DEFAULT 'Brand_Campaign_Channel_Asset_Format_Version_Date',
    # JSON: Array of { key: string, label: string, allowedValues: string[] }
    segments JSONB,
    allowed_extensions JSONB, -- array of strings or null
    folder_template TEXT,
    folder_segments JSONB, -- Array of { key: string, label: string, allowedValues?: string[] | null }
    updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL, -- userId of the dept_head who last updated
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Indexes for nomenclatures
CREATE INDEX idx_nomenclatures_department ON nomenclatures(department_id);
CREATE INDEX idx_nomenclatures_organization ON nomenclatures(organization_id);
CREATE INDEX idx_nomenclatures_updated_by ON nomenclatures(updated_by);

# Folder creation requests from team leads pending dept head approval
CREATE TABLE folder_requests (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id TEXT NOT NULL REFERENCES org_departments(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 'org_default', -- org_default
    folder_name VARCHAR(255) NOT NULL,
    parent_id TEXT NOT NULL DEFAULT 'root', -- root folder id or 'root'
    bucket_name VARCHAR(255) NOT NULL,
    # pending | approved | rejected
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL, -- userId of dept_head who reviewed
    reviewed_at TIMESTAMPTZ,
    final_folder_name VARCHAR(255),
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Indexes for folder_requests
CREATE INDEX idx_folder_requests_requested_by ON folder_requests(requested_by);
CREATE INDEX idx_folder_requests_department ON folder_requests(department_id);
CREATE INDEX idx_folder_requests_organization ON folder_requests(organization_id);
CREATE INDEX idx_folder_requests_status ON folder_requests(status);
CREATE INDEX idx_folder_requests_parent ON folder_requests(parent_id);

# Google Drive folder hosting integrations and requests
CREATE TABLE gdrive_folders (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT 'org_default', -- org_default
    folder_id VARCHAR(255),
    folder_name VARCHAR(255),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    # pending | approved | rejected
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Indexes for gdrive_folders
CREATE INDEX idx_gdrive_folders_user ON gdrive_folders(user_id);
CREATE INDEX idx_gdrive_folders_organization ON gdrive_folders(organization_id);
CREATE INDEX idx_gdrive_folders_status ON gdrive_folders(status);

# BYOS (Bring Your Own Storage) credentials provided by the org creator during signup
CREATE TABLE byos_storage_configs (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    # Organization id — set after Super Admin approves the org request
    organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    # 'aws' | 'r2' | 'gcs'
    provider VARCHAR(10) NOT NULL,
    # AWS S3 / Cloudflare R2 fields
    access_key_id TEXT,
    secret_access_key TEXT,
    bucket_name VARCHAR(255) NOT NULL,
    region VARCHAR(50),
    # Cloudflare R2 only: https://<accountId>.r2.cloudflarestorage.com
    endpoint TEXT,
    # Google Cloud Storage — service account fields (Option B)
    project_id TEXT,
    client_email TEXT,
    private_key TEXT,
    # Google Cloud Storage — OAuth token fields (Options A & C)
    # 'service_account' | 'oauth_manual' | 'oauth_auto'
    gcs_connection_mode VARCHAR(20),
    gcs_access_token TEXT,
    gcs_refresh_token TEXT,
    gcs_token_expires_at TIMESTAMPTZ,
    # 'pending' | 'verified'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Indexes for byos_storage_configs
CREATE INDEX idx_byos_storage_configs_user ON byos_storage_configs(user_id);
CREATE INDEX idx_byos_storage_configs_organization ON byos_storage_configs(organization_id);
CREATE INDEX idx_byos_storage_configs_provider ON byos_storage_configs(provider);
CREATE INDEX idx_byos_storage_configs_status ON byos_storage_configs(status);

# Pending organization creation requests (Super Admin must approve before org is created)
CREATE TABLE organization_requests (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_name VARCHAR(255) NOT NULL,
    # 's3' | 'gdrive' | 'byos'
    org_type VARCHAR(10) NOT NULL DEFAULT 's3',
    # Links to byosStorageConfigs when orgType === 'byos'
    byos_config_id TEXT REFERENCES byos_storage_configs(id) ON DELETE SET NULL,
    # pending | approved | rejected
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Indexes for organization_requests
CREATE INDEX idx_organization_requests_user ON organization_requests(user_id);
CREATE INDEX idx_organization_requests_status ON organization_requests(status);
CREATE INDEX idx_organization_requests_org_type ON organization_requests(org_type);

# Google Drive governance rules set by organization admin
CREATE TABLE org_gdrive_rules (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    # Enforce nomenclature: uploaded files must match the org nomenclature template
    enforce_nomenclature BOOLEAN NOT NULL DEFAULT FALSE,
    # Enforce hierarchy: folders can only be created under approved department parent folders
    enforce_hierarchy BOOLEAN NOT NULL DEFAULT FALSE,
    # Inter-dept visibility: if false, users only see their own dept's files; if true, all depts are visible to each other
    allow_inter_dept_visibility BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Indexes for org_gdrive_rules
CREATE INDEX idx_org_gdrive_rules_organization ON org_gdrive_rules(organization_id);

# ============================================================================
# AUDIT LOGS
# ============================================================================

# Permission audit logs
CREATE TABLE permission_audit_logs (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_role VARCHAR(50),
    department_id TEXT REFERENCES org_departments(id) ON DELETE SET NULL,
    changes JSONB NOT NULL, -- Record<string, unknown>
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Indexes for permission_audit_logs
CREATE INDEX idx_permission_audit_org ON permission_audit_logs(organization_id);
CREATE INDEX idx_permission_audit_target ON permission_audit_logs(target_user_id);
CREATE INDEX idx_permission_audit_actor ON permission_audit_logs(actor_user_id);

# Pipeline audit logs
CREATE TABLE pipeline_audit_logs (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id TEXT REFERENCES org_departments(id) ON DELETE SET NULL,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    stage VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    details JSONB, -- Record<string, unknown>
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Indexes for pipeline_audit_logs
CREATE INDEX idx_pipeline_audit_org ON pipeline_audit_logs(organization_id);
CREATE INDEX idx_pipeline_audit_file ON pipeline_audit_logs(file_id);
CREATE INDEX idx_pipeline_audit_stage ON pipeline_audit_logs(stage);

# ============================================================================
# TRIGGERS FOR TIMESTAMP UPDATES
# ============================================================================

# Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

# Apply trigger to tables with updated_at column
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'organizations',
        'org_departments',
        'users',
        'user_organizations',
        'user_department_access',
        'org_permissions',
        'user_permission_overrides',
        'files',
        'buckets',
        'shared',
        'favorites',
        'website',
        'nomenclatures',
        'folder_requests',
        'gdrive_folders',
        'byos_storage_configs',
        'organization_requests',
        'org_gdrive_rules',
        'permission_audit_logs',
        'pipeline_audit_logs'
    ];
BEGIN
    FOREACH table_name IN ARRAY tables LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
            CREATE TRIGGER update_%I_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', table_name, table_name, table_name, table_name);
    END LOOP;
END $$;

# ============================================================================
# COMMENTS FOR DOCUMENTATION
# ============================================================================

COMMENT ON TABLE organizations IS 'Tenant organizations in the multi-tenant system';
COMMENT ON TABLE org_departments IS 'Hierarchical departments within organizations';
COMMENT ON TABLE users IS 'System users (independent table, not linked to Supabase auth.users)';
COMMENT ON TABLE user_organizations IS 'Many-to-many mapping of users to organizations with roles';
COMMENT ON TABLE user_department_access IS 'Explicit user access to specific departments (beyond org role)';
COMMENT ON TABLE org_permissions IS 'Permission templates defining what roles can do in orgs/departments';
COMMENT ON TABLE user_permission_overrides IS 'Per-user permission exceptions to org_permissions';
COMMENT ON TABLE files IS 'Primary asset table storing file and folder metadata';
COMMENT ON TABLE buckets IS 'Storage containers/folders for organizing files';
COMMENT ON TABLE shared IS 'Explicit file sharing between users';
COMMENT ON TABLE favorites IS 'User bookmarked/favorite files';
COMMENT ON TABLE website IS 'Published websites mapped to file buckets';
COMMENT ON TABLE nomenclatures IS 'Per-department file naming templates';
COMMENT ON TABLE folder_requests IS 'Folder creation approval workflow';
COMMENT ON TABLE gdrive_folders IS 'Google Drive integration credentials and status';
COMMENT ON TABLE byos_storage_configs IS 'Bring-your-own-storage configuration';
COMMENT ON TABLE organization_requests IS 'Pending organization creation requests';
COMMENT ON TABLE org_gdrive_rules IS 'Google Drive governance policies per organization';
COMMENT ON TABLE permission_audit_logs IS 'Audit trail for permission changes';
COMMENT ON TABLE pipeline_audit_logs IS 'Audit trail for file processing pipeline events';

-- ============================================================================
# IMPLEMENTATION NOTES
# ============================================================================

# ID Generation Strategy:
# - All ID columns use TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text)
# - This generates UUIDv4 strings but keeps them as TEXT for compatibility
# - Application can still generate ULIDs or other ID formats if needed
# - Special values like 'root', 'org_default', 'global' are still supported

# Foreign Key Notes:
# - files.parent_id has NO foreign key constraint to maintain compatibility
#   with virtual 'root' and synthetic department IDs like 'dept_<id>'
# - All other foreign keys use ON DELETE CASCADE or SET NULL as appropriate

# Authentication:
# - users table is independent (NOT linked to Supabase auth.users)
# - Application continues to use nuxt-auth-utils and direct OAuth flow
# - If migrating to Supabase Auth in future, this schema would need updates

# Row Level Security:
# - RLS is NOT enabled by default in this schema
# - Application continues to use server/utils/permission.ts and access-control.ts
# - If implementing RLS in future for client-side queries, policies would need
#   to be added using application-specific session variables or claims

# Default Values:
# - organization_id defaults to 'org_default' in buckets, shared, favorites, website
# - department_id defaults to 'global' in org_permissions (for org-wide permissions)
# - parent_id defaults to 'root' in files and folder_requests
# - These maintain compatibility with existing application logic

# JSONB Fields:
# - metadata, tags, custom_metadata, asset_metadata use JSONB type
# - GIN indexes enable efficient querying and filtering
# - Supports rich metadata for RAG and AI use cases

# Timestamps:
# - All *_at columns use TIMESTAMPTZ with DEFAULT NOW()
# - BEFORE UPDATE triggers automatically maintain updated_at
# - Provides human-readable timestamps with timezone awareness