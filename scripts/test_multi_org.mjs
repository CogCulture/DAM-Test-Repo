import Database from 'better-sqlite3';
const db = new Database('data/sqlite.db');

console.log('--- Multi-Org Verification ---');
const orgs = db.prepare('SELECT id, name, org_type FROM organizations').all();
console.log('Organizations:', orgs);

const userOrgs = db.prepare('SELECT * FROM user_organizations').all();
console.log('User Memberships:', userOrgs);

const depts = db.prepare('SELECT id, name, organization_id FROM org_departments').all();
console.log('Departments (should be 0 pre-built):', depts.length, depts);

console.log('--- Verification Complete ---');
