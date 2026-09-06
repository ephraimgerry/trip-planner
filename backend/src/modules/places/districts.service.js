// Point-in-polygon district assignment, server side.
// The client used to do this against a bundled GeoJSON file; now the polygons
// live in the database and the answer is authoritative.
const geo = require("../geo/geo.repository");

let cache = null;
function polygons() {
  if (cache) return cache;
  cache = geo.districtGeo().map(d => {
    let g = null;
    try { g = JSON.parse(d.geojson); } catch (e) {}
    return { id: d.id, areaId: d.area_id, rings: ringsOf(g) };
  }).filter(d => d.rings.length);
  return cache;
}
const invalidate = () => { cache = null; };

function ringsOf(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates[0]];
  if (geom.type === "MultiPolygon") return geom.coordinates.map(p => p[0]);
  return [];
}

// Ray casting. Coordinates are [lng, lat] in GeoJSON order.
function inRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function districtOfPoint(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  for (const d of polygons()) if (d.rings.some(r => inRing(lat, lng, r))) return d;
  return null;
}

// Inside a mapped district the polygon wins. Outside one, whatever area the
// user picked is kept — that is the only way places beyond the mapped cities
// (a different province, a different country) can exist at all.
function assignDistrict(place) {
  const hit = districtOfPoint(place.lat, place.lng);
  if (hit) {
    const area = geo.areaById(hit.areaId);
    return { districtId: hit.id, areaId: hit.areaId, countryCode: area ? area.country_code : place.countryCode };
  }
  const area = place.areaId ? geo.areaById(place.areaId) : null;
  return { districtId: null, areaId: place.areaId || null, countryCode: area ? area.country_code : place.countryCode || null };
}

module.exports = { assignDistrict, districtOfPoint, invalidate };
