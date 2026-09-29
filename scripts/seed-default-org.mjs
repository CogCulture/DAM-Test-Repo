import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL=(.+)/);
const dbUrl = match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;

const sql = postgres(dbUrl, { ssl: 'require', prepare: false });

async function seedDefaultOrg() {
  console.log('Seeding org_default into Supabase...');

  // 1. Insert org_default into organizations
  await sql`
    INSERT INTO organizations (id, name, status, org_type, setup_complete, features)
    VALUES (
      'org_default',
      'Default Organization',
      'active',
      's3',
      true,
      '{"nomenclature": true, "hierarchy": true, "userPermissions": true, "templateFolders": true}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET status = 'active';
  `;
  console.log('✅ organizations seeded with org_default');

  // 2. Insert default org_permissions for org_default
  const roles = ['dept_head', 'team_lead', 'team_member', 'guest'];
  for (const r of roles) {
    await sql`
      INSERT INTO org_permissions (
        id, organization_id, department_id, role,
        can_view, can_upload, can_download, can_delete,
        can_create_folder, can_approve_users, can_edit_nomenclature,
        can_share, can_rename, can_edit_metadata, can_use_rag
      )
      VALUES (
        gen_random_uuid()::text, 'org_default', 'global', ${r},
        true, true, true, ${r === 'dept_head' || r === 'team_lead'},
        ${r === 'dept_head' || r === 'team_lead'}, ${r === 'dept_head'}, ${r === 'dept_head'},
        ${r === 'dept_head' || r === 'team_lead'}, ${r === 'dept_head' || r === 'team_lead'},
        ${r === 'dept_head' || r === 'team_lead'}, ${r !== 'guest' && r !== 'intern'}
      )
      ON CONFLICT (organization_id, department_id, role) DO NOTHING;
    `;
  }
  console.log('✅ org_permissions seeded for org_default');

  const checkOrgs = await sql`SELECT id, name FROM organizations`;
  console.log('Current organizations in DB:', checkOrgs);

  const checkPerms = await sql`SELECT role, organization_id, department_id FROM org_permissions`;
  console.log('Current permissions in DB:', checkPerms);

  await sql.end();
}

seedDefaultOrg().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
