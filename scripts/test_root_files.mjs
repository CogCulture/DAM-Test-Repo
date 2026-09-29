import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const rows = db.prepare(`
  SELECT id, name, type, content_type, parent_id, path, deleted_at, asset_metadata
  FROM files
  WHERE (parent_id = 'root' OR parent_id IS NULL)
  AND deleted_at IS NULL
`).all();

console.log("ROOT ITEMS IN DB (count):", rows.length);
console.log("ROOT ITEMS DETAILS:");
rows.forEach(r => {
  console.log(`- [${r.type}] ${r.name} (id: ${r.id}, parent: ${r.parent_id}) metadata: ${r.asset_metadata}`);
});

db.close();
