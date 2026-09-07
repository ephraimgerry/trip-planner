const B = process.env.API_BASE || "http://127.0.0.1:4199", J={"content-type":"application/json"};
let fails=0; const ok=(n,c,x="")=>{console.log(`${c?"  ok  ":"FAIL  "}${n}${x?" — "+x:""}`);if(!c)fails++;};
const get=async p=>{const r=await fetch(B+p);return{s:r.status,b:await r.json().catch(()=>null)};};
const snd=async(m,p,b)=>{const r=await fetch(B+p,{method:m,headers:J,body:b===undefined?undefined:JSON.stringify(b)});return{s:r.status,b:await r.json().catch(()=>null)};};

let r=await get("/api/bootstrap");
const t=r.b.trips.find(x=>/Shanghai/.test(x.name));
const d=(n)=>t.days[n-1];
ok("D9 same city, hotel change → not travel", d(9).travel===false && d(9).areaIds.join()==="hangzhou",
   `${d(9).areaIds.join("→")} travel=${d(9).travel}`);
ok("D9 still shows its transport", d(9).commuteIds.length>=1, String(d(9).commuteIds.length));
ok("D6 city change → travel", d(6).travel===true && d(6).areaIds.join("→")==="shanghai→suzhou");
ok("D7 travel", d(7).travel===true);
ok("D10 travel", d(10).travel===true);
ok("D1 airport transfer → not travel", d(1).travel===false, `${d(1).areaIds.join("→")}`);
ok("D15 airport transfer → not travel", d(15).travel===false);
ok("only three travel days", t.days.filter(x=>x.travel).length===3,
   t.days.filter(x=>x.travel).map(x=>x.date).join(","));
const cross=t.commutes.filter(c=>c.chosen&&c.crossesArea);
ok("crossesArea exposed", cross.length===3, cross.map(c=>`${c.fromAreaId}→${c.toAreaId}`).join(" "));

// ---- day trip: out and back, no hotel change ----
r=await snd("POST","/api/trips",{name:"Day trip test",startDate:"2027-06-01",endDate:"2027-06-03"});
const tid=r.b.trip.id;
r=await snd("PUT",`/api/trips/${tid}/plan`,{
  stays:[{areaId:"shanghai",checkIn:"2027-06-01",checkOut:"2027-06-03"}],
  commutes:[
    {kind:"train",startDate:"2027-06-02",fromLabel:"Shanghai",toLabel:"Suzhou",label:"G train out"},
    {kind:"train",startDate:"2027-06-02",fromLabel:"Suzhou",toLabel:"Shanghai",label:"G train back"},
    {kind:"metro",startDate:"2027-06-01",fromLabel:"Shanghai",toLabel:"Shanghai",label:"across town"},
  ],
  items:[], alternatives:[],
});
ok("day trip saves", r.s===200, r.b?.error?.message);
const dt=r.b.trip.days;
ok("labels resolved to areas without being told",
   r.b.trip.commutes.every(c=>c.fromAreaId && c.toAreaId),
   r.b.trip.commutes.map(c=>`${c.fromAreaId}→${c.toAreaId}`).join(" "));
ok("day trip reads A → B → A", dt[1].areaIds.join("→")==="shanghai→suzhou→shanghai", dt[1].areaIds.join("→"));
ok("day trip counts as travel", dt[1].travel===true);
ok("same-city metro day is not travel", dt[0].travel===false && dt[0].areaIds.join("→")==="shanghai", `${dt[0].areaIds.join("→")} travel=${dt[0].travel}`);
ok("quiet day is not travel", dt[2].travel===false);
await fetch(B+`/api/trips/${tid}`,{method:"DELETE"});
console.log(fails?`\n${fails} FAILURE(S)`:"\nall travel-flag checks passed");
process.exit(fails?1:0);
