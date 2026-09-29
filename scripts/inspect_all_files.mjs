import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const allFiles = db.prepare(`
  SELECT id, name, type, path, parent_id
  FROM files
  WHERE type != 'folder'
  AND deleted_at IS NULL
  LIMIT 50
`).all();

console.log("ALL FILES IN DB (count:", allFiles.length, "):");
console.log(JSON.stringify(allFiles, null, 2));

db.close();
