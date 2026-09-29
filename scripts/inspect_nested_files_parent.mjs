import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const nestedFiles = db.prepare(`
  SELECT id, name, type, path, parent_id
  FROM files
  WHERE type != 'folder'
  AND path LIKE 'org/%/%'
  LIMIT 20
`).all();

console.log("NESTED FILES IN DB (count:", nestedFiles.length, "):");
console.log(JSON.stringify(nestedFiles, null, 2));

db.close();
