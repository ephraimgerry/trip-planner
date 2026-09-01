const crypto = require("crypto");
const db = require("../../core/db");

const getByEmail = (email) => db.prepare("SELECT * FROM users WHERE email = ?").get(email);

function upsertUser({ email, name }) {
  const id = crypto.createHash("sha1").update(email).digest("hex").slice(0, 16);
  db.prepare(
    "INSERT INTO users(id, email, name, created_at) VALUES(?,?,?,?) " +
    "ON CONFLICT(email) DO UPDATE SET name = excluded.name"
  ).run(id, email, name || email, new Date().toISOString());
  return getByEmail(email);
}
module.exports = { getByEmail, upsertUser };
