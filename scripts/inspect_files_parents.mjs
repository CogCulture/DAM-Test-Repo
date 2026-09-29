import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const counts = db.prepare(`
  SELECT type, parent_id, COUNT(*) as cnt
  FROM files
  WHERE deleted_at IS NULL
  GROUP BY type, parent_id
`).all();

console.log("FILES BY TYPE & PARENT_ID:");
console.log(JSON.stringify(counts, null, 2));

db.close();
