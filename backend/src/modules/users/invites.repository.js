// Invite-only sign-up. Tokens are stored hashed; the plaintext is shown once
// to whoever creates the invite and never persisted.
const db = require("../../core/db");
const { id, token, hashToken } = require("../../core/ids");
const config = require("../../core/config");
const now = db.now;

function create({ email, role = "member", invitedBy }) {
  const raw = token(32);
  const expires = new Date(Date.now() + config.auth.inviteTtlDays * 864e5).toISOString();
  const iid = id("inv");
  db.prepare(`INSERT INTO invites (id,email,token_hash,role,invited_by,expires_at,created_at)
              VALUES (?,?,?,?,?,?,?)`).run(iid, email, hashToken(raw), role, invitedBy || null, expires, now());
  return { id: iid, email, role, expiresAt: expires, token: raw };
}
const findValid = (raw) => db.prepare(
  `SELECT * FROM invites WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`
).get(hashToken(raw), now());
const markAccepted = (iid, userId) => db.prepare(
  "UPDATE invites SET accepted_at = ?, accepted_by = ? WHERE id = ?").run(now(), userId, iid);
const revoke = (iid) => db.prepare("UPDATE invites SET revoked_at = ? WHERE id = ?").run(now(), iid);
const list = () => db.prepare(
  "SELECT id,email,role,expires_at,accepted_at,revoked_at,created_at FROM invites ORDER BY created_at DESC").all();

module.exports = { create, findValid, markAccepted, revoke, list };
