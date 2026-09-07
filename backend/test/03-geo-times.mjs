const B = process.env.API_BASE || "http://127.0.0.1:4199", J={"content-type":"application/json"};
let fails=0; const ok=(n,c,x="")=>{console.log(`${c?"  ok  ":"FAIL  "}${n}${x?" — "+x:""}`);if(!c)fails++;};
const get=async p=>{const r=await fetch(B+p);return{s:r.status,b:await r.json().catch(()=>null)};};
const snd=async(m,p,b)=>{const r=await fetch(B+p,{method:m,headers:J,body:b===undefined?undefined:JSON.stringify(b)});return{s:r.status,b:await r.json().catch(()=>null)};};

let r=await get("/api/bootstrap");
const areas=r.b.areas;
ok("countries seeded", r.b.countries.length===3, r.b.countries.map(c=>c.code).join(","));
ok("japan areas", areas.filter(a=>a.country_code==="jp").length===23);
ok("vietnam areas", areas.filter(a=>a.country_code==="vn").length===18);
const kyoto=areas.find(a=>a.id==="kyoto"), hoian=areas.find(a=>a.id==="hoi-an");
ok("kyoto has coords + local name", kyoto.lat===35.0116 && kyoto.name_local==="京都");
ok("hoi an has coords + local name", hoian.lat===15.8801 && hoian.name_local==="Hội An", hoian.name_local);
ok("kinds recorded", new Set(areas.map(a=>a.kind)).size>=3, [...new Set(areas.map(a=>a.kind))].join(","));
const hotels=r.b.places.filter(p=>p.kind==="lodging");
ok("hotels get a check-in policy", hotels.length>0 && hotels.every(h=>h.attrs.checkInTime==="15:00"),
   `${hotels.length} hotels`);

// ---- A -> B -> A inside one day, plus stay times and item timing ----
r=await snd("POST","/api/trips",{name:"Shape test",startDate:"2027-05-01",endDate:"2027-05-06"});
const tid=r.b.trip.id;
r=await snd("PUT",`/api/trips/${tid}/plan`,{
  stays:[
    {areaId:"tokyo", checkIn:"2027-05-01", checkOut:"2027-05-03", checkInTime:"15:00", checkOutTime:"10:00"},
    {areaId:"hakone",checkIn:"2027-05-03", checkOut:"2027-05-03", checkInTime:"14:00", checkOutTime:"11:00"},
    {areaId:"tokyo", checkIn:"2027-05-03", checkOut:"2027-05-06", checkInTime:"16:00"},
  ],
  commutes:[], alternatives:[],
  items:[{date:"2027-05-02", placeId:"the-bund", slot:"evening"},
         {date:"2027-05-02", placeId:"yu-garden", startTime:"09:30", endTime:"11:00", note:"timed entry, ref 8821"}],
});
ok("A→B→A day saves", r.s===200, r.b?.error?.message);
const day=r.b.trip.days.find(d=>d.date==="2027-05-03");
ok("three legs kept in order", day.areaIds.length===3 && day.areaIds.join("→")==="tokyo→hakone→tokyo", day.areaIds.join("→"));
ok("three stays touch that day", day.stays.length===3);
ok("stay times round-trip", day.stays[0].checkOutTime==="10:00" && day.stays[2].checkInTime==="16:00",
   day.stays.map(s=>`${s.checkInTime||"-"}/${s.checkOutTime||"-"}`).join(" "));
const d2=r.b.trip.days.find(d=>d.date==="2027-05-02");
const yu=d2.items.find(i=>i.placeId==="yu-garden");
ok("item exact timing kept", yu.startTime==="09:30" && yu.endTime==="11:00");
ok("item note kept", yu.note==="timed entry, ref 8821");
ok("item slot-only kept", d2.items.find(i=>i.placeId==="the-bund").slot==="evening");
r=await snd("PUT",`/api/trips/${tid}/plan`,{stays:[{areaId:"tokyo",checkIn:"2027-05-01",checkOut:"2027-05-02",checkInTime:"9am"}],commutes:[],items:[],alternatives:[]});
ok("rejects a malformed time", r.s===400, r.b?.error?.details?.[0]?.path);
await fetch(B+`/api/trips/${tid}`,{method:"DELETE"});
console.log(fails?`\n${fails} FAILURE(S)`:"\nall checks passed");
process.exit(fails?1:0);
