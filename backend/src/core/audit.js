// Append-only record of who changed what. On a shared trip this is the only way
// to answer "who moved that?" — and it is cheap enough to always be on.
const db = require("./db");
const { id } = require("./ids");
const logger = require("./logger");

function record(req, action, entity, entityId, detail) {
  try {
    db.prepare(`INSERT INTO audit_log (id,actor_id,action,entity,entity_id,detail,ip,created_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(id("aud"), (req.user && req.user.id) || null, action, entity, entityId || null,
           detail ? JSON.stringify(detail).slice(0, 2000) : null, req.clientIp || null, db.now());
  } catch (e) {
    // Auditing must never be the reason a user's edit fails.
    logger.warn("audit write failed", { err: e.message, action });
  }
}
module.exports = { record };
