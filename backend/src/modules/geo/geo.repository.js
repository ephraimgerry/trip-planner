const db = require("../../core/db");
const { slug } = require("../../core/ids");
const now = db.now;

const countries = () => db.prepare("SELECT code,name,name_local FROM countries ORDER BY name").all();
const areas = () => db.prepare(
  "SELECT id,country_code,name,name_local,kind,lat,lng,zoom FROM areas ORDER BY name").all();
const districts = () => db.prepare(
  "SELECT id,area_id,name,name_local,adcode,color,blurb FROM districts ORDER BY name").all();
// Geometry is big; it gets its own endpoint so the bootstrap payload stays small.
const districtGeo = () => db.prepare(
  "SELECT id,area_id,name,name_local,adcode,color,geojson FROM districts WHERE geojson IS NOT NULL").all();

const areaById = (aid) => db.prepare("SELECT * FROM areas WHERE id = ?").get(aid);
const countryByCode = (c) => db.prepare("SELECT * FROM countries WHERE code = ?").get(c);

function upsertCountry({ code, name, nameLocal }) {
  db.prepare(`INSERT INTO countries (code,name,name_local,created_at) VALUES (?,?,?,?)
              ON CONFLICT(code) DO UPDATE SET name=excluded.name, name_local=excluded.name_local`)
    .run(code.toLowerCase(), name, nameLocal || null, now());
  return countryByCode(code.toLowerCase());
}
function createArea({ id: aid, countryCode, name, nameLocal, kind = "city", lat, lng, zoom = 11, createdBy }) {
  const key = aid || slug(name);
  db.prepare(`INSERT INTO areas (id,country_code,name,name_local,kind,lat,lng,zoom,created_by,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_local=excluded.name_local,
                kind=excluded.kind, lat=excluded.lat, lng=excluded.lng, zoom=excluded.zoom`)
    .run(key, countryCode.toLowerCase(), name, nameLocal || null, kind, lat, lng, zoom, createdBy || null, now());
  return areaById(key);
}
function upsertDistrict({ id: did, areaId, name, nameLocal, adcode, color, blurb, geojson }) {
  db.prepare(`INSERT INTO districts (id,area_id,name,name_local,adcode,color,blurb,geojson,created_at)
              VALUES (?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET area_id=excluded.area_id, name=excluded.name,
                name_local=excluded.name_local, adcode=excluded.adcode, color=excluded.color,
                blurb=excluded.blurb, geojson=excluded.geojson`)
    .run(did, areaId, name, nameLocal || null, adcode || null, color || null, blurb || null,
         geojson ? JSON.stringify(geojson) : null, now());
}
module.exports = { countries, areas, districts, districtGeo, areaById, countryByCode,
                   upsertCountry, createArea, upsertDistrict };
