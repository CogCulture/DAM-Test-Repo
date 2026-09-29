import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Ensure Environment & DB Connection
// ---------------------------------------------------------------------------
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

describe('Supabase Database Workflow & RBAC Integration Tests', async () => {
  let useDrizzle, tables, eq, and, sql;
  let db;

  const testOrgId = `test_org_${Date.now()}`;
  const testDeptId = `test_dept_${Date.now()}`;
  const testUserId = `test_user_${Date.now()}`;
  const testFolderId = `test_folder_${Date.now()}`;
  const testFileId = `test_file_${Date.now()}`;

  before(async () => {
    const drizzleModule = await import('../server/utils/drizzle.ts');
    useDrizzle = drizzleModule.useDrizzle;
    tables = drizzleModule.tables;
    eq = drizzleModule.eq;
    and = drizzleModule.and;
    sql = drizzleModule.sql;

    db = useDrizzle();
    assert.ok(db, 'Database connection initialized');
  });

  after(async () => {
    // Cleanup test fixtures
    try {
      if (db) {
        await db.delete(tables.shared).where(eq(tables.shared.fileId, testFileId));
        await db.delete(tables.favorites).where(eq(tables.favorites.fileId, testFileId));
        await db.delete(tables.files).where(eq(tables.files.organizationId, testOrgId));
        await db.delete(tables.userPermissionOverrides).where(eq(tables.userPermissionOverrides.organizationId, testOrgId));
        await db.delete(tables.orgPermissions).where(eq(tables.orgPermissions.organizationId, testOrgId));
        await db.delete(tables.userDepartmentAccess).where(eq(tables.userDepartmentAccess.organizationId, testOrgId));
        await db.delete(tables.userOrganizations).where(eq(tables.userOrganizations.organizationId, testOrgId));
        await db.delete(tables.users).where(eq(tables.users.id, testUserId));
        await db.delete(tables.orgDepartments).where(eq(tables.orgDepartments.organizationId, testOrgId));
        await db.delete(tables.organizations).where(eq(tables.organizations.id, testOrgId));
      }
    } catch (e) {
      console.warn('Cleanup error (non-fatal):', e.message);
    }
  });

  test('Step 1: Create Organization in Supabase', async () => {
    const [inserted] = await db
      .insert(tables.organizations)
      .values({
        id: testOrgId,
        name: `Acme Corp ${Date.now()}`,
        status: 'active',
        orgType: 's3',
        setupComplete: true,
        features: {
          nomenclature: true,
          hierarchy: true,
          userPermissions: true,
          templateFolders: true,
        },
      })
      .returning();

    assert.ok(inserted);
    assert.equal(inserted.id, testOrgId);
    assert.equal(inserted.orgType, 's3');
    assert.equal(inserted.features.nomenclature, true);
  });

  test('Step 2: Create Department hierarchy in Supabase', async () => {
    const [dept] = await db
      .insert(tables.orgDepartments)
      .values({
        id: testDeptId,
        organizationId: testOrgId,
        name: 'Design & Marketing',
        parentId: null,
      })
      .returning();

    assert.ok(dept);
    assert.equal(dept.organizationId, testOrgId);
    assert.equal(dept.name, 'Design & Marketing');
  });

  test('Step 3: Register User & Map to Organization', async () => {
    const [user] = await db
      .insert(tables.users)
      .values({
        id: testUserId,
        name: 'Alex Rivera',
        email: `alex_${Date.now()}@example.com`,
        status: 'active',
        role: 'team_member',
        departmentId: testDeptId,
        organizationId: testOrgId,
        approvalStatus: 'active',
      })
      .returning();

    assert.ok(user);
    assert.equal(user.id, testUserId);

    const [userOrg] = await db
      .insert(tables.userOrganizations)
      .values({
        id: `uo_${Date.now()}`,
        userId: testUserId,
        organizationId: testOrgId,
        role: 'team_member',
      })
      .returning();

    assert.ok(userOrg);
    assert.equal(userOrg.userId, testUserId);
  });

  test('Step 4: Configure Role Permissions & Overrides', async () => {
    // 1. Base permission for team_member
    const [perm] = await db
      .insert(tables.orgPermissions)
      .values({
        id: `perm_${Date.now()}`,
        organizationId: testOrgId,
        departmentId: 'global',
        role: 'team_member',
        canView: true,
        canUpload: true,
        canDownload: true,
        canDelete: false,
        canShare: true,
      })
      .returning();

    assert.ok(perm);
    assert.equal(perm.canDelete, false);
    assert.equal(perm.canShare, true);

    // 2. User exception override (grant canDelete to this specific user)
    const [override] = await db
      .insert(tables.userPermissionOverrides)
      .values({
        id: `override_${Date.now()}`,
        userId: testUserId,
        organizationId: testOrgId,
        departmentId: testDeptId,
        canDelete: true,
        allDepartmentAccess: false,
      })
      .returning();

    assert.ok(override);
    assert.equal(override.canDelete, true);
  });

  test('Step 5: Create Virtual Root Folder and Child File', async () => {
    // 1. Folder at root level
    const [folder] = await db
      .insert(tables.files)
      .values({
        id: testFolderId,
        name: 'Brand Guidelines 2026',
        contentType: 'application/vnd.folder',
        type: 'folder',
        size: 0,
        path: 'org/Brand Guidelines 2026',
        parentId: 'root', // Virtual root
        bucketName: 'org',
        userId: testUserId,
        organizationId: testOrgId,
        departmentId: testDeptId,
      })
      .returning();

    assert.ok(folder);
    assert.equal(folder.parentId, 'root');
    assert.equal(folder.type, 'folder');

    // 2. Asset file inside folder with rich JSONB metadata
    const [file] = await db
      .insert(tables.files)
      .values({
        id: testFileId,
        name: 'logo_presentation.pdf',
        contentType: 'application/pdf',
        type: 'file',
        size: 1048576,
        path: 'org/Brand Guidelines 2026/logo_presentation.pdf',
        parentId: testFolderId,
        bucketName: 'org',
        userId: testUserId,
        organizationId: testOrgId,
        departmentId: testDeptId,
        tags: ['vector', 'brand', 'q1-2026'],
        customMetadata: { campaign: 'Global Rebrand', version: '2.0', status: 'approved' },
        assetMetadata: { source: 'design_team', pages: 12, dpi: 300 },
        count: 1,
      })
      .returning();

    assert.ok(file);
    assert.equal(file.parentId, testFolderId);
    assert.deepEqual(file.tags, ['vector', 'brand', 'q1-2026']);
    assert.equal(file.customMetadata.campaign, 'Global Rebrand');
  });

  test('Step 6: Query with json_extract compatibility function in Supabase', async () => {
    // Verify our json_extract compatibility function works in PostgreSQL
    const results = await db
      .select({
        id: tables.files.id,
        name: tables.files.name,
      })
      .from(tables.files)
      .where(
        and(
          eq(tables.files.organizationId, testOrgId),
          sql`json_extract(${tables.files.assetMetadata}, '$.source') = 'design_team'`
        )
      );

    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'logo_presentation.pdf');
  });

  test('Step 7: Favorite & Share Asset', async () => {
    const [fav] = await db
      .insert(tables.favorites)
      .values({
        fileId: testFileId,
        userId: testUserId,
        organizationId: testOrgId,
      })
      .returning();

    assert.ok(fav);
    assert.equal(fav.fileId, testFileId);

    const [sh] = await db
      .insert(tables.shared)
      .values({
        fileId: testFileId,
        userId: testUserId,
        role: 'editor',
        organizationId: testOrgId,
      })
      .returning();

    assert.ok(sh);
    assert.equal(sh.role, 'editor');
  });

  test('Step 8: Soft Delete and Filter Test', async () => {
    // Soft delete the file
    const now = new Date();
    await db
      .update(tables.files)
      .set({ deletedAt: now })
      .where(eq(tables.files.id, testFileId));

    // Normal active files query should exclude deleted
    const activeFiles = await db
      .select()
      .from(tables.files)
      .where(
        and(
          eq(tables.files.organizationId, testOrgId),
          sql`${tables.files.deletedAt} IS NULL`
        )
      );

    // Only folder should be active, file is deleted
    assert.equal(activeFiles.length, 1);
    assert.equal(activeFiles[0].id, testFolderId);

    // Trash query should return deleted item
    const trashFiles = await db
      .select()
      .from(tables.files)
      .where(
        and(
          eq(tables.files.organizationId, testOrgId),
          sql`${tables.files.deletedAt} IS NOT NULL`
        )
      );

    assert.equal(trashFiles.length, 1);
    assert.equal(trashFiles[0].id, testFileId);
  });
});
