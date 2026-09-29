-- =============================================================================
-- REVISED SUPABASE / POSTGRESQL SCHEMA FOR FOLDER DAM APPLICATION
-- =============================================================================
-- 100% compatible with existing Nuxt/Nitro application logic, ULIDs,
-- virtual root ('root'), 'org_default', and self-hosted OAuth.
-- =============================================================================

-- Enable UUID extension (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. COMPATIBILITY SHIM FOR SQLITE json_extract()
-- =============================================================================
-- Allows existing queries in server/utils/db.ts that use json_extract() to execute
-- seamlessly in PostgreSQL without rewriting backend code.
CREATE OR REPLACE FUNCTION json_extract(json_val jsonb, path_val text)
RETURNS text AS $$
BEGIN
  IF json_val IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN json_val #>> string_to_array(trim(leading '$.' from path_val), '.');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- 2. AUTOMATIC updated_at TRIGGER FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 3. CORE MULTI-TENANT & USER TABLES
-- =============================================================================

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',               -- 'active' | 'suspended'
  org_type TEXT NOT NULL DEFAULT 's3',                -- 's3' | 'gdrive' | 'byos'
  setup_complete BOOLEAN NOT NULL DEFAULT false,
  features JSONB,                                     -- { nomenclature: bool, hierarchy: bool, userPermissions: bool, templateFolders: bool }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_organizations
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Departments table
CREATE TABLE IF NOT EXISTS org_departments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id TEXT,                                     -- Hierarchy self-reference
  folder_id TEXT,                                     -- Physical folder id mapping
  gdrive_folder_id TEXT,                              -- Google Drive folder ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_dept_name UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_org_depts_org ON org_departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_depts_parent ON org_departments(parent_id);

CREATE TRIGGER set_timestamp_org_departments
BEFORE UPDATE ON org_departments
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Users table (Independent from Supabase auth.users for nuxt-auth-utils compatibility)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'active',               -- 'active' | 'pending' | 'suspended'
  provider TEXT,                                      -- 'google' | 'github'
  role TEXT NOT NULL DEFAULT 'team_member',           -- 'admin' | 'dept_head' | 'team_lead' | 'team_member' | 'intern'
  department_id TEXT,
  organization_id TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'active' | 'rejected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_dept ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- User Organization Memberships
CREATE TABLE IF NOT EXISTS user_organizations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'team_member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_org UNIQUE(user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_orgs_user ON user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_orgs_org ON user_organizations(organization_id);

CREATE TRIGGER set_timestamp_user_organizations
BEFORE UPDATE ON user_organizations
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- User Department Access mappings
CREATE TABLE IF NOT EXISTS user_department_access (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_dept_access UNIQUE(user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_user_dept_acc_user ON user_department_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dept_acc_org ON user_department_access(organization_id);

-- Department & Organization Invites
CREATE TABLE IF NOT EXISTS dept_invites (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',              -- 'pending' | 'accepted' | 'expired'
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dept_invites_token ON dept_invites(token);
CREATE INDEX IF NOT EXISTS idx_dept_invites_org ON dept_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_dept_invites_email ON dept_invites(email);

-- Organization Role Permission Matrix
CREATE TABLE IF NOT EXISTS org_permissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL DEFAULT 'global',       -- 'global' or org_departments.id
  role TEXT NOT NULL,
  max_count INTEGER,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_upload BOOLEAN NOT NULL DEFAULT true,
  can_download BOOLEAN NOT NULL DEFAULT true,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_create_folder BOOLEAN NOT NULL DEFAULT false,
  can_approve_users BOOLEAN NOT NULL DEFAULT false,
  can_edit_nomenclature BOOLEAN NOT NULL DEFAULT false,
  can_share BOOLEAN NOT NULL DEFAULT false,
  can_rename BOOLEAN NOT NULL DEFAULT false,
  can_edit_metadata BOOLEAN NOT NULL DEFAULT false,
  can_use_rag BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_dept_role UNIQUE(organization_id, department_id, role)
);

CREATE INDEX IF NOT EXISTS idx_org_permissions_lookup ON org_permissions(organization_id, department_id, role);

CREATE TRIGGER set_timestamp_org_permissions
BEFORE UPDATE ON org_permissions
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- User Permission Overrides (Exceptions to base role permissions)
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL,
  can_view BOOLEAN,
  can_upload BOOLEAN,                                  -- NULL = inherit role default
  can_download BOOLEAN,
  can_delete BOOLEAN,
  can_create_folder BOOLEAN,
  can_share BOOLEAN,
  can_rename BOOLEAN,
  can_edit_metadata BOOLEAN,
  can_use_rag BOOLEAN,
  all_department_access BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_perm_override UNIQUE(user_id, organization_id, department_id)
);

CREATE TRIGGER set_timestamp_user_permission_overrides
BEFORE UPDATE ON user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- =============================================================================
-- 4. STORAGE, FILES & FOLDERS
-- =============================================================================

-- Buckets table
CREATE TABLE IF NOT EXISTS buckets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL DEFAULT 'org_default',
  size BIGINT NOT NULL DEFAULT 0,
  count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_buckets
BEFORE UPDATE ON buckets
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Files & Folders Table
-- NOTE: parent_id does NOT have a foreign key to support virtual 'root' & 'dept_<id>'
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  type TEXT NOT NULL,                                 -- 'file' | 'folder'
  size BIGINT NOT NULL,
  path TEXT NOT NULL,
  storage_path TEXT,
  duplicate_of_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'inherit',         -- 'public' | 'private' | 'inherit'
  metadata JSONB,
  md5 TEXT,
  asset_metadata JSONB,
  tags JSONB,                                         -- Array of string tags for RAG
  custom_metadata JSONB,                              -- Key-value metadata dictionary
  preview TEXT,
  dimensions TEXT,
  count BIGINT NOT NULL DEFAULT 0,
  parent_id TEXT NOT NULL DEFAULT 'root',             -- 'root', folder ULID, or Google Drive folder ID
  bucket_name TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL DEFAULT 'org_default',
  department_id TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending_processing',
  shared_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Strategic B-tree and GIN indexes for Files
CREATE INDEX IF NOT EXISTS idx_files_parent_id ON files(parent_id);
CREATE INDEX IF NOT EXISTS idx_files_bucket_user ON files(bucket_name, user_id);
CREATE INDEX IF NOT EXISTS idx_files_org ON files(organization_id);
CREATE INDEX IF NOT EXISTS idx_files_dept ON files(department_id);
CREATE INDEX IF NOT EXISTS idx_files_processing_status ON files(processing_status);
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_md5 ON files(md5);
CREATE INDEX IF NOT EXISTS idx_files_type_parent ON files(type, parent_id);

-- GIN Indexes on JSONB fields for high-speed RAG and metadata searches
CREATE INDEX IF NOT EXISTS idx_files_asset_metadata_gin ON files USING gin (asset_metadata);
CREATE INDEX IF NOT EXISTS idx_files_custom_metadata_gin ON files USING gin (custom_metadata);
CREATE INDEX IF NOT EXISTS idx_files_tags_gin ON files USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_files_metadata_gin ON files USING gin (metadata);

CREATE TRIGGER set_timestamp_files
BEFORE UPDATE ON files
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id BIGSERIAL PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL DEFAULT 'org_default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_favorites_file_user UNIQUE(file_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_file_id ON favorites(file_id);

-- Shared assets table
CREATE TABLE IF NOT EXISTS shared (
  id BIGSERIAL PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',                -- 'viewer' | 'editor'
  organization_id TEXT NOT NULL DEFAULT 'org_default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_shared_file_user UNIQUE(file_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_user_id ON shared(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_file_id ON shared(file_id);

-- Published Static Websites table
CREATE TABLE IF NOT EXISTS website (
  id BIGSERIAL PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  bucket_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. NOMENCLATURE & GOVERNANCE RULES
-- =============================================================================

-- Nomenclature templates per department
CREATE TABLE IF NOT EXISTS nomenclatures (
  id BIGSERIAL PRIMARY KEY,
  department_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL DEFAULT 'org_default',
  template TEXT NOT NULL DEFAULT 'Brand_Campaign_Channel_Asset_Format_Version_Date',
  segments JSONB,
  allowed_extensions JSONB,
  folder_template TEXT,
  folder_segments JSONB,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_nomenclatures
BEFORE UPDATE ON nomenclatures
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Folder creation requests pending department approval
CREATE TABLE IF NOT EXISTS folder_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id TEXT NOT NULL,
  organization_id TEXT NOT NULL DEFAULT 'org_default',
  folder_name TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT 'root',
  bucket_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',              -- 'pending' | 'approved' | 'rejected'
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  final_folder_name TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folder_requests_dept ON folder_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_folder_requests_status ON folder_requests(status);
CREATE INDEX IF NOT EXISTS idx_folder_requests_user ON folder_requests(requested_by);

CREATE TRIGGER set_timestamp_folder_requests
BEFORE UPDATE ON folder_requests
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- =============================================================================
-- 6. INTEGRATIONS (GOOGLE DRIVE & BYOS CLOUD STORAGE)
-- =============================================================================

-- Google Drive user integrations
CREATE TABLE IF NOT EXISTS gdrive_folders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL DEFAULT 'org_default',
  folder_id TEXT,
  folder_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',              -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_gdrive_folders
BEFORE UPDATE ON gdrive_folders
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Bring Your Own Storage (BYOS: AWS S3, Cloudflare R2, Google Cloud Storage)
CREATE TABLE IF NOT EXISTS byos_storage_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT,
  provider TEXT NOT NULL,                             -- 'aws' | 'r2' | 'gcs'
  access_key_id TEXT,
  secret_access_key TEXT,
  bucket_name TEXT NOT NULL,
  region TEXT,
  endpoint TEXT,
  project_id TEXT,
  client_email TEXT,
  private_key TEXT,
  gcs_connection_mode TEXT,
  gcs_access_token TEXT,
  gcs_refresh_token TEXT,
  gcs_token_expires_at BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',              -- 'pending' | 'verified'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_byos_storage_configs
BEFORE UPDATE ON byos_storage_configs
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Organization Creation Requests for Super Admin approval
CREATE TABLE IF NOT EXISTS organization_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_name TEXT NOT NULL,
  org_type TEXT NOT NULL DEFAULT 's3',                -- 's3' | 'gdrive' | 'byos'
  byos_config_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',              -- 'pending' | 'approved' | 'rejected'
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_requests_user ON organization_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_org_requests_status ON organization_requests(status);

CREATE TRIGGER set_timestamp_organization_requests
BEFORE UPDATE ON organization_requests
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Google Drive Governance Rules per organization
CREATE TABLE IF NOT EXISTS org_gdrive_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  enforce_nomenclature BOOLEAN NOT NULL DEFAULT false,
  enforce_hierarchy BOOLEAN NOT NULL DEFAULT false,
  allow_inter_dept_visibility BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_org_gdrive_rules
BEFORE UPDATE ON org_gdrive_rules
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- =============================================================================
-- 7. AUDIT LOGS
-- =============================================================================

-- Permission audit logs
CREATE TABLE IF NOT EXISTS permission_audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT,
  target_role TEXT,
  department_id TEXT,
  changes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perm_audit_org ON permission_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_perm_audit_target ON permission_audit_logs(target_user_id);

-- Pipeline & File Ingestion audit logs
CREATE TABLE IF NOT EXISTS pipeline_audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id TEXT,
  file_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_org ON pipeline_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_file ON pipeline_audit_logs(file_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_stage ON pipeline_audit_logs(stage);
