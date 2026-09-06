const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");
const logger = require("./logger");

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
const db = new Database(config.dbFile);

db.pragma("journal_mode = WAL");        // readers never block the writer
db.pragma("foreign_keys = ON");         // the schema's relations are enforced, not decorative
db.pragma("busy_timeout = 5000");       // wait rather than throw under concurrent writes
db.pragma("synchronous = NORMAL");      // safe with WAL, much faster than FULL
db.pragma("trusted_schema = OFF");

// Every write runs in a transaction; a half-applied trip is worse than a failed one.
const tx = (fn) => db.transaction(fn);

const now = () => new Date().toISOString();

process.on("exit", () => { try { db.close(); } catch (e) {} });

logger.debug("database opened", { file: config.dbFile });
module.exports = db;
module.exports.tx = tx;
module.exports.now = now;
