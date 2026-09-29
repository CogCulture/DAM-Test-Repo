# Supabase Database Schema Design for Folder DAM Application

This document explains the design decisions and improvements made in the Supabase-optimized PostgreSQL schema for the Folder DAM application, specifically addressing the requirements for:

1. Multi-tenant organization management
2. Robust Role-Based Access Control (RBAC) 
3. Secure file organization and access
4. Support for user invitations and department-level access
5. Prevention of override/break/duplication issues in RBAC
6. Optimal performance for Supabase PostgreSQL

## Key Improvements Over Original SQLite Schema

### 1. Proper UUID Usage
- **Changed**: All ID fields now use `UUID` with `uuid_generate_v4()` default
- **Benefit**: Better distribution, prevents ID guessing, works well in distributed systems
- **Supabase Optimization**: UUIDs are natively efficient in PostgreSQL

### 2. Enhanced Referential Integrity
- **Added**: Proper `FOREIGN KEY` constraints with `ON DELETE CASCADE/SET NULL` actions
- **Benefit**: Database-enforced data integrity prevents orphaned records
- **Example**: When an organization is deleted, all related data is automatically cleaned up

### 3. Explicit Constraints for Data Integrity
- **Added**: `UNIQUE` constraints where business logic requires uniqueness
  - `organizations.name` 
  - `org_departments(organization_id, name)` (department names unique per org)
  - `user_organizations(user_id, organization_id)` (one role per user per org)
  - `user_department_access(user_id, department_id, organization_id)`
  - `org_permissions(organization_id, department_id, role)`
  - `user_permission_overrides(user_id, organization_id, department_id)`
  - `shared(file_id, user_id)` (prevent duplicate shares)
  - `favorites(file_id, user_id)` (prevent duplicate favorites)
  - `website.file_id` (one website per file)
  - `website.domain` (unique domains)
  - `nomenclatures.department_id` (one nomenclature per dept)
- **Benefit**: Prevents duplicate/conflicting data at the database level

### 4. Improved JSONB Usage for Flexible Data
- **Changed**: JSON fields now use `JSONB` type instead of `TEXT`
- **Benefit**: 
  - Efficient querying and indexing of JSON data
  - Support for GIN indexes on JSONB fields for fast searching
  - Better performance for metadata, tags, custom_metadata queries
  - Native JSON operators and functions available

### 5. Comprehensive Indexing Strategy
- **Added**: Strategic indexes for common query patterns
- **Benefit**: Fast lookups for permission checks, file access, and reporting
- **Key Indexes**:
  - Permission checking: `user_organizations`, `org_permissions`, `user_permission_overrides`
  - File access: `files.organization_id`, `files.department_id`, `files.path`
  - User lookups: `users.organization_id`, `users.department_id`, `users.role`
  - JSONB search: GIN indexes on `tags`, `custom_metadata`, `metadata`, `asset_metadata`
  - Audit logs: Organization and user-based indexes for fast querying

### 6. Proper Timestamp Handling
- **Changed**: Use `TIMESTAMPTZ` (timestamp with timezone) instead of Unix timestamps
- **Benefit**: 
  - Human-readable timestamps in database
  - Automatic timezone handling
  - Standard SQL datetime functions available
  - Better integration with Supabase features

### 7. Soft Delete Pattern
- **Added**: `deleted_at` timestamp column to `files` table
- **Benefit**: 
  - Recoverable deletions
  - Audit trail preservation
  - Indexed for performance (`WHERE deleted_at IS NULL` and `WHERE deleted_at IS NOT NULL`)

### 8. Special Handling for "Global" Scope
- **Approach**: Use a specific UUID constant for organization-wide permissions instead of NULL
- **Alternative discussed**: Using NULL with proper query handling
- **Benefit**: Simplifies queries and indexing while maintaining clarity

### 9. Row Level Security (RLS) Ready
- **Design**: Schema structured to easily implement Supabase RLS policies
- **Benefit**: 
  - Automatic data isolation at the database level
  - Protection against accidental data leaks
  - Compliance with multi-tenant security requirements
- **Note**: Actual RLS policies need to be implemented in Supabase dashboard or via SQL

### 10. Audit Triggers
- **Added**: Automatic `updated_at` timestamp updates via triggers
- **Benefit**: 
  - No application-level burden for timestamp maintenance
  - Consistent audit trail across all tables
  - Reduced chance of human error

## Addressing Specific Requirements

### ✅ Organization Creation & Management
- **organizations table**: Core tenant entity with status, type, and features flags
- **organization_requests table**: Approval workflow for new organizations
- **org_gdrive_rules table**: Per-organization Google Drive governance policies
- **UNIQUE constraint on name**: Prevents duplicate organization names

### ✅ User Invitations & Role Assignment
- **user_organizations table**: Explicit mapping of users to organizations with roles
  - Prevents duplicate role assignments via UNIQUE constraint
  - Supports multiple organization membership (if needed)
- **users table**: 
  - `approval_status` field tracks invitation status (pending/active/rejected)
  - Linked to Supabase `auth.users` via foreign key
  - `status` field for active/pending/suspended states
- **Department-specific access**: `user_department_access` table for granular control

### ✅ Robust RBAC Without Overrides/Breaks
- **Permission Matrix**:
  - `org_permissions`: Defines what each role can do in each department/org
  - UNIQUE constraint prevents conflicting permission definitions
  - Supports organization-wide (global) and department-specific permissions
- **Permission Overrides**:
  - `user_permission_overrides`: Exception-based permission system
  - UNIQUE constraint prevents conflicting overrides for same user/org/dept
  - `all_department_access` flag for org-wide overrides
  - NULL values in override fields mean "use org_permissions default"
- **Permission Checking Flow** (application logic):
  1. Verify user belongs to file's organization via `user_organizations`
  2. If file has department_id, verify user has department access
  3. Get user's role(s) in that context
  4. Look up base permissions in `org_permissions`
  5. Apply any overrides from `user_permission_overrides` (NULL = use base)
  6. Check explicit shares in `shared` table
  7. Final decision: user can perform action if ANY path grants permission

### ✅ File Organization & Access Control
- **files table**: 
  - `organization_id` and `department_id` for multi-tenant scoping
  - `parent_id` for hierarchical folder structure (self-referencing)
  - `bucket_name` for storage organization
  - `user_id` for ownership tracking
  - `processing_status` for workflow tracking
  - `shared_count` for sharing metrics
  - `md5` for deduplication (indexed)
  - Rich metadata support via JSONB fields
- **Security**: 
  - Path-based uniqueness with soft delete: `UNIQUE(path, deleted_at)` equivalent via index
  - Organization/department scoping ensures tenant isolation
  - RLS ready for automatic data isolation

### ✅ Department Hierarchy & Inheritance
- **org_departments table**:
  - Self-referencing `parent_id` for unlimited hierarchy depth
  - `folder_id` maps to physical storage buckets (optional)
  - `gdrive_folder_id` for Google Drive integration
  - UNIQUE constraint on `(organization_id, name)` prevents duplicate dept names
- **Access Control**: 
  - Application logic can implement inheritance (parent dept access → child dept access)
  - Explicit `user_department_access` table allows fine-grained control
  - `org_permissions` supports both global and department-specific rules

### ✅ Integration Points Preserved
- **Google Drive**:
  - `gdrive_folders`: User-level GDrive integration credentials
  - `org_gdrive_rules`: Organization-level governance policies
  - `org_departments.gdrive_folder_id`: Department-to-GDrive folder mapping
- **BYOS (Bring Your Own Storage)**:
  - `byos_storage_configs`: Organization storage credentials
  - Supports AWS S3, Cloudflare R2, Google Cloud Storage
- **Audit & Compliance**:
  - `permission_audit_logs`: Track permission changes
  - `pipeline_audit_logs`: Track file processing events
  - Both include JSONB `changes`/`details` fields for rich audit data

### ✅ Performance Optimizations for Supabase
- **UUID Primary Keys**: Efficient in PostgreSQL with good distribution
- **Strategic Indexing**: Based on expected query patterns
- **JSONB + GIN Indexes**: Fast metadata searching and filtering
- **Partitioning Ready**: Tables designed for future partitioning if needed
- **Connection Friendly**: Proper use of foreign keys and constraints reduces application-level validation needs

## Migration Considerations from SQLite

### Data Type Mapping
| SQLite | PostgreSQL/Supabase | Notes |
|--------|---------------------|-------|
| TEXT | UUID/VARCHAR/TEXT | Use UUID for IDs, appropriate string types |
| INTEGER | INTEGER/BIGINT | Use BIGINT for file sizes |
| JSON | JSONB | Superior performance and features |
| Custom Type (JSON) | JSONB | Direct mapping |
| BOOLEAN (as INTEGER) | BOOLEAN | Proper boolean type |

### Migration Process
1. **Schema Creation**: Run the Supabase SQL script in a fresh database
2. **Data Export**: Export data from SQLite (JSON, CSV, etc.)
3. **Data Transformation**: 
   - Convert ID fields to UUIDs
   - Transform timestamps from Unix to TIMESTAMPTZ
   - Handle JSON data appropriately
   - Map any default values
4. **Data Import**: Use Supabase import tools or `psql`/`COPY` commands
5. **Validation**: 
   - Check row counts match
   - Verify foreign key constraints
   - Test permission checking logic
6. **Application Update**: 
   - Update database connection to Supabase
   - Modify any SQL queries for PostgreSQL syntax
   - Update timestamp handling in application code

## Security Features

### Defense-in-Depth Approach
1. **Database Level**:
   - Foreign key constraints prevent orphaned data
   - Unique constraints prevent duplicates
   - Check constraints (where applicable) validate data
   - RLS policies (to be implemented) provide automatic row-level security

2. **Application Level**:
   - Input validation and sanitization
   - Authentication via Supabase Auth
   - Permission checking logic (as described above)
   - Rate limiting and abuse prevention

3. **Network Level**:
   - Supabase provides built-in network security
   - SSL/TLS encryption for all connections
   - IP filtering options available

## Scalability Considerations

### Horizontal Scaling
- **Multi-tenancy**: Organization ID partitioning enables future sharding
- **Read Replicas**: Supabase supports read replicas for scaling read-heavy workloads
- **Connection Pooling**: Supabase includes PgBouncer for efficient connection handling

### Vertical Scaling
- **Proper Indexing**: Reduces query execution time and resource usage
- **Efficient Data Types**: UUIDs, INTEGERs, BOOLEANs are storage-efficient
- **JSONB Optimization**: GIN indexes make JSON querying practical at scale

### Caching Opportunities
- **Permission Cache**: Application can cache user permissions per organization
- **Metadata Cache**: Frequently accessed file metadata can be cached
- **Organization Config**: Organization settings and features change infrequently

## Implementation Notes for Application Developers

### Permission Checking Pseudocode
```python
def user_can_perform_action(user_id, file_id, action):
    # 1. Get file record
    file = get_file(file_id)
    if not file or file.deleted_at is not None:
        return False  # File doesn't exist or is deleted
    
    # 2. Verify organization access
    user_orgs = get_user_organizations(user_id)
    if file.organization_id not in [org.id for org in user_orgs]:
        return False  # Not in file's organization
    
    # 3. Verify department access (if file has department)
    if file.department_id:
        user_depts = get_user_departments(user_id, file.organization_id)
        if file.department_id not in [dept.id for dept in user_depts]:
            return False  # No access to file's department
    
    # 4. Determine effective roles
    roles = get_effective_roles(user_id, file.organization_id, file.department_id)
    
    # 5. Check base permissions
    base_permissions = get_org_permissions(file.organization_id, file.department_id, roles)
    
    # 6. Apply overrides
    overrides = get_user_permission_overrides(user_id, file.organization_id, file.department_id)
    effective_permissions = apply_overrides(base_permissions, overrides)
    
    # 7. Check for all-department overrides
    if not file.department_id:  # Global scope check
        all_dept_overrides = get_user_permission_overrides(
            user_id, file.organization_id, None  # Need to check for all-dept overrides
        )
        # Apply if all_department_access flag is set
        effective_permissions = apply_all_dept_overrides(effective_permissions, all_dept_overrides)
    
    # 8. Check explicit shares (may grant additional permissions)
    share_permissions = get_shared_file_permissions(file_id, user_id)
    effective_permissions = merge_permissions(effective_permissions, share_permissions)
    
    # 9. Final check
    return effective_permissions.get(action, False)
```

### Handling NULL vs Special UUID for "Global"
Two approaches for organization-wide permissions:

**Option A: Special UUID (used in this schema)**
- Pros: Simple queries, easy indexing, no NULL handling complexity
- Cons: Requires reserving a UUID, slightly less intuitive

**Option B: NULL with proper handling**
- Pros: More semantically correct (NULL = no specific department)
- Cons: More complex queries, need IS NULL handling, potential indexing challenges

The chosen approach uses a specific UUID constant that application logic treats as "global" or "organization-wide". This constant should be defined in application configuration.

### Recommended Application Constants
```javascript
// Application-level constants
const GLOBAL_DEPARTMENT_ID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000"; // org_default
```

## Conclusion

This Supabase-optimized PostgreSQL schema provides:

1. **Strong Data Integrity**: Foreign keys, unique constraints, and proper data types
2. **Robust Multi-tenancy**: Clean organization scoping with RLS readiness
3. **Flexible RBAC**: Role-based permissions with override capabilities
4. **High Performance**: Strategic indexing and efficient data types
5. **Supabase Compatibility**: Native PostgreSQL types and features
6. **Migration Readiness**: Clear path from SQLite with data transformation guidelines
7. **Extensibility**: Easy to add new features or modify existing ones
8. **Audit & Compliance**: Built-in audit trails for security and tracking

The schema is designed to prevent the specific concerns mentioned:
- **Override/break prevention**: Through UNIQUE constraints and proper permission matrix design
- **Duplication prevention**: Through unique constraints on critical relationships
- **RBAC integrity**: Through well-defined permission checking flow and database-enforced relationships
- **Data isolation**: Through organization scoping and RLS readiness

This foundation should support the Folder DAM application's growth while maintaining security, performance, and data integrity.