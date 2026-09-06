const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");
const logger = require("./logger");

const dir = path.join(__dirname, "..", "..", "db", "migrations");
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT)`);

const applied = new Map(
  db.prepare("SELECT name, checksum FROM _migrations").all().map(r => [r.name, r.checksum]));

let ran = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  const sum = crypto.createHash("sha256").update(sql).digest("hex").slice(0, 16);
  if (applied.has(f)) {
    // An edited migration means the database and the repo disagree about history.
    if (applied.get(f) && applied.get(f) !== sum)
      logger.warn("migration changed after it was applied", { file: f });
    continue;
  }
  // A migration that rebuilds a table (SQLite can't alter a CHECK) has to drop
  // and recreate it while other tables still reference it. Foreign keys are
  // suspended for the duration and verified before the transaction commits, so
  // a migration that leaves a dangling reference fails instead of landing.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(sql);
      const broken = db.pragma("foreign_key_check");
      if (broken.length) {
        throw new Error(`migration ${f} would leave ${broken.length} dangling reference(s): `
          + JSON.stringify(broken.slice(0, 5)));
      }
      db.prepare("INSERT INTO _migrations (name,checksum,applied_at) VALUES (?,?,?)")
        .run(f, sum, new Date().toISOString());
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
  logger.info("migration applied", { file: f });
  ran++;
}
if (ran) logger.info("migrations complete", { applied: ran });
module.exports = db;
