// Import the frontend catalog (data.js + cities.js) into the DB.
require("../src/core/migrate");
const fs = require("fs");
const path = require("path");
const placesRepo = require("../src/modules/places/places.repository");

const FE = path.join(__dirname, "..", "..", "frontend");
function loadGlobals(file, names) {
  const txt = fs.readFileSync(path.join(FE, file), "utf8");
  const g = {};
  const re = new RegExp("\\b(?:const|var)\\s+(" + names.join("|") + ")\\b", "g");
  new Function("g", txt.replace(re, "g.$1"))(g);
  return g;
}
const { PLACES } = loadGlobals("data.js", ["CATEGORIES", "PLACES"]);
const { DISTRICTS } = loadGlobals("cities.js", ["CITIES", "DISTRICTS"]);
const d2city = {};
for (const [k, v] of Object.entries(DISTRICTS)) d2city[k] = v.city;

const rows = PLACES.map((p) => ({
  id: p.id, name: p.name, name_cn: p.cn || "", category: p.c, sub: p.sub || null,
  city: p.city || d2city[p.d] || null, district: p.d || null, lat: p.lat, lng: p.lng,
  link: p.link || null, description: p.desc || null, source: p.src || null, image_urls: [],
}));
placesRepo.bulkInsert(rows);
console.log(`[seed] imported ${rows.length} places`);
