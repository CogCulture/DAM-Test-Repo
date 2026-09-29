import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const folderId = '01M3A3C4YZ8G2MTJ63MFM4FEA3';
const folder = db.prepare("SELECT * FROM files WHERE id = ?").get(folderId);
console.log("TARGET FOLDER ROW:", folder);

const children = db.prepare("SELECT id, name, type, content_type, parent_id, path FROM files WHERE parent_id = ? OR path LIKE ?").all(folderId, `%${folder?.name}%`);
console.log(`CHILDREN COUNT FOR ${folderId}:`, children.length);
console.log("CHILDREN DETAILS:", JSON.stringify(children, null, 2));

db.close();
