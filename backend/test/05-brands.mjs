// Branches of the same business: the brand entity added in migration 008.
const B = process.env.API_BASE || "http://127.0.0.1:4199";
const J = { "content-type": "application/json" };
let fails = 0;
const ok = (n, c, extra="") => { console.log(`${c ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`); if (!c) fails++; };
const get = async (p) => { const r = await fetch(B+p); return { s: r.status, b: await r.json().catch(()=>null) }; };
const send = async (m, p, body) => { const r = await fetch(B+p, { method: m, headers: J, body: body===undefined?undefined:JSON.stringify(body) }); return { s: r.status, b: await r.json().catch(()=>null) }; };

// the seeded catalogue names its branches "Brand (Branch)" — the migration
// should have picked up the one brand that genuinely repeats
let r = await get("/api/brands");
ok("brands endpoint", r.s===200 && Array.isArray(r.b.brands), `n=${r.b?.brands?.length}`);
const arabica = r.b.brands.find(x => x.name === "% Arabica");
ok("backfilled the repeated prefix", !!arabica, r.b.brands.map(x=>x.name).join(", "));
ok("counted its branches", r.b.counts[arabica?.id] === 2, String(r.b.counts?.[arabica?.id]));

r = await get("/api/bootstrap");
const branches = r.b.places.filter(p => p.brand_id === arabica.id);
ok("places carry brand_id and branch", branches.length===2 && branches.every(p => p.branch),
  branches.map(p=>p.branch).join(" / "));
ok("a lone parenthetical is not a brand",
  !r.b.brands.find(x => /Waipojia|Chīfàné|Bund/.test(x.name)));
ok("bootstrap ships the brand list", Array.isArray(r.b.brands) && r.b.brands.length>0);

// a brand spans countries: that is the whole point of not hanging it off an area
r = await send("POST","/api/brands",{ name:"Test Roasters", link:"https://example.com/" });
ok("create brand", r.s===201 && r.b.brand.id, r.b?.brand?.id);
const bid = r.b.brand.id;
r = await send("POST","/api/brands",{ name:"Test Roasters" });
ok("brand names are unique", r.s===400, String(r.s));

r = await send("POST","/api/places",{ name:"Test Roasters Shanghai", areaId:"shanghai", countryCode:"cn",
  lat:31.23, lng:121.47, brandId:bid, branch:"Shanghai" });
ok("branch one", r.s===201 && r.b.place.brand_id===bid && r.b.place.branch==="Shanghai");
const p1 = r.b.place.id;
r = await send("POST","/api/places",{ name:"Test Roasters Tokyo", areaId:"tokyo", countryCode:"jp",
  lat:35.66, lng:139.70, brandId:bid, branch:"Shibuya" });
ok("branch two, another country", r.s===201 && r.b.place.country_code==="jp" && r.b.place.brand_id===bid);
const p2 = r.b.place.id;

r = await get("/api/brands");
ok("both branches counted", r.b.counts[bid]===2, String(r.b.counts[bid]));

// re-linking an existing place is a normal patch
r = await send("PATCH",`/api/places/${p2}`,{ branch:"Daikanyama" });
ok("branch is editable", r.s===200 && r.b.place.branch==="Daikanyama");

// deleting the brand must unlink, never cascade into the places
r = await send("DELETE",`/api/brands/${bid}`);
ok("delete brand", r.s===204, String(r.s));
r = await get("/api/bootstrap");
const survivors = r.b.places.filter(p => p.id===p1 || p.id===p2);
ok("branches survive their brand", survivors.length===2, `found=${survivors.length}`);
ok("and are unlinked", survivors.every(p => p.brand_id === null), survivors.map(p=>String(p.brand_id)).join(","));

console.log(fails ? `\n${fails} brand check(s) failed` : "\nall brand checks passed");
process.exit(fails ? 1 : 0);
