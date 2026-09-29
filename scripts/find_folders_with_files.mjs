import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const foldersWithFiles = db.prepare(`
  SELECT f.id, f.name, f.path, COUNT(c.id) as file_count
  FROM files f
  JOIN files c ON c.parent_id = f.id
  WHERE f.type = 'folder'
  AND c.type != 'folder'
  AND f.deleted_at IS NULL
  AND c.deleted_at IS NULL
  GROUP BY f.id
  ORDER BY file_count DESC
`).all();

console.log("FOLDERS THAT CONTAIN REAL FILES (Count:", foldersWithFiles.length, "):");
console.log(JSON.stringify(foldersWithFiles.slice(0, 20), null, 2));

db.close();
