const db = require("../../core/db");
const { id } = require("../../core/ids");
const now = db.now;

const byId = (uid) => db.prepare("SELECT * FROM users WHERE id = ?").get(uid);
const byEmail = (email) => db.prepare("SELECT * FROM users WHERE email = ?").get(email);
const list = () => db.prepare("SELECT id,email,name,status,role,created_at FROM users ORDER BY created_at").all();

function create({ email, name, role = "member", status = "invited" }) {
  const uid = id("usr");
  db.prepare(`INSERT INTO users (id,email,name,status,role,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?)`).run(uid, email, name || null, status, role, now(), now());
  db.prepare("INSERT INTO user_settings (user_id,prefs,updated_at) VALUES (?,?,?)").run(uid, "{}", now());
  return byId(uid);
}

// The single local user that bypass mode runs as. Idempotent.
function ensureLocalUser(email) {
  return byEmail(email) || create({ email, name: "Me", role: "admin", status: "active" });
}

const prefs = (uid) => {
  const r = db.prepare("SELECT prefs FROM user_settings WHERE user_id = ?").get(uid);
  try { return r ? JSON.parse(r.prefs) : {}; } catch (e) { return {}; }
};
const savePrefs = (uid, obj) => db.prepare(
  `INSERT INTO user_settings (user_id,prefs,updated_at) VALUES (?,?,?)
   ON CONFLICT(user_id) DO UPDATE SET prefs = excluded.prefs, updated_at = excluded.updated_at`
).run(uid, JSON.stringify(obj || {}), now());

module.exports = { byId, byEmail, list, create, ensureLocalUser, prefs, savePrefs };
