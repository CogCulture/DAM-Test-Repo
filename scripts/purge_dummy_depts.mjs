import Database from 'better-sqlite3';

const db = new Database('data/sqlite.db');
const res = db.prepare(`DELETE FROM org_departments WHERE id IN ('dept_product', 'dept_design', 'dept_marketing', 'dept_finance', 'dept_ui', 'dept_3d')`).run();
db.prepare(`UPDATE files SET department_id = NULL WHERE department_id = 'dept_product'`).run();

console.log(`Deleted ${res.changes} dummy departments.`);
const remaining = db.prepare('SELECT * FROM org_departments').all();
console.log('Remaining departments in database:', remaining);
