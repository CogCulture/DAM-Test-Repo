import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

// Let's test finding files with parent_id = '01M2Q4GPJ4R810QRZYCVQ91QB9' (Clients folder)
const parentId = '01M2Q4GPJ4R810QRZYCVQ91QB9';
const childFiles = db.prepare("SELECT id, name, type, parent_id FROM files WHERE parent_id = ?").all(parentId);
console.log(`Child files of folder '${parentId}' count:`, childFiles.length);
console.log(JSON.stringify(childFiles, null, 2));

db.close();
