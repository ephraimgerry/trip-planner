// Events — temporary things that happen somewhere. See migration 009 for why
// they are not places.
const db = require("../../core/db");
const { id } = require("../../core/ids");
const now = db.now;

const COLS = `id,name,name_local,category,venue_place_id,venue_name,country_code,area_id,district_id,
              lat,lng,address,start_date,end_date,is_free,link,description,source,attrs,
              visibility,created_by,created_at,updated_at`;

const hydrate = (e) => {
  if (!e) return e;
  let attrs = {};
  try { attrs = JSON.parse(e.attrs || "{}"); } catch (err) {}
  return { ...e, attrs, is_free: !!e.is_free };
};

const categories = () => db.prepare("SELECT id,label,ord FROM event_categories ORDER BY ord").all();
const categoryExists = (cid) => !!db.prepare("SELECT 1 FROM event_categories WHERE id = ?").get(cid);

// The public catalogue plus your own private ones — same rule as places.
const visibleTo = (userId) => db.prepare(
  `SELECT ${COLS} FROM events WHERE visibility = 'public' OR created_by = ? ORDER BY start_date, name`
).all(userId || "").map(hydrate);

const byId = (eid) => hydrate(db.prepare(`SELECT ${COLS} FROM events WHERE id = ?`).get(eid));

// Anything on at some point inside [from, to]. An open-ended one-day event
// (end_date NULL) is on only on its start date.
const overlapping = (from, to, areaIds) => {
  const where = ["start_date <= @to", "COALESCE(end_date, start_date) >= @from"];
  const params = { from, to };
  if (areaIds && areaIds.length) {
    where.push(`area_id IN (${areaIds.map((_, i) => "@a" + i).join(",")})`);
    areaIds.forEach((a, i) => { params["a" + i] = a; });
  }
  return db.prepare(`SELECT ${COLS} FROM events WHERE ${where.join(" AND ")} ORDER BY start_date`)
    .all(params).map(hydrate);
};

function create(e, userId) {
  const eid = e.id || id("evt");
  const ts = now();
  db.prepare(`INSERT INTO events (${COLS.replace(/\s+/g, "")})
              VALUES (@id,@name,@name_local,@category,@venue_place_id,@venue_name,@country_code,@area_id,
                      @district_id,@lat,@lng,@address,@start_date,@end_date,@is_free,@link,@description,
                      @source,@attrs,@visibility,@created_by,@ts,@ts)`)
    .run({
      id: eid, name: e.name, name_local: e.nameLocal || null, category: e.category,
      venue_place_id: e.venuePlaceId || null, venue_name: e.venueName || null,
      country_code: e.countryCode || null, area_id: e.areaId || null, district_id: e.districtId || null,
      lat: e.lat ?? null, lng: e.lng ?? null, address: e.address || null,
      start_date: e.startDate, end_date: e.endDate || null, is_free: e.isFree ? 1 : 0,
      link: e.link || null, description: e.description || null, source: e.source || null,
      attrs: JSON.stringify(e.attrs || {}), visibility: e.visibility || "public",
      created_by: userId || null, ts,
    });
  return byId(eid);
}

const FIELDS = { name: "name", nameLocal: "name_local", category: "category",
  venuePlaceId: "venue_place_id", venueName: "venue_name", countryCode: "country_code",
  areaId: "area_id", districtId: "district_id", lat: "lat", lng: "lng", address: "address",
  startDate: "start_date", endDate: "end_date", link: "link", description: "description",
  source: "source", visibility: "visibility" };

function update(eid, patch) {
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(FIELDS))
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); vals.push(patch[k]); }
  if (patch.isFree !== undefined) { sets.push("is_free = ?"); vals.push(patch.isFree ? 1 : 0); }
  if (patch.attrs !== undefined) {
    // merge, so changing the price doesn't drop the opening hours
    const cur = byId(eid);
    sets.push("attrs = ?"); vals.push(JSON.stringify(Object.assign({}, cur && cur.attrs, patch.attrs)));
  }
  if (sets.length) {
    sets.push("updated_at = ?"); vals.push(now(), eid);
    db.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
  return byId(eid);
}

const remove = (eid) => db.prepare("DELETE FROM events WHERE id = ?").run(eid);

module.exports = { categories, categoryExists, visibleTo, byId, overlapping, create, update, remove };
