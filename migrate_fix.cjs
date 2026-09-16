const Database = require('better-sqlite3');
const db = new Database('data/sqlite.db');

// Check organizations table
try {
  const orgs = db.prepare("SELECT * FROM organizations").all();
  console.log("Organizations:", JSON.stringify(orgs, null, 2));
} catch(e) {
  console.log("No organizations table:", e.message);
}

// The bucket's organization_id should match the user's organization_id
// Update bucket to match user's org
const user = db.prepare("SELECT organization_id FROM users WHERE role = 'admin' LIMIT 1").get();
if (user) {
  console.log("Admin user org:", user.organization_id);
  db.prepare("UPDATE buckets SET organization_id = ? WHERE name = 'org'").run(user.organization_id);
  console.log("Updated bucket org_id to match admin user");
}

// Verify
const bucket = db.prepare("SELECT * FROM buckets WHERE name = 'org'").get();
console.log("Updated bucket:", JSON.stringify(bucket, null, 2));

db.close();
