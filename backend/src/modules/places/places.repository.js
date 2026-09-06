const db = require("../../core/db");
const { id } = require("../../core/ids");
const now = db.now;

const COLS = `id,kind,name,name_local,category,country_code,area_id,district_id,
              lat,lng,address,link,description,source,attrs,visibility,created_by,created_at`;

// attrs is stored as text; every caller wants it as an object
const hydrate = (p) => {
  if (!p) return p;
  let attrs = {};
  try { attrs = JSON.parse(p.attrs || "{}"); } catch (e) {}
  return { ...p, attrs };
};

// A user sees the public catalogue plus their own private pins — never anyone else's.
const visibleTo = (userId) => db.prepare(
  `SELECT ${COLS} FROM places WHERE visibility = 'public' OR created_by = ? ORDER BY name`
).all(userId || "").map(hydrate);

const byId = (pid) => hydrate(db.prepare(`SELECT ${COLS} FROM places WHERE id = ?`).get(pid));

const imagesFor = (pid) => db.prepare(
  "SELECT url FROM place_images WHERE place_id = ? ORDER BY ord").all(pid).map(r => r.url);
const allImages = () => {
  const out = {};
  for (const r of db.prepare("SELECT place_id,url FROM place_images ORDER BY place_id, ord").all())
    (out[r.place_id] ||= []).push(r.url);
  return out;
};

function create(p, userId) {
  const pid = p.id || id(p.kind === "lodging" ? "htl" : "plc");
  db.prepare(`INSERT INTO places (id,kind,name,name_local,category,country_code,area_id,district_id,
                lat,lng,address,link,description,source,attrs,visibility,created_by,created_at,updated_at)
              VALUES (@id,@kind,@name,@name_local,@category,@country_code,@area_id,@district_id,
                @lat,@lng,@address,@link,@description,@source,@attrs,@visibility,@created_by,@ts,@ts)`)
    .run({
      id: pid, kind: p.kind || "poi", name: p.name, name_local: p.nameLocal || null,
      category: p.category || null, country_code: p.countryCode || null, area_id: p.areaId || null,
      district_id: p.districtId || null, lat: p.lat ?? null, lng: p.lng ?? null,
      address: p.address || null, link: p.link || null, description: p.description || null,
      source: p.source || null, visibility: p.visibility || "public",
      attrs: JSON.stringify(p.attrs || {}),
      created_by: userId || null, ts: now(),
    });
  if (p.images) setImages(pid, p.images);
  return byId(pid);
}

const FIELDS = { name: "name", nameLocal: "name_local", category: "category", kind: "kind",
  countryCode: "country_code", areaId: "area_id", districtId: "district_id", lat: "lat", lng: "lng",
  address: "address", link: "link", description: "description", source: "source", visibility: "visibility" };

function update(pid, patch) {
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(FIELDS))
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); vals.push(patch[k]); }
  if (sets.length) {
    sets.push("updated_at = ?"); vals.push(now(), pid);
    db.prepare(`UPDATE places SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
  if (patch.attrs !== undefined)
    db.prepare("UPDATE places SET attrs = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(patch.attrs || {}), now(), pid);
  if (patch.images) setImages(pid, patch.images);
  return byId(pid);
}

function setImages(pid, urls) {
  db.prepare("DELETE FROM place_images WHERE place_id = ?").run(pid);
  const ins = db.prepare("INSERT INTO place_images (id,place_id,url,ord) VALUES (?,?,?,?)");
  urls.forEach((u, i) => ins.run(id("img"), pid, u, i));
}

const remove = (pid) => db.prepare("DELETE FROM places WHERE id = ?").run(pid);

// ---- what this user thinks of places ----
const userPlaces = (userId) => db.prepare(
  "SELECT place_id,status,note,rating,visited_at FROM user_places WHERE user_id = ?").all(userId);

function setUserPlace(userId, placeId, { status, note, rating }) {
  const visitedAt = status === "visited" ? now() : null;
  db.prepare(`INSERT INTO user_places (user_id,place_id,status,note,rating,visited_at,updated_at)
              VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(user_id,place_id) DO UPDATE SET
                status = COALESCE(excluded.status, user_places.status),
                note   = COALESCE(excluded.note, user_places.note),
                rating = COALESCE(excluded.rating, user_places.rating),
                visited_at = CASE WHEN excluded.status = 'visited' THEN excluded.visited_at
                                  WHEN excluded.status IS NOT NULL THEN NULL
                                  ELSE user_places.visited_at END,
                updated_at = excluded.updated_at`)
    .run(userId, placeId, status ?? null, note ?? null, rating ?? null, visitedAt, now());
  return db.prepare("SELECT * FROM user_places WHERE user_id = ? AND place_id = ?").get(userId, placeId);
}
const clearUserPlace = (userId, placeId) =>
  db.prepare("DELETE FROM user_places WHERE user_id = ? AND place_id = ?").run(userId, placeId);

module.exports = { visibleTo, byId, create, update, remove, setImages, imagesFor, allImages,
                   userPlaces, setUserPlace, clearUserPlace };
