import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const folderId = '01M3A3C4YZ8G2MTJ63MFM4FEA3';
const folder = db.prepare("SELECT * FROM files WHERE id = ?").get(folderId);

console.log("FOLDER PATH:", folder.path);

const directChildren = db.prepare(`
  SELECT id, name, type, parent_id, path
  FROM files
  WHERE path LIKE 'org/Airbnb_Assignment_Tanish-Gahot/%'
  AND path NOT LIKE 'org/Airbnb_Assignment_Tanish-Gahot/%/%'
`).all();

console.log("DIRECT CHILDREN COUNT BY PATH:", directChildren.length);
console.log("DIRECT CHILDREN ROWS:", JSON.stringify(directChildren, null, 2));

db.close();
