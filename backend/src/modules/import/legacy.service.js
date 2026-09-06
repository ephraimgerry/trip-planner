// =============================================================================
//  One-way import of the old browser-localStorage document.
//
//  The interesting part is hotels: they used to be an anonymous {name, area,
//  link, lat, lng} blob nailed to a stay. Here each one becomes a real place
//  (kind='lodging') with geography of its own, and the stay just points at it.
//  Run it twice and you get the same result — trips are matched by legacy id.
// =============================================================================
const db = require("../../core/db");
const { id, slug } = require("../../core/ids");
const geo = require("../geo/geo.repository");
const places = require("../places/places.repository");
const trips = require("../trips/trips.repository");
const users = require("../users/users.repository");
const { assignDistrict, invalidate } = require("../places/districts.service");
const logger = require("../../core/logger");

const now = db.now;
const clean = (s, max = 400) => (s == null ? null : String(s).slice(0, max));

// The old model stored a hop as one free-text line. Classify it the same way
// migration 003 does, so a fresh import matches an upgraded database.
function guessKind(label) {
  const s = String(label || "").toLowerCase();
  if (/maglev|磁悬浮/.test(s)) return "train";
  if (/metro|subway|地铁/.test(s)) return "metro";
  if (/train|bullet|fuxing|复兴|high-speed|g-train|高铁|^g |d\/g/.test(s)) return "train";
  if (/taxi|didi|private car|intercity car|出租/.test(s)) return "taxi";
  if (/rental|hire car|hertz|avis|sixt/.test(s)) return "car_rental";
  if (/bus|coach|大巴/.test(s)) return "bus";
  if (/ferry|boat|渡/.test(s)) return "ferry";
  if (/walk|on foot/.test(s)) return "walk";
  if (/flight|airline|\bsq\d|\bmu\d/.test(s)) return "flight";
  return "other";
}

// A hotel with the same name in the same area is the same hotel.
function findLodging(name, areaId) {
  return db.prepare(
    `SELECT * FROM places WHERE kind = 'lodging' AND name = ? AND (area_id IS ? OR area_id = ?) LIMIT 1`
  ).get(name, areaId, areaId);
}

function ensureLodging(hotel, areaId, userId) {
  if (!hotel || !hotel.name) return null;
  const name = clean(hotel.name, 160);
  const existing = findLodging(name, areaId);
  if (existing) return existing.id;
  const geoBits = assignDistrict({ lat: hotel.lat, lng: hotel.lng, areaId });
  return places.create({
    kind: "lodging", name,
    areaId: geoBits.areaId || areaId,
    districtId: geoBits.districtId,
    countryCode: geoBits.countryCode,
    lat: typeof hotel.lat === "number" ? hotel.lat : null,
    lng: typeof hotel.lng === "number" ? hotel.lng : null,
    address: clean(hotel.area, 300),
    link: /^https?:\/\//i.test(hotel.link || "") ? hotel.link : null,
    source: "imported from your saved trip",
    visibility: "public",
  }, userId).id;
}

const run = db.transaction((store, userId) => {
  const report = { countries: 0, areas: 0, places: 0, hotels: 0, trips: 0, items: 0,
                   alternatives: 0, marks: 0, skipped: [] };

  // ---- geography the user added themselves ----
  for (const c of store.countries || []) {
    if (!c || !c.id) continue;
    geo.upsertCountry({ code: String(c.id).slice(0, 2), name: c.name || c.id, nameLocal: c.cn });
    report.countries++;
  }
  for (const a of store.areas || []) {
    if (!a || !a.id) continue;
    geo.createArea({
      id: a.id, countryCode: a.country || "cn", name: a.name || a.id, nameLocal: a.cn,
      kind: a.kind || "city", lat: a.center && a.center[0], lng: a.center && a.center[1],
      zoom: a.zoom || 11, createdBy: userId,
    });
    report.areas++;
  }
  invalidate();

  // ---- places the user pinned themselves ----
  for (const p of store.custom || []) {
    if (!p || !p.id || !p.name) continue;
    if (places.byId(p.id)) continue;
    const bits = assignDistrict({ lat: p.lat, lng: p.lng, areaId: p.city });
    places.create({
      id: p.id, kind: "poi", name: clean(p.name, 160), nameLocal: clean(p.cn, 160),
      category: p.c || null, areaId: bits.areaId, districtId: bits.districtId,
      countryCode: bits.countryCode, lat: p.lat ?? null, lng: p.lng ?? null,
      link: /^https?:\/\//i.test(p.link || "") ? p.link : null,
      description: clean(p.desc, 4000), source: clean(p.src, 120) || "added by me",
      visibility: "public",
    }, userId);
    report.places++;
  }

  // ---- what the user thinks of places ----
  const marks = new Set([...Object.keys(store.status || {}), ...Object.keys(store.notes || {})]);
  for (const pid of marks) {
    if (!places.byId(pid)) { report.skipped.push(`mark for unknown place ${pid}`); continue; }
    places.setUserPlace(userId, pid, {
      status: (store.status || {})[pid] || null,
      note: clean((store.notes || {})[pid], 2000),
    });
    report.marks++;
  }

  // ---- trips ----
  for (const t of store.trips || []) {
    if (!t || !t.id || !t.start || !t.end) continue;

    // Match an earlier import of the same legacy trip rather than duplicating it.
    const prior = db.prepare("SELECT id FROM trips WHERE id = ?").get(t.id);
    let tripId = prior ? prior.id : null;
    if (!tripId) {
      tripId = t.id;
      db.prepare(`INSERT INTO trips (id,name,start_date,end_date,created_by,created_at,updated_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .run(tripId, clean(t.name, 120) || "Imported trip", t.start, t.end, userId, now(), now());
      db.prepare(`INSERT INTO trip_members (trip_id,user_id,role,joined_at,created_at)
                  VALUES (?,?,'owner',?,?)`).run(tripId, userId, now(), now());
    } else {
      db.prepare("UPDATE trips SET name=?, start_date=?, end_date=?, updated_at=? WHERE id=?")
        .run(clean(t.name, 120) || "Imported trip", t.start, t.end, now(), tripId);
    }

    const doc = { stays: [], commutes: [], items: [], alternatives: [] };

    for (const s of t.segments || []) {
      const placeId = ensureLodging(s.hotel, s.city, userId);
      if (placeId && s.hotel) report.hotels++;
      doc.stays.push({
        areaId: s.city || null, placeId,
        checkIn: s.start, checkOut: s.end,
        booked: !!s.hotel,
      });
    }

    // flights and inter-city hops are both commutes now
    for (const [dir, f] of [["outbound", t.outbound], ["inbound", t.inbound]]) {
      if (!f || (!f.flight && !f.leg)) continue;
      const m = String(f.leg || "").split("→");   // "SIN 17:00 → PVG 22:00" is all the old model had
      doc.commutes.push({
        kind: "flight", direction: dir, code: clean(f.flight, 40),
        startDate: f.date || t.start,
        fromLabel: clean((m[0] || "").trim(), 120) || null,
        toLabel: clean((m[1] || "").trim(), 120) || null,
        label: clean([f.flight, f.leg].filter(Boolean).join(" · "), 240),
        status: f.flight ? "booked" : "idea",
      });
    }

    // each option becomes a sibling commute; they share the hop's group id
    (t.legs || []).forEach((l, li) => {
      const gid = "leg" + li + "-" + tripId.slice(-8);
      const opts = (l.options || []).length ? l.options : [""];
      opts.forEach((o, i) => doc.commutes.push({
        kind: guessKind(o), groupId: gid, chosen: (l.chosen || 0) === i,
        direction: "internal", startDate: l.date,
        fromLabel: clean(l.from, 120), toLabel: clean(l.to, 120),
        label: clean(o, 240) || null,
        status: (l.chosen || 0) === i ? "planned" : "idea",
      }));
    });

    for (const [date, ids] of Object.entries(t.plan || {})) {
      (ids || []).forEach((pid, i) => {
        if (!places.byId(pid)) { report.skipped.push(`plan item ${pid} on ${date}`); return; }
        // Slot stays null: the old model never recorded one, and inventing a
        // time here would be worse than letting the UI keep deriving it.
        doc.items.push({ date, placeId: pid, ord: i, slot: null });
        report.items++;
      });
    }

    for (const pid of t.wishlist || []) {
      if (!places.byId(pid)) { report.skipped.push(`alternative ${pid}`); continue; }
      doc.alternatives.push({ placeId: pid, addedBy: userId });
      report.alternatives++;
    }

    trips.replacePlan(tripId, doc);
    report.trips++;
  }

  // ---- the distance reference point was global; it becomes a preference ----
  if (store.base && places.byId(store.base))
    users.savePrefs(userId, Object.assign(users.prefs(userId), { basePlaceId: store.base }));

  return report;
});

module.exports = { run };
