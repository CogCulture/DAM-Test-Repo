import Database from 'better-sqlite3';

const db = new Database('data/sqlite.db');

// 1. Create user_organizations table
db.exec(`
  CREATE TABLE IF NOT EXISTS user_organizations (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'team_member',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_user_orgs_unique ON user_organizations (user_id, organization_id);
  CREATE INDEX IF NOT EXISTS idx_user_orgs_user ON user_organizations (user_id);
  CREATE INDEX IF NOT EXISTS idx_user_orgs_org ON user_organizations (organization_id);
`);

console.log('user_organizations table ensured.');

// 2. Backfill existing users into user_organizations
const users = db.prepare('SELECT id, role, organization_id FROM users WHERE organization_id IS NOT NULL').all();
const insert = db.prepare(`
  INSERT OR IGNORE INTO user_organizations (id, user_id, organization_id, role, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let count = 0;
const now = Math.floor(Date.now() / 1000);
for (const u of users) {
  const id = `uo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const res = insert.run(id, u.id, u.organization_id, u.role || 'team_member', now, now);
  if (res.changes > 0) count++;
}

console.log(`Backfilled ${count} user organization memberships.`);
const memberships = db.prepare('SELECT * FROM user_organizations').all();
console.log('Current memberships:', memberships);
