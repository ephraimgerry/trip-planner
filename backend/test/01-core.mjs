const B = process.env.API_BASE || "http://127.0.0.1:4199";
const J = { "content-type": "application/json" };
let fails = 0;
const ok = (n, c, extra="") => { console.log(`${c ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`); if (!c) fails++; };
const get = async (p) => { const r = await fetch(B+p); return { s: r.status, b: await r.json().catch(()=>null) }; };
const send = async (m, p, body) => { const r = await fetch(B+p, { method: m, headers: J, body: body===undefined?undefined:JSON.stringify(body) }); return { s: r.status, b: await r.json().catch(()=>null) }; };

let r = await get("/health");           ok("health", r.s===200 && r.b.ok);
r = await get("/readyz");               ok("readyz", r.s===200);
r = await get("/api/auth/status");      ok("auth status", r.s===200 && r.b.mode==="bypass" && r.b.signupOpen===false, JSON.stringify(r.b));
r = await get("/api/bootstrap");
const boot = r.b;
ok("bootstrap", r.s===200 && boot.places.length>200, `places=${boot.places?.length} areas=${boot.areas?.length} districts=${boot.districts?.length} trips=${boot.trips?.length}`);
ok("place has geography", !!boot.places.find(p=>p.area_id && p.district_id && p.country_code));
ok("place images loaded", boot.places.some(p=>p.images.length>0));

r = await get("/api/geo/districts.geojson");
ok("district polygons", r.s===200 && r.b.features.length===38);

// ---- create a trip, give it a plan with a hotel-as-place ----
r = await send("POST","/api/trips",{ name:"API test trip", startDate:"2027-03-01", endDate:"2027-03-05" });
ok("create trip", r.s===201, r.b?.trip?.id);
const tid = r.b.trip.id;
ok("creator is owner", r.b.trip.members?.[0]?.role==="owner");
ok("days derived", r.b.trip.days.length===5);

// a hotel is just a place
r = await send("POST","/api/places",{ kind:"lodging", name:"Test Hotel Bund", areaId:"shanghai", lat:31.2344, lng:121.4881, address:"15 Zhongshan East 2nd Rd" });
ok("create lodging place", r.s===201 && r.b.place.kind==="lodging", `district=${r.b.place?.district_id}`);
const hotelId = r.b.place.id;
ok("lodging got district by polygon", r.b.place.district_id==="huangpu", r.b.place?.district_id);

r = await send("PUT",`/api/trips/${tid}/plan`,{
  stays:[{ areaId:"shanghai", placeId:hotelId, checkIn:"2027-03-01", checkOut:"2027-03-03", booked:true },
          { areaId:"suzhou", checkIn:"2027-03-03", checkOut:"2027-03-05" }],
  commutes:[
    { kind:"flight", direction:"outbound", code:"SQ836", startDate:"2027-03-01", fromLabel:"SIN 17:00", toLabel:"PVG 22:00", status:"booked" },
    { kind:"train", groupId:"hop1", chosen:true, startDate:"2027-03-03", fromLabel:"Shanghai", toLabel:"Suzhou", label:"G train 30min", durationMin:30 },
    { kind:"taxi",  groupId:"hop1", chosen:false, startDate:"2027-03-03", fromLabel:"Shanghai", toLabel:"Suzhou", label:"Car" },
    { kind:"car_rental", startDate:"2027-03-03", endDate:"2027-03-05", operator:"Hertz", label:"Compact",
      status:"booked", price:300, currency:"SGD", attrs:{ vendor:"Hertz", fuelPolicy:"full-to-full" } },
  ],
  items:[{ date:"2027-03-02", placeId:"the-bund", slot:"evening" },
         { date:"2027-03-02", placeId:"yu-garden", startTime:"09:30", endTime:"11:00" }],
  alternatives:[{ placeId:"shanghai-museum" },{ placeId:"tianzifang" }],
});
ok("put plan", r.s===200, r.b?.error?.message);
const doc = r.b.trip;
ok("hotel is a place ref", doc.stays[0].placeId===hotelId);
const travel = doc.days.find(d=>d.date==="2027-03-03");
ok("travel day has two stays", travel.stays.length===2, `areas=${travel.areaIds.join(",")}`);
ok("travel day two areas", travel.areaIds.length===2 && travel.areaIds[0]==="shanghai");
ok("checkout stay marked departing", travel.stays[0].departing===true && travel.stays[1].arriving===true);
const mid = doc.days.find(d=>d.date==="2027-03-02");
ok("optional exact timing kept", mid.items.find(i=>i.placeId==="yu-garden").startTime==="09:30");
ok("slot-only item kept", mid.items.find(i=>i.placeId==="the-bund").slot==="evening");
ok("hop alternatives grouped", doc.commutes.filter(c=>c.groupId==="hop1").length===2);
ok("one chosen per hop", doc.commutes.filter(c=>c.groupId==="hop1"&&c.chosen).length===1
   && doc.commutes.find(c=>c.groupId==="hop1"&&c.chosen).label==="G train 30min");
const car=doc.commutes.find(c=>c.kind==="car_rental");
ok("car rental spans its days", car.spansDays===true
   && doc.days.filter(d=>d.commuteIds.includes(car.id)).length===3,
   doc.days.filter(d=>d.commuteIds.includes(car.id)).map(d=>d.date).join(","));
ok("car rental typed attrs kept", car.attrs.fuelPolicy==="full-to-full" && car.price===300);
ok("flight still identifiable", doc.commutes.find(c=>c.kind==="flight"&&c.direction==="outbound").code==="SQ836");

// ---- suggestions: curated, minus scheduled, minus visited ----
r = await get(`/api/trips/${tid}/days/2027-03-02/suggestions`);
ok("suggestions from saved shortlist", r.s===200 && r.b.suggestions.length===2, r.b.suggestions?.map(s=>s.id).join(","));
await send("PUT","/api/places/shanghai-museum/me",{ status:"visited" });
r = await get(`/api/trips/${tid}/days/2027-03-02/suggestions`);
ok("visited place drops out of suggestions", r.b.suggestions.length===1 && r.b.suggestions[0].id==="tianzifang", r.b.suggestions?.map(s=>s.id).join(","));
r = await get(`/api/trips/${tid}/days/2027-03-05/suggestions`);
ok("suggestions scoped to that day's area", r.b.suggestions.length===0, r.b.suggestions?.map(s=>s.id).join(","));

// ---- validation & security ----
r = await send("POST","/api/trips",{ name:"bad", startDate:"2027-03-09", endDate:"2027-03-01" });
ok("rejects end before start", r.s===400, r.b?.error?.code);
r = await send("POST","/api/places",{ name:"x", link:"javascript:alert(1)" });
ok("rejects javascript: link", r.s===400);
r = await send("POST","/api/places",{ name:"x", lat:999 });
ok("rejects out-of-range lat", r.s===400);
r = await send("POST","/api/trips",{ name:"x", startDate:"2027-01-01", endDate:"2027-01-02", surprise:"boo" });
ok("strips/rejects unknown fields", r.s===400 || !("surprise" in (r.b.trip||{})));
r = await get("/api/trips/does-not-exist");
ok("unknown trip is 404 not 403", r.s===404);
r = await fetch(B+"/api/trips",{ method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body:"name=csrf" });
ok("blocks non-JSON state change (CSRF shape)", r.status===403, String(r.status));
r = await fetch(B+"/api/bootstrap",{ headers:{ origin:"https://evil.example" }});
ok("rejects unknown origin", r.status===403, String(r.status));
r = await get("/api/nope");
ok("unknown endpoint 404", r.s===404);
const h = (await fetch(B+"/health")).headers;
ok("security headers present", h.get("x-frame-options")==="DENY" && !!h.get("content-security-policy") && !h.get("x-powered-by"));
ok("request id echoed", !!h.get("x-request-id"));

// ---- members / rbac shape ----
r = await get(`/api/trips/${tid}/members`);
ok("members listed", r.s===200 && r.b.members.length===1);
r = await send("POST",`/api/trips/${tid}/members`,{ email:"stranger@example.com", role:"editor" });
ok("cannot add a non-account (invite only)", r.s===404, r.b?.error?.message);
r = await send("PATCH",`/api/trips/${tid}/members/${boot.me.id}`,{ role:"viewer" });
ok("last owner cannot be demoted", r.s===409, r.b?.error?.message);

// no content-type on purpose: a body-less DELETE must not be blocked by the CSRF rule
r = await fetch(B+`/api/trips/${tid}`, { method: "DELETE" });
ok("body-less DELETE allowed", r.status===204, String(r.status));
r = await get(`/api/trips/${tid}`);
ok("deleted trip gone", r.s===404);
await send("PUT","/api/places/shanghai-museum/me",{ status:null });

// rate limiting must key on the IPv6 network, not the individual address —
// otherwise a client with a /64 rotates addresses and never hits a limit
{
  const one = await fetch(B+"/health", { headers: { "cf-connecting-ip": "2001:db8:abcd:1234::1" } });
  const two = await fetch(B+"/health", { headers: { "cf-connecting-ip": "2001:db8:abcd:1234::2" } });
  const a = one.headers.get("ratelimit-remaining"), b2 = two.headers.get("ratelimit-remaining");
  ok("IPv6 addresses in one network share a rate-limit bucket",
     a !== null && b2 !== null && Number(b2) === Number(a) - 1, `${a} then ${b2}`);
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nall api checks passed");
process.exit(fails?1:0);
