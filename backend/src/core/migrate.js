const fs = require("fs");
const path = require("path");
const db = require("./db");

const dir = path.join(__dirname, "..", "..", "db", "migrations");
db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT)");
const applied = new Set(db.prepare("SELECT name FROM _migrations").all().map(r => r.name));

for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
  if (applied.has(f)) continue;
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  const run = db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO _migrations(name, applied_at) VALUES(?, ?)").run(f, new Date().toISOString());
  });
  run();
  console.log("[migrate] applied", f);
}
console.log("[migrate] up to date");
module.exports = db;
