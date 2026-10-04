// Events (migration 009): temporary, own taxonomy, linked to trips outside the plan document.
const B = process.env.API_BASE || "http://127.0.0.1:4199";
const J = { "content-type": "application/json" };
let fails = 0;
const ok = (n, c, extra="") => { console.log(`${c ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`); if (!c) fails++; };
const get = async (p) => { const r = await fetch(B+p); return { s: r.status, b: await r.json().catch(()=>null) }; };
const send = async (m, p, body) => { const r = await fetch(B+p, { method: m, headers: J, body: body===undefined?undefined:JSON.stringify(body) }); return { s: r.status, b: await r.json().catch(()=>null) }; };

let r = await get("/api/events/categories");
ok("categories", r.s===200 && r.b.categories.length===18, `n=${r.b?.categories?.length}`);
ok("SmartShanghai's taxonomy", ["art","activities","live-music","festivals"].every(c => r.b.categories.some(x => x.id===c)));

// a long-running exhibition with its own pin, in Jing'an
r = await send("POST","/api/events",{ name:"Test Studio", category:"activities", areaId:"shanghai",
  lat:31.2345, lng:121.4605, startDate:"2026-01-01", endDate:"2026-12-31", isFree:true,
  attrs:{ opensAt:"10:00", closesAt:"21:30", booking:"none" } });
ok("create event", r.s===201, r.b?.event?.id);
const ev = r.b.event;
ok("district from the polygons", ev.district_id==="jingan", ev.district_id);
ok("country follows the area", ev.country_code==="cn");
ok("free is a boolean", ev.is_free===true);
ok("hours kept as attrs", ev.attrs.opensAt==="10:00" && ev.attrs.closesAt==="21:30");

r = await send("POST","/api/events",{ name:"Backwards", category:"art", startDate:"2026-05-02", endDate:"2026-05-01" });
ok("end before start rejected", r.s===400, String(r.s));
r = await send("POST","/api/events",{ name:"Made up", category:"rodeo", startDate:"2026-05-02" });
ok("unknown category rejected", r.s===400, String(r.s));

// at a saved place: inherits that place's pin and area
const boot = (await get("/api/bootstrap")).b;
const venue = boot.places.find(p => p.area_id==="shanghai" && p.lat && p.district_id);
r = await send("POST","/api/events",{ name:"Gig at a venue", category:"live-music", venuePlaceId:venue.id,
  startDate:"2027-03-03" });
ok("venue event", r.s===201, r.b?.event?.venue_name);
const gig = r.b.event;
ok("takes the venue's pin", gig.lat===venue.lat && gig.lng===venue.lng && gig.area_id===venue.area_id);
ok("bootstrap ships events + categories", Array.isArray(boot.events) && boot.eventCategories?.length===18);

// "what's on while I'm there"
r = await get("/api/events?from=2027-03-01&to=2027-03-05&areas=shanghai");
ok("date-window query finds the one-day gig", r.s===200 && r.b.events.some(e => e.id===gig.id));
ok("and not the 2026 exhibition", !r.b.events.some(e => e.id===ev.id));
r = await get("/api/events?from=2026-11-07&to=2026-11-21");
ok("a long run overlaps a trip inside it", r.b.events.some(e => e.id===ev.id));

// ---- on a trip ----
r = await send("POST","/api/trips",{ name:"Events test trip", startDate:"2027-03-01", endDate:"2027-03-05" });
const tid = r.b.trip.id;
r = await send("POST",`/api/trips/${tid}/events`,{ eventId:ev.id, date:"2027-03-02" });
ok("can't schedule outside the event's run", r.s===400, r.b?.error?.message || String(r.s));
r = await send("POST",`/api/trips/${tid}/events`,{ eventId:gig.id, date:"2027-03-09" });
ok("can't schedule outside the trip", r.s===400);
r = await send("POST",`/api/trips/${tid}/events`,{ eventId:gig.id });
ok("shortlist (no date)", r.s===201 && r.b.tripEvent.date===null);
r = await send("POST",`/api/trips/${tid}/events`,{ eventId:gig.id, date:"2027-03-03", startTime:"20:00" });
ok("adding again moves it onto the day", r.s===201 && r.b.tripEvent.date==="2027-03-03");
const te = r.b.tripEvent;

r = await get(`/api/trips/${tid}`);
ok("trip document carries its events", r.b.trip.events?.length===1 && r.b.trip.events[0].startTime==="20:00");

// the property the separate table exists for: a whole-plan save leaves events alone
r = await send("PUT",`/api/trips/${tid}/plan`,{ stays:[], commutes:[], items:[], alternatives:[] });
ok("plan replaced", r.s===200, String(r.s));
r = await get(`/api/trips/${tid}`);
ok("events survive PUT /plan", r.b.trip.events?.length===1);

r = await send("PATCH",`/api/trips/${tid}/events/${te.id}`,{ date:"2027-03-01" });
ok("re-dating checks the run too", r.s===400);
r = await send("PATCH",`/api/trips/${tid}/events/${te.id}`,{ note:"front row" });
ok("note editable", r.s===200 && r.b.tripEvent.note==="front row");

r = await send("DELETE",`/api/trips/${tid}/events/${te.id}`);
ok("remove from trip", r.s===204);
r = await send("DELETE",`/api/events/${gig.id}`);
ok("delete event", r.s===204);
r = await send("DELETE",`/api/events/${ev.id}`);
await send("DELETE",`/api/trips/${tid}`);

console.log(fails ? `\n${fails} event check(s) failed` : "\nall event checks passed");
process.exit(fails ? 1 : 0);
