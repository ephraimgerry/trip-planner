// Download CARTO Voyager raster tiles for the trip region into ../tiles/{z}/{x}/{y}.png
// so the app has an offline basemap. Re-run to expand coverage (edit REGIONS below).
// Polite: low concurrency + small delay + skips already-downloaded tiles.
const fs = require("fs");
const path = require("path");

const TILE_DIR = path.join(__dirname, "..", "tiles");
const UA = "trip-planner-offline/0.1 (personal use)";
const SUBS = ["a", "b", "c", "d"];

// [west, south, east, north, minZoom, maxZoom]
const REGIONS = [
  // whole Shanghai–Suzhou–Hangzhou region, overview → city zoom
  [119.85, 30.05, 122.05, 31.65, 8, 13],
  // dense city cores, one extra zoom for street-level walking
  [121.38, 31.13, 121.58, 31.32, 14, 14], // Shanghai
  [120.54, 31.24, 120.76, 31.36, 14, 14], // Suzhou
  [120.04, 30.18, 120.22, 30.34, 14, 14], // Hangzhou
];

const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
};

function tileList() {
  const seen = new Set(); const tiles = [];
  for (const [w, s, e, n, z0, z1] of REGIONS) {
    for (let z = z0; z <= z1; z++) {
      const x0 = lon2x(w, z), x1 = lon2x(e, z);
      const y0 = lat2y(n, z), y1 = lat2y(s, z); // north has smaller y
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = z + "/" + x + "/" + y;
        if (!seen.has(k)) { seen.add(k); tiles.push({ z, x, y }); }
      }
    }
  }
  return tiles;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getTile(t, i) {
  const dir = path.join(TILE_DIR, String(t.z), String(t.x));
  const file = path.join(dir, t.y + ".png");
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return "skip";
  const s = SUBS[(t.x + t.y) % SUBS.length];
  const url = `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${t.z}/${t.x}/${t.y}.png`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, buf);
        return "ok";
      }
    } catch {}
    await sleep(800 * (a + 1));
  }
  return "fail";
}

(async () => {
  const tiles = tileList();
  console.log("tiles to fetch:", tiles.length);
  if (tiles.length > 6000) { console.error("Too many tiles (" + tiles.length + ") — narrow the region."); process.exit(1); }
  let ok = 0, skip = 0, fail = 0, done = 0;
  const CONC = 6;
  let idx = 0;
  async function worker() {
    while (idx < tiles.length) {
      const t = tiles[idx++];
      const r = await getTile(t);
      if (r === "ok") ok++; else if (r === "skip") skip++; else fail++;
      if (r === "ok") await sleep(40); // be polite when actually hitting the server
      if (++done % 200 === 0) console.log(`  ${done}/${tiles.length} (ok ${ok}, skip ${skip}, fail ${fail})`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  // report size
  let bytes = 0, count = 0;
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else { bytes += st.size; count++; } } })(TILE_DIR);
  console.log(`DONE. downloaded ${ok}, skipped ${skip}, failed ${fail}. Stored ${count} tiles, ${(bytes / 1048576).toFixed(1)} MB.`);
})();
