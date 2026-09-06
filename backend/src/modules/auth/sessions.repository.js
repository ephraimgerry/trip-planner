// Session storage. Written now so enabling auth is a routing change, not a
// schema change. Nothing calls create() yet.
const db = require("../../core/db");
const { id, now } = { id: require("../../core/ids").id, now: require("../../core/db").now };

const create = ({ userId, tokenHash, ip, userAgent, expiresAt }) => {
  const sid = id("ses");
  db.prepare(`INSERT INTO sessions (id,user_id,token_hash,ip,user_agent,expires_at,created_at)
              VALUES (?,?,?,?,?,?,?)`).run(sid, userId, tokenHash, ip, userAgent, expiresAt, now());
  return sid;
};
const findValid = (tokenHash) => db.prepare(
  `SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`
).get(tokenHash, now());
const touch = (sid) => db.prepare(`UPDATE sessions SET created_at = created_at WHERE id = ?`).run(sid);
const revoke = (sid) => db.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).run(now(), sid);
const revokeAllFor = (userId) => db.prepare(
  `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(now(), userId);

module.exports = { create, findValid, touch, revoke, revokeAllFor };
