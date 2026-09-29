import Database from 'better-sqlite3';
const db = new Database('./data/sqlite.db');

const queryString = { page: "1", sortBy: "createdAt", order: "desc" };

// Replicate getFiles query filters for root
const sqlQuery = `
  SELECT f.id, f.name, f.type, f.content_type, f.parent_id, f.path, f.created_at, f.asset_metadata
  FROM files f
  WHERE f.organization_id = '01M2MFMBB617993QXRP4BYS8BX'
  AND f.deleted_at IS NULL
  AND (json_extract(f.asset_metadata, '$.source') IS NULL OR json_extract(f.asset_metadata, '$.source') != 'rag')
  AND f.name NOT LIKE '%_parsed.md'
  AND (f.parent_id = 'root' OR f.parent_id IS NULL)
  ORDER BY (CASE WHEN f.type = 'folder' THEN 0 ELSE 1 END) ASC, f.created_at DESC
`;

const rows = db.prepare(sqlQuery).all();
console.log("TOTAL ROOT ROWS RETURNED FROM DB QUERY:", rows.length);
console.log("FOLDERS COUNT:", rows.filter(r => r.type === 'folder').length);
console.log("FILES COUNT:", rows.filter(r => r.type !== 'folder').length);

console.log("\nALL RETURNED ROOT ITEMS:");
rows.forEach((r, index) => {
  console.log(`${index + 1}. [${r.type}] ${r.name} (id: ${r.id}, parent: ${r.parent_id})`);
});

db.close();
