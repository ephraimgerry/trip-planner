// =============================================================================
//  The app's data layer. Everything lives in the database; nothing about a
//  trip, a place or a mark is stored in the browser.
//
//  Two jobs:
//    1. boot()  — pull the whole world in one request and shape it the way the
//                 UI already expects (so rendering code stays untouched).
//    2. Repo    — every mutation, pushed to the API. Trips are written as a
//                 document; the server normalises them into its own tables.
//
//  The only thing kept client-side is the theme, cached purely so the first
//  paint isn't a white flash. It is mirrored to the server as the real value.
// =============================================================================
(function (global) {
  "use strict";

  const BASE = global.PLANNER_API_BASE || "http://127.0.0.1:4177";
  const LEGACY_KEY = "shanghai-planner-v1";

  class ApiError extends Error {
    constructor(status, body) {
      super((body && body.error && body.error.message) || `Request failed (${status})`);
      this.status = status; this.code = body && body.error && body.error.code;
      this.details = body && body.error && body.error.details;
    }
  }

  async function req(method, path, body) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        // always declare JSON intent, even with no body — the server uses it as
        // its CSRF signal and a stray form post must not look like us
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new ApiError(0, { error: { message: "Can't reach the trip server. Is the backend running?" } });
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }
  const get = (p) => req("GET", p);
  const post = (p, b) => req("POST", p, b);
  const put = (p, b) => req("PUT", p, b);
  const patch = (p, b) => req("PATCH", p, b);
  const del = (p) => req("DELETE", p);

  // ---------------------------------------------------------------- shaping
  // The API speaks normalised rows; the UI speaks the flatter shape it grew up
  // with. These two functions are the whole translation layer.

  // place row -> the { id, name, cn, d, city, c, lat, lng, ... } the UI uses
  function toPlace(p) {
    return {
      id: p.id, kind: p.kind, name: p.name, cn: p.name_local || "",
      c: p.category || (p.kind === "lodging" ? "lodging" : "custom"),
      d: p.district_id || "_other",
      city: p.area_id || "",
      country: p.country_code || "",
      lat: p.lat, lng: p.lng, address: p.address || "", attrs: p.attrs || {},
      link: p.link || "", desc: p.description || "", src: p.source || "",
      images: p.images || [],
      mine: !!p.created_by,
    };
  }

  // trip document -> the legacy trip shape (segments/legs/plan/wishlist).
  // Hotels are places on the server; here they're inlined onto the stay so the
  // existing hotel cards and map pins keep working unchanged.
  function toTrip(doc, placeIndex) {
    const commutes = doc.commutes || [];
    // the two flights the overview shows as Out / Back
    const flight = (dir) => {
      const f = commutes.find(c => c.kind === "flight" && c.direction === dir);
      if (!f) return { flight: "", date: dir === "outbound" ? doc.startDate : doc.endDate, leg: "" };
      return {
        flight: f.code || "", date: f.startDate || "",
        leg: [f.fromLabel, f.toLabel].filter(Boolean).join(" → "),
        bookingRef: f.bookingRef || "", commuteId: f.id, status: f.status,
      };
    };
    // alternatives for one hop share a groupId; rebuild them as the "legs" the UI knows
    const groups = [];
    const seen = {};
    commutes.filter(c => c.groupId).forEach(c => {
      if (!seen[c.groupId]) { seen[c.groupId] = { id: c.groupId, rows: [] }; groups.push(seen[c.groupId]); }
      seen[c.groupId].rows.push(c);
    });
    return {
      id: doc.id, name: doc.name, start: doc.startDate, end: doc.endDate,
      createdBy: doc.createdBy, members: doc.members || [],
      myRole: (doc.members || []).reduce((r, m) => r, null),
      outbound: flight("outbound"), inbound: flight("inbound"),
      segments: (doc.stays || []).map(s => {
        const h = s.placeId ? placeIndex[s.placeId] : null;
        const pa = (h && h.attrs) || {};
        return {
          stayId: s.id, city: s.areaId || "", start: s.checkIn, end: s.checkOut,
          placeId: s.placeId || null,
          // what you agreed, falling back to the hotel's usual policy
          checkInTime: s.checkInTime || pa.checkInTime || null,
          checkOutTime: s.checkOutTime || pa.checkOutTime || null,
          ownCheckInTime: s.checkInTime || null, ownCheckOutTime: s.checkOutTime || null,
          hotel: h ? { name: h.name, area: h.address || "", link: h.link || "", lat: h.lat, lng: h.lng } : null,
        };
      }),
      legs: groups.map(g => {
        const rows = g.rows.slice().sort((a, b) => a.ord - b.ord);
        const head = rows[0];
        return {
          id: g.id, date: head.startDate,
          from: head.fromLabel || head.fromAreaId || "", to: head.toLabel || head.toAreaId || "",
          fromAreaId: head.fromAreaId, toAreaId: head.toAreaId,
          options: rows.map(r => r.label || ""),
          kinds: rows.map(r => r.kind),
          rowIds: rows.map(r => r.id),
          chosen: Math.max(0, rows.findIndex(r => r.chosen)),
        };
      }),
      // everything that isn't a flight or a hop alternative: hire cars, passes,
      // one-off transfers. These are the rows that can span days.
      commutes: commutes.filter(c => !c.groupId && c.kind !== "flight").map(c => ({ ...c })),
      allCommutes: commutes,
      participants: doc.participants || [],
      commutesByDay: (doc.days || []).reduce((a, d) => { a[d.date] = d.commuteIds; return a; }, {}),
      // the server owns "where were you, and was this a travel day" — it can see
      // the commutes' resolved areas, which the flat client shape can't
      areasByDay: (doc.days || []).reduce((a, d) => { a[d.date] = d.areaIds; return a; }, {}),
      travelDays: (doc.days || []).reduce((a, d) => { if (d.travel) a[d.date] = true; return a; }, {}),
      peopleByDay: (doc.days || []).reduce((a, d) => { a[d.date] = d.participantIds; return a; }, {}),
      plan: (doc.days || []).reduce((acc, d) => {
        if (d.items.length) acc[d.date] = d.items.slice().sort((a, b) => a.ord - b.ord).map(i => i.placeId);
        return acc;
      }, {}),
      // exact times only exist for the few items that need them
      timing: (doc.days || []).reduce((acc, d) => {
        d.items.forEach(i => {
          if (i.startTime || i.endTime || i.slot || i.note)
            acc[d.date + "|" + i.placeId] = { slot: i.slot, startTime: i.startTime, endTime: i.endTime, note: i.note };
        });
        return acc;
      }, {}),
      wishlist: (doc.alternatives || []).map(a => a.placeId),
    };
  }

  // the legacy trip shape -> the plan document the API accepts
  function toPlanDoc(t) {
    const commutes = [];
    for (const [dir, f] of [["outbound", t.outbound], ["inbound", t.inbound]]) {
      if (!f || (!f.flight && !f.leg)) continue;
      const bits = String(f.leg || "").split("→");
      commutes.push({
        kind: "flight", direction: dir, code: f.flight || null,
        startDate: f.date || t.start,
        fromLabel: (bits[0] || "").trim() || null,
        toLabel: (bits[1] || "").trim() || null,
        label: [f.flight, f.leg].filter(Boolean).join(" · ") || null,
        status: f.flight ? "booked" : "idea",
        bookingRef: f.bookingRef || null,
      });
    }
    (t.legs || []).forEach(l => {
      (l.options || []).forEach((label, i) => commutes.push({
        kind: (l.kinds && l.kinds[i]) || "other",
        groupId: l.id, chosen: l.chosen === i, direction: "internal",
        startDate: l.date, fromLabel: l.from || null, toLabel: l.to || null,
        label: label || null, status: l.chosen === i ? "planned" : "idea",
      }));
    });
    // standalone commutes (hire cars, passes, transfers) pass through unchanged
    (t.commutes || []).forEach(c => commutes.push({
      id: c.id, kind: c.kind, direction: c.direction || "internal",
      startDate: c.startDate, startTime: c.startTime || null,
      endDate: c.endDate || null, endTime: c.endTime || null,
      fromAreaId: c.fromAreaId || null, toAreaId: c.toAreaId || null,
      fromPlaceId: c.fromPlaceId || null, toPlaceId: c.toPlaceId || null,
      fromLabel: c.fromLabel || null, toLabel: c.toLabel || null,
      label: c.label || null, operator: c.operator || null, code: c.code || null,
      status: c.status || "idea", bookingRef: c.bookingRef || null,
      price: c.price ?? null, currency: c.currency || null, durationMin: c.durationMin ?? null,
      attrs: c.attrs || {}, note: c.note || null,
      participantIds: c.participantIds || [],
    }));
    const items = [];
    Object.entries(t.plan || {}).forEach(([date, ids]) => {
      (ids || []).forEach((pid, i) => {
        const tm = (t.timing || {})[date + "|" + pid] || {};
        items.push({
          date, placeId: pid, ord: i,
          slot: tm.slot || null, startTime: tm.startTime || null, endTime: tm.endTime || null,
          note: tm.note || null,
        });
      });
    });
    return {
      stays: (t.segments || []).map(s => ({
        areaId: s.city || null, placeId: s.placeId || null,
        checkIn: s.start, checkOut: s.end,
        checkInTime: s.ownCheckInTime || null, checkOutTime: s.ownCheckOutTime || null,
        booked: !!s.placeId,
        participantIds: s.participantIds || [],
      })),
      commutes,
      items,
      alternatives: (t.wishlist || []).map(pid => ({ placeId: pid })),
    };
  }

  // -------------------------------------------------------------------- boot
  const state = { me: null, authMode: null, prefs: {} };

  async function boot() {
    const b = await get("/api/bootstrap");
    state.me = b.me; state.authMode = b.authMode; state.prefs = b.prefs || {};

    // One-time rescue of the old localStorage document.
    //
    // This NEVER deletes the old blob. It is the only copy of data that predates
    // the database, so it is renamed to an archive key on success and left
    // completely alone on failure. Import is keyed on the legacy trip id, so
    // re-running it updates rather than duplicates — which means it is safe to
    // run even when the server already has trips.
    let imported = null;
    const legacy = readLegacy();
    if (legacy) {
      try {
        imported = (await post("/api/import/legacy", legacy)).imported;
        localStorage.setItem(LEGACY_KEY + "-archived-" + new Date().toISOString().slice(0, 10),
                             JSON.stringify(legacy));
        localStorage.removeItem(LEGACY_KEY);
        return Object.assign(await boot(), { imported });
      } catch (e) {
        // Leave the blob exactly where it is and carry on with what the server has.
        console.warn("[api] legacy import failed — your old data is untouched:", e.message);
      }
    }

    const places = b.places.map(toPlace);
    const index = {};
    places.forEach(p => index[p.id] = p);

    const COUNTRIES = {};
    b.countries.forEach(c => COUNTRIES[c.code] = { name: c.name, cn: c.name_local || "" });

    const CITIES = {};
    b.areas.forEach(a => CITIES[a.id] = {
      country: a.country_code, name: a.name, cn: a.name_local || "",
      center: [a.lat, a.lng], zoom: a.zoom || 11, kind: a.kind,
    });

    const DISTRICTS = {};
    b.districts.forEach(d => DISTRICTS[d.id] = {
      name: d.name, cn: d.name_local || "", adcode: d.adcode,
      color: d.color, city: d.area_id, blurb: d.blurb || "",
    });

    const status = {}, notes = {};
    b.userPlaces.forEach(u => {
      if (u.status) status[u.place_id] = u.status;
      if (u.note) notes[u.place_id] = u.note;
    });

    // Polygons are a separate, cacheable request — they're a quarter of a megabyte.
    let geojson = { type: "FeatureCollection", features: [] };
    try { geojson = await get("/api/geo/districts.geojson"); }
    catch (e) { console.warn("[api] district polygons unavailable:", e.message); }

    return {
      me: b.me, authMode: b.authMode, imported,
      PLACES: places, COUNTRIES, CITIES, DISTRICTS, GEOJSON: geojson,
      status, notes, prefs: state.prefs,
      trips: b.trips.map(d => toTrip(d, index)),
    };
  }

  function readLegacy() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const has = (s.trips && s.trips.length) || (s.custom && s.custom.length)
        || Object.keys(s.status || {}).length || Object.keys(s.notes || {}).length;
      if (!has) { localStorage.removeItem(LEGACY_KEY); return null; }
      return s;
    } catch (e) { return null; }
  }

  // -------------------------------------------------------------------- Repo
  const Repo = {
    // ---- trips ----
    async createTrip({ name, start, end }) {
      const r = await post("/api/trips", { name, startDate: start, endDate: end });
      return r.trip;
    },
    async renameTrip(id, { name, start, end }) {
      const body = {};
      if (name !== undefined) body.name = name;
      if (start !== undefined) body.startDate = start;
      if (end !== undefined) body.endDate = end;
      return (await patch("/api/trips/" + id, body)).trip;
    },
    async saveTrip(t) {
      // dates live on the trip row, the rest is one atomic plan write
      await patch("/api/trips/" + t.id, { name: t.name, startDate: t.start, endDate: t.end });
      return (await put("/api/trips/" + t.id + "/plan", toPlanDoc(t))).trip;
    },
    deleteTrip: (id) => del("/api/trips/" + id),
    suggestions: (id, date, allAreas) =>
      get(`/api/trips/${id}/days/${date}/suggestions${allAreas ? "?allAreas=1" : ""}`)
        .then(r => r.suggestions.map(toPlace)),

    // ---- places (hotels included) ----
    async createPlace(p) {
      const r = await post("/api/places", {
        kind: p.kind || "poi", name: p.name, nameLocal: p.cn || null,
        category: p.c || null, areaId: p.city || null,
        countryCode: p.country || null,
        lat: p.lat ?? null, lng: p.lng ?? null,
        address: p.address || null, link: p.link || null,
        description: p.desc || null, source: p.src || "added by me",
      });
      return toPlace(r.place);
    },
    async updatePlace(id, p) {
      const body = {};
      const map = { name: "name", cn: "nameLocal", c: "category", city: "areaId",
                    lat: "lat", lng: "lng", address: "address", link: "link", desc: "description" };
      for (const [from, to] of Object.entries(map)) if (p[from] !== undefined) body[to] = p[from];
      return toPlace((await patch("/api/places/" + id, body)).place);
    },
    deletePlace: (id) => del("/api/places/" + id),

    // A hotel is a place. Reuse one if it's already in the catalogue.
    async upsertHotel({ id, name, area, link, lat, lng, city }) {
      const payload = { kind: "lodging", name, address: area || null,
                        link: link || null, lat: lat ?? null, lng: lng ?? null, city };
      if (id) return Repo.updatePlace(id, { name, address: area, link, lat, lng, city });
      return Repo.createPlace(payload);
    },

    // ---- marks ----
    setStatus: (placeId, status) => put(`/api/places/${placeId}/me`, { status: status || null }),
    setNote: (placeId, note) => put(`/api/places/${placeId}/me`, { note: note || null }),

    // ---- who's coming ----
    commuteKinds: () => get("/api/trips/commute-kinds").then(r => r.kinds),
    addParticipant: (tripId, p) => post(`/api/trips/${tripId}/participants`, p).then(r => r.participants),
    updateParticipant: (tripId, pid, p) => patch(`/api/trips/${tripId}/participants/${pid}`, p).then(r => r.participants),
    removeParticipant: (tripId, pid) => del(`/api/trips/${tripId}/participants/${pid}`),

    // ---- geography ----
    createCountry: (c) => post("/api/geo/countries", { code: c.id, name: c.name, nameLocal: c.cn || null })
      .then(r => r.country),
    createArea: (a) => post("/api/geo/areas", {
      id: a.id, countryCode: a.country, name: a.name, nameLocal: a.cn || null,
      kind: a.kind || "city", lat: a.center ? a.center[0] : null, lng: a.center ? a.center[1] : null,
      zoom: a.zoom || 11,
    }).then(r => r.area),

    // ---- preferences (theme, base point, panel widths) ----
    savePrefs: (prefs) => put("/api/users/me/prefs", prefs).then(r => r.prefs),
  };

  global.PlannerAPI = { boot, Repo, ApiError, toPlace, toTrip, toPlanDoc, BASE };
})(window);
