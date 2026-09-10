#!/usr/bin/env node
// =============================================================================
//  Seed the database from the files the app used to ship as static JavaScript.
//
//  Idempotent: safe to re-run. Reference data is upserted by stable id, so a
//  re-run refreshes the catalogue without touching anyone's trips or marks.
//
//    node scripts/seed.js
// =============================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

require("../src/core/migrate");
const db = require("../src/core/db");
const config = require("../src/core/config");
const { id, slug } = require("../src/core/ids");
const geo = require("../src/modules/geo/geo.repository");
const placesRepo = require("../src/modules/places/places.repository");
const users = require("../src/modules/users/users.repository");

const FRONTEND = path.join(__dirname, "..", "..", "frontend");
// These files were written as browser globals. `var` lands on the context but
// `const`/`let` does not, so we append an explicit export line and run both.
const load = (file, names) => {
  const ctx = { __out: {} };
  const src = fs.readFileSync(path.join(FRONTEND, file), "utf8")
    + "\n;" + names.map(n => `try { __out.${n} = ${n}; } catch (e) {}`).join("");
  vm.runInNewContext(src, ctx, { filename: file });
  return ctx.__out;
};

const now = db.now;
const step = (msg) => process.stdout.write(`  ${msg}\n`);

console.log("Seeding Trip Planner\n");

// ---- 1. the local user ------------------------------------------------------
const me = users.ensureLocalUser(config.auth.devUserEmail);
step(`user           ${me.email} (${me.id})`);

// ---- 2. geography -----------------------------------------------------------
const { COUNTRIES, CITIES, DISTRICTS } = load("cities.js", ["COUNTRIES", "CITIES", "DISTRICTS"]);
const { SH_DISTRICTS_GEO } = load("districts-geo.js", ["SH_DISTRICTS_GEO"]);

let n = 0;
for (const [code, c] of Object.entries(COUNTRIES || { cn: { name: "China", cn: "中国" } })) {
  geo.upsertCountry({ code, name: c.name, nameLocal: c.cn }); n++;
}
step(`countries      ${n}`);

n = 0;
for (const [aid, a] of Object.entries(CITIES)) {
  geo.createArea({
    id: aid, countryCode: a.country || "cn", name: a.name, nameLocal: a.cn,
    kind: "city", lat: a.center && a.center[0], lng: a.center && a.center[1], zoom: a.zoom || 11,
  }); n++;
}
step(`areas          ${n}`);

// polygons are keyed by adcode in the GeoJSON, by id in the config
const geomByAdcode = {};
for (const f of (SH_DISTRICTS_GEO && SH_DISTRICTS_GEO.features) || [])
  geomByAdcode[f.properties.adcode] = f.geometry;

n = 0; let withGeom = 0;
for (const [did, d] of Object.entries(DISTRICTS)) {
  const geom = geomByAdcode[d.adcode] || null;
  geo.upsertDistrict({
    id: did, areaId: d.city, name: d.name, nameLocal: d.cn, adcode: d.adcode,
    color: d.color, blurb: d.blurb, geojson: geom,
  });
  n++; if (geom) withGeom++;
}
step(`districts      ${n} (${withGeom} with polygons)`);

// ---- 3. places --------------------------------------------------------------
const { PLACES } = load("data.js", ["PLACES"]);
const { IMG_PLACE, IMG_LANDMARK } = load("images.js", ["IMG_PLACE", "IMG_LANDMARK"]);

const areaCountry = {};
for (const a of geo.areas()) areaCountry[a.id] = a.country_code;
const districtIds = new Set(geo.districts().map(d => d.id));

const upsertPlace = db.prepare(`
  INSERT INTO places (id,kind,name,name_local,category,country_code,area_id,district_id,
                      lat,lng,address,link,description,source,visibility,created_by,created_at,updated_at)
  VALUES (@id,@kind,@name,@name_local,@category,@country_code,@area_id,@district_id,
          @lat,@lng,@address,@link,@description,@source,'public',NULL,@ts,@ts)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, name_local=excluded.name_local, category=excluded.category,
    country_code=excluded.country_code, area_id=excluded.area_id, district_id=excluded.district_id,
    lat=excluded.lat, lng=excluded.lng, link=excluded.link, description=excluded.description,
    source=excluded.source, updated_at=excluded.updated_at`);

const seedPlaces = db.transaction(() => {
  for (const p of PLACES) {
    const areaId = p.city || "shanghai";
    upsertPlace.run({
      id: p.id, kind: "poi", name: p.name, name_local: p.cn || null,
      category: p.c || null, country_code: areaCountry[areaId] || "cn",
      area_id: areaId, district_id: districtIds.has(p.d) ? p.d : null,
      lat: p.lat ?? null, lng: p.lng ?? null, address: p.address || null,
      link: p.link || null, description: p.desc || null, source: p.src || null, ts: now(),
    });
    const imgs = (IMG_PLACE && IMG_PLACE[p.id]) || (IMG_LANDMARK && IMG_LANDMARK[p.id] ? [IMG_LANDMARK[p.id]] : []);
    if (imgs && imgs.length) placesRepo.setImages(p.id, imgs.slice(0, 12));
  }
});
seedPlaces();
step(`places         ${PLACES.length}`);
step(`place images   ${db.prepare("SELECT COUNT(*) n FROM place_images").get().n}`);

// ---- 4. re-derive districts from the polygons -------------------------------
// The polygons are now authoritative, so any place whose stored district
// disagrees with where it actually sits gets corrected here.
const { assignDistrict, invalidate } = require("../src/modules/places/districts.service");
invalidate();
let moved = 0;
const fix = db.prepare("UPDATE places SET district_id = ?, area_id = ?, country_code = ? WHERE id = ?");
db.transaction(() => {
  for (const p of db.prepare("SELECT id,lat,lng,area_id,district_id,country_code FROM places").all()) {
    const a = assignDistrict({ lat: p.lat, lng: p.lng, areaId: p.area_id, countryCode: p.country_code });
    if (a.districtId !== p.district_id || a.areaId !== p.area_id) {
      fix.run(a.districtId, a.areaId, a.countryCode || p.country_code, p.id);
      moved++;
    }
  }
})();
step(`districts fixed ${moved} place(s) re-assigned by polygon`);

// ---- 5. link branches of the same business ----------------------------------
// The catalogue names them "Brand (Branch)"; migration 008 can only backfill a
// database that already had places, and on a fresh install the seed runs after
// the migrations — so the same rule is applied here.
const brands = require("../src/modules/places/brands.repository");
const derived = brands.deriveFromNames();
step(`brands         ${derived.brands} brand(s), ${derived.linked} branch(es) linked`);

console.log("\nDone. Legacy trips and marks import separately:  node scripts/import-legacy.js <dump.json>\n");
