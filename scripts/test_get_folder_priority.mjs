import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const targetId = '01M3A3C4YZ8G2MTJ63MFM4FEA3';

// Current getFolder behavior (unordered OR)
const currentMatch = db.prepare(`
  SELECT id, name, path, deleted_at FROM files
  WHERE (id = ? OR path = ? OR (type = 'folder' AND name = ?))
  AND deleted_at IS NULL
  LIMIT 1
`).get(targetId, targetId, targetId);

console.log("Current getFolder returned:", currentMatch);

// Exact ID match first
const exactIdMatch = db.prepare("SELECT id, name, path, deleted_at FROM files WHERE id = ? AND deleted_at IS NULL").get(targetId);
console.log("Exact ID match returned:", exactIdMatch);

db.close();
