const B = process.env.API_BASE || "http://127.0.0.1:4199", J={"content-type":"application/json"};
let fails=0; const ok=(n,c,x="")=>{console.log(`${c?"  ok  ":"FAIL  "}${n}${x?" — "+x:""}`); if(!c)fails++;};
const get=async p=>{const r=await fetch(B+p);return{s:r.status,b:await r.json().catch(()=>null)};};
const snd=async(m,p,b)=>{const r=await fetch(B+p,{method:m,headers:J,body:b===undefined?undefined:JSON.stringify(b)});return{s:r.status,b:await r.json().catch(()=>null)};};

let r=await get("/api/trips/commute-kinds");
ok("kind catalogue", r.s===200 && r.b.kinds.length===11, r.b.kinds?.filter(k=>k.spans_days).map(k=>k.id).join(","));
r=await get("/api/bootstrap");
const trip=r.b.trips.find(t=>/Shanghai/.test(t.name));
const kinds=[...new Set(trip.commutes.map(c=>c.kind))];
ok("imported trip has commutes of several kinds", trip.commutes.length>=14 && kinds.length>=3, `${trip.commutes.length} rows, kinds=${kinds.join(",")}`);
ok("flights survived as commutes", trip.commutes.filter(c=>c.kind==="flight").length===2);
ok("hop groups intact", new Set(trip.commutes.filter(c=>c.groupId).map(c=>c.groupId)).size===6,
   String(new Set(trip.commutes.filter(c=>c.groupId).map(c=>c.groupId)).size));
ok("one chosen per group", (()=>{const g={};trip.commutes.filter(c=>c.groupId).forEach(c=>g[c.groupId]=(g[c.groupId]||0)+(c.chosen?1:0));return Object.values(g).every(n=>n===1);})());

// ---- car rental: spans days, carries typed attrs ----
const plan = {
  stays: trip.stays.map(s=>({id:s.id,areaId:s.areaId,placeId:s.placeId,checkIn:s.checkIn,checkOut:s.checkOut,booked:s.booked})),
  commutes: trip.commutes.map(c=>({kind:c.kind,groupId:c.groupId,chosen:c.chosen,direction:c.direction,
    startDate:c.startDate,endDate:c.endDate,fromLabel:c.fromLabel,toLabel:c.toLabel,label:c.label,
    code:c.code,status:c.status,attrs:c.attrs})).concat([{
      kind:"car_rental", startDate:"2026-11-13", endDate:"2026-11-16",
      fromLabel:"Hangzhou East Station", toLabel:"Hangzhou East Station",
      label:"Hertz compact", operator:"Hertz", code:"HZ-99213", status:"booked",
      price:412.5, currency:"CNY",
      attrs:{ vendor:"Hertz", vehicleClass:"Compact SUV", plate:"浙A·8821D",
              transmission:"auto", fuelPolicy:"full-to-full", deposit:"¥2000" },
    }]),
  items: trip.days.flatMap(d=>d.items.map(i=>({date:d.date,placeId:i.placeId,ord:i.ord,slot:i.slot,startTime:i.startTime,endTime:i.endTime}))),
  alternatives: trip.alternatives.map(a=>({placeId:a.placeId})),
};
r=await snd("PUT",`/api/trips/${trip.id}/plan`,plan);
ok("plan with a car rental saves", r.s===200, r.b?.error?.message||JSON.stringify(r.b?.error?.details||"").slice(0,120));
const d2=r.b.trip;
const car=d2.commutes.find(c=>c.code==="HZ-99213");
ok("car rental stored", !!car && car.kind==="car_rental" && car.spansDays===true, car&&`${car.startDate}->${car.endDate}`);
ok("typed attrs round-trip", car.attrs.fuelPolicy==="full-to-full" && car.attrs.plate==="浙A·8821D");
ok("price kept as a column", car.price===412.5 && car.currency==="CNY");
const held = d2.days.filter(x=>x.commuteIds.includes(car.id)).map(x=>x.date);
ok("car shows on every day it's held", held.length===4 && held[0]==="2026-11-13" && held[3]==="2026-11-16", held.join(","));
ok("unchosen options don't clutter the day", !d2.days.find(x=>x.date==="2026-11-12").commuteIds.some(id=>{
  const c=d2.commutes.find(y=>y.id===id); return c && !c.chosen; }));

// attrs validation at the boundary
r=await snd("PUT",`/api/trips/${trip.id}/plan`,{...plan, commutes:[{kind:"car_rental",startDate:"2026-11-13",attrs:{seatPitch:"31in"}}]});
ok("rejects attrs that don't belong to the kind", r.s===400, r.b?.error?.details?.[0]?.message);
r=await snd("PUT",`/api/trips/${trip.id}/plan`,{...plan, commutes:[{kind:"submarine",startDate:"2026-11-13"}]});
ok("rejects an unknown kind", r.s===400);

// ---- participants with duration ----
r=await snd("POST",`/api/trips/${trip.id}/participants`,{name:"Me",isOrganiser:true});
ok("add a whole-trip participant", r.s===201 && r.b.participants[0].wholeTrip===true);
r=await snd("POST",`/api/trips/${trip.id}/participants`,{name:"Late Joiner", dates:[{startDate:"2026-11-13",endDate:"2026-11-18"}]});
ok("add a part-trip participant", r.s===201);
r=await snd("POST",`/api/trips/${trip.id}/participants`,{name:"Two Stints", dates:[
  {startDate:"2026-11-07",endDate:"2026-11-09"},{startDate:"2026-11-18",endDate:"2026-11-21"}]});
ok("someone can leave and rejoin", r.s===201 && r.b.participants.find(p=>p.name==="Two Stints").dates.length===2);
r=await get(`/api/trips/${trip.id}`);
const doc=r.b.trip;
const on=(d)=>doc.days.find(x=>x.date===d).participantIds.length;
ok("day 1: organiser + two-stints", on("2026-11-07")===2, String(on("2026-11-07")));
ok("day 11-11: only the organiser", on("2026-11-11")===1, String(on("2026-11-11")));
ok("day 11-14: organiser + late joiner", on("2026-11-14")===2, String(on("2026-11-14")));
ok("day 11-19: organiser + two-stints back", on("2026-11-19")===2, String(on("2026-11-19")));
r=await snd("POST",`/api/trips/${trip.id}/participants`,{name:"X", dates:[{startDate:"2026-11-20",endDate:"2026-11-10"}]});
ok("rejects a stint that ends before it starts", r.s===400);

// cleanup
for (const p of doc.participants) await snd("DELETE",`/api/trips/${trip.id}/participants/${p.id}`);
r=await get(`/api/trips/${trip.id}`);
ok("participants removed", r.b.trip.participants.length===0);
console.log(fails?`\n${fails} FAILURE(S)`:"\nall commute + people checks passed");
process.exit(fails?1:0);
