import Database from 'better-sqlite3';
const db = new Database('data/sqlite.db');

const rows = db.prepare(`SELECT id, name, path, parent_id, count, created_at FROM files WHERE type = 'folder' ORDER BY created_at DESC LIMIT 15`).all();
console.log('Recent folders:', rows);

// Check if there are files with parentId of any recent folder
for (const r of rows.slice(0, 5)) {
  const childFiles = db.prepare(`SELECT id, name, type, parent_id FROM files WHERE parent_id = ? AND deleted_at IS NULL LIMIT 5`).all(r.id);
  console.log(`Folder "${r.name}" (${r.id}) children:`, childFiles);
}
