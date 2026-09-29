import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');
const rows = db.prepare("SELECT id, name, type, path, parent_id FROM files WHERE type = 'folder' LIMIT 20").all();
console.log("FOLDER ROWS IN DB:");
console.log(JSON.stringify(rows, null, 2));
db.close();
