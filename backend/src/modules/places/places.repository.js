const crypto = require("crypto");
const db = require("../../core/db");

const toPlace = (r) => r && ({ ...r, image_urls: r.image_urls ? JSON.parse(r.image_urls) : [] });
const COLS = "id,name,name_cn,category,sub,city,district,lat,lng,link,description,source,image_urls,created_at";

function list({ city, category, q, limit = 2000 } = {}) {
  let sql = "SELECT * FROM places WHERE 1=1"; const args = [];
  if (city) { sql += " AND city = ?"; args.push(city); }
  if (category) { sql += " AND category = ?"; args.push(category); }
  if (q) { sql += " AND (name LIKE ? OR name_cn LIKE ?)"; args.push("%" + q + "%", "%" + q + "%"); }
  sql += " ORDER BY name LIMIT ?"; args.push(Number(limit));
  return db.prepare(sql).all(...args).map(toPlace);
}
const get = (id) => toPlace(db.prepare("SELECT * FROM places WHERE id = ?").get(id));

function rowOf(p, id) {
  return {
    id, name: p.name, name_cn: p.name_cn || "", category: p.category, sub: p.sub || null,
    city: p.city || null, district: p.district || null, lat: p.lat, lng: p.lng,
    link: p.link || null, description: p.description || null, source: p.source || null,
    image_urls: JSON.stringify(p.image_urls || []), created_at: p.created_at || new Date().toISOString(),
  };
}
function create(p) {
  const id = p.id || "p-" + crypto.randomUUID().slice(0, 8);
  db.prepare(`INSERT INTO places(${COLS}) VALUES(@${COLS.split(",").join(",@")})`).run(rowOf(p, id));
  return get(id);
}
function update(id, patch) {
  const cur = get(id); if (!cur) return null;
  const n = { ...cur, ...patch };
  db.prepare(`UPDATE places SET name=@name,name_cn=@name_cn,category=@category,sub=@sub,city=@city,
    district=@district,lat=@lat,lng=@lng,link=@link,description=@description,source=@source,image_urls=@image_urls
    WHERE id=@id`).run(rowOf(n, id));
  return get(id);
}
const remove = (id) => db.prepare("DELETE FROM places WHERE id = ?").run(id).changes > 0;
function bulkInsert(places) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO places(${COLS}) VALUES(@${COLS.split(",").join(",@")})`);
  db.transaction((rows) => rows.forEach((r) => stmt.run(r)))(places.map((p) => rowOf(p, p.id)));
}
module.exports = { list, get, create, update, remove, bulkInsert };
