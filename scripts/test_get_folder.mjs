import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const testIds = ["01M2Q4GPHZ167YMR0B25KDEQ61", "Cog Culture Repository", "org/Cog Culture Repository clients part/Cog Culture Repository"];

for (const rawId of testIds) {
  const row = db.prepare(`
    SELECT id, name, type, path FROM files
    WHERE (id = ? OR path = ? OR path = ? OR (type = 'folder' AND name = ?))
    LIMIT 1
  `).get(rawId, rawId, `org/${rawId}`, rawId);
  console.log(`Query '${rawId}' =>`, row);
}

db.close();
