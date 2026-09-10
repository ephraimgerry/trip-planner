// Brands: the shared identity behind several places. Small on purpose — the
// interesting data still lives on each branch.
const db = require("../../core/db");
const { id } = require("../../core/ids");
const now = db.now;

const COLS = "id,name,name_local,link,description,created_by,created_at";

const all = () => db.prepare(`SELECT ${COLS} FROM brands ORDER BY name`).all();
const byId = (bid) => db.prepare(`SELECT ${COLS} FROM brands WHERE id = ?`).get(bid);
const byName = (name) => db.prepare(`SELECT ${COLS} FROM brands WHERE name = ?`).get(name);

function create(b, userId) {
  const bid = b.id || id("brd");
  db.prepare(`INSERT INTO brands (id,name,name_local,link,description,created_by,created_at)
              VALUES (@id,@name,@name_local,@link,@description,@created_by,@ts)`)
    .run({
      id: bid, name: b.name, name_local: b.nameLocal || null, link: b.link || null,
      description: b.description || null, created_by: userId || null, ts: now(),
    });
  return byId(bid);
}

const FIELDS = { name: "name", nameLocal: "name_local", link: "link", description: "description" };
function update(bid, patch) {
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(FIELDS))
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); vals.push(patch[k]); }
  if (sets.length) db.prepare(`UPDATE brands SET ${sets.join(", ")} WHERE id = ?`).run(...vals, bid);
  return byId(bid);
}

// Deleting a brand only unlinks it — the branches themselves are untouched.
const remove = (bid) => db.prepare("DELETE FROM brands WHERE id = ?").run(bid);

// How many places point at each brand, so the client can say "3 branches"
// without walking the whole catalogue.
const counts = () => {
  const out = {};
  for (const r of db.prepare(
    "SELECT brand_id, count(*) n FROM places WHERE brand_id IS NOT NULL GROUP BY brand_id").all())
    out[r.brand_id] = r.n;
  return out;
};

// Derive brands from the naming habit already in the catalogue: "Brand (Branch)",
// but only where the same prefix appears more than once — a lone parenthetical is
// far more likely to be a translation ("Grandma\'s Home (Waipojia)") than a branch.
//
// Migration 008 does exactly this in SQL for databases that already had places in
// them. This is the same rule for the other direction: a fresh install, where the
// seed runs *after* the migrations and so has nothing to backfill from.
function deriveFromNames() {
  const rows = db.prepare("SELECT id, name FROM places WHERE brand_id IS NULL").all();
  const split = (name) => {
    const i = name.indexOf(" (");
    if (i < 1 || !name.trim().endsWith(")")) return null;
    return { base: name.slice(0, i).trim(), branch: name.slice(i + 2, name.length - 1).trim() };
  };
  const groups = new Map();
  for (const r of rows) {
    const parts = split(r.name);
    if (!parts || !parts.base || !parts.branch) continue;
    if (!groups.has(parts.base)) groups.set(parts.base, []);
    groups.get(parts.base).push({ id: r.id, branch: parts.branch });
  }
  const link = db.prepare("UPDATE places SET brand_id = ?, branch = ? WHERE id = ?");
  let brands = 0, linked = 0;
  db.transaction(() => {
    for (const [name, members] of groups) {
      if (members.length < 2) continue;
      const brand = byName(name) || (brands++, create({ name }, null));
      for (const m of members) { link.run(brand.id, m.branch, m.id); linked++; }
    }
  })();
  return { brands, linked };
}

module.exports = { all, byId, byName, create, update, remove, counts, deriveFromNames };
