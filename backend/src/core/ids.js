const crypto = require("crypto");

// Lexicographically sortable, collision-resistant, URL-safe.
// Time prefix means "ORDER BY id" is roughly "ORDER BY created_at".
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
function encodeTime(ms, len) {
  let out = "";
  for (let i = len - 1; i >= 0; i--) { out = ALPHABET[ms % 32] + out; ms = Math.floor(ms / 32); }
  return out;
}
function id(prefix) {
  const rand = crypto.randomBytes(10);
  let tail = "";
  for (const b of rand) tail += ALPHABET[b % 32];
  const core = encodeTime(Date.now(), 10) + tail;
  return prefix ? `${prefix}_${core}` : core;
}

// Stable, readable ids for seeded reference data (countries, areas, districts).
const slug = (s, max = 48) => String(s || "").toLowerCase().trim()
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max);

const token = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

module.exports = { id, slug, token, hashToken };
