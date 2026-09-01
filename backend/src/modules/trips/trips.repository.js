const crypto = require("crypto");
const db = require("../../core/db");

function assemble(row) {
  if (!row) return null;
  const plan = {};
  for (const r of db.prepare("SELECT date, place_id FROM trip_places WHERE trip_id=? ORDER BY date, ord").all(row.id)) {
    (plan[r.date] = plan[r.date] || []).push(r.place_id);
  }
  const wishlist = db.prepare("SELECT place_id FROM trip_alternatives WHERE trip_id=? ORDER BY ord").all(row.id).map(r => r.place_id);
  return {
    id: row.id, name: row.name, start: row.start_date, end: row.end_date,
    outbound: JSON.parse(row.outbound || "null"), inbound: JSON.parse(row.inbound || "null"),
    segments: JSON.parse(row.segments || "[]"), legs: JSON.parse(row.legs || "[]"),
    plan, wishlist,
  };
}
const getRow = (id) => db.prepare("SELECT * FROM trips WHERE id=?").get(id);
const get = (id) => assemble(getRow(id));
const listByUser = (userId) => db.prepare("SELECT id FROM trips WHERE user_id=? ORDER BY start_date").all(userId).map(r => get(r.id));

function writeChildren(id, plan, wishlist) {
  db.prepare("DELETE FROM trip_places WHERE trip_id=?").run(id);
  db.prepare("DELETE FROM trip_alternatives WHERE trip_id=?").run(id);
  const p = db.prepare("INSERT OR IGNORE INTO trip_places(trip_id,date,place_id,ord) VALUES(?,?,?,?)");
  for (const [date, ids] of Object.entries(plan || {})) ids.forEach((pid, i) => p.run(id, date, pid, i));
  const a = db.prepare("INSERT OR IGNORE INTO trip_alternatives(trip_id,place_id,ord) VALUES(?,?,?)");
  (wishlist || []).forEach((pid, i) => a.run(id, pid, i));
}

function upsert(userId, t) {
  const id = t.id || "trip-" + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const exists = getRow(id);
  const base = {
    id, user_id: userId, name: t.name, start_date: t.start, end_date: t.end,
    outbound: JSON.stringify(t.outbound || null), inbound: JSON.stringify(t.inbound || null),
    segments: JSON.stringify(t.segments || []), legs: JSON.stringify(t.legs || []),
  };
  db.transaction(() => {
    if (exists) {
      db.prepare(`UPDATE trips SET name=@name,start_date=@start_date,end_date=@end_date,outbound=@outbound,
        inbound=@inbound,segments=@segments,legs=@legs,updated_at=@updated_at WHERE id=@id`)
        .run({ ...base, updated_at: now });
    } else {
      db.prepare(`INSERT INTO trips(id,user_id,name,start_date,end_date,outbound,inbound,segments,legs,created_at,updated_at)
        VALUES(@id,@user_id,@name,@start_date,@end_date,@outbound,@inbound,@segments,@legs,@created_at,@updated_at)`)
        .run({ ...base, created_at: now, updated_at: now });
    }
    writeChildren(id, t.plan, t.wishlist);
  })();
  return get(id);
}
const remove = (id) => {
  return db.transaction(() => {
    db.prepare("DELETE FROM trip_places WHERE trip_id=?").run(id);
    db.prepare("DELETE FROM trip_alternatives WHERE trip_id=?").run(id);
    return db.prepare("DELETE FROM trips WHERE id=?").run(id).changes > 0;
  })();
};
function setDay(id, date, placeIds) {
  db.prepare("DELETE FROM trip_places WHERE trip_id=? AND date=?").run(id, date);
  const p = db.prepare("INSERT OR IGNORE INTO trip_places(trip_id,date,place_id,ord) VALUES(?,?,?,?)");
  placeIds.forEach((pid, i) => p.run(id, date, pid, i));
  return get(id);
}
function addAlt(id, placeId) {
  const n = db.prepare("SELECT COUNT(*) c FROM trip_alternatives WHERE trip_id=?").get(id).c;
  db.prepare("INSERT OR IGNORE INTO trip_alternatives(trip_id,place_id,ord) VALUES(?,?,?)").run(id, placeId, n);
  return get(id);
}
const removeAlt = (id, placeId) => { db.prepare("DELETE FROM trip_alternatives WHERE trip_id=? AND place_id=?").run(id, placeId); return get(id); };
const ownerOf = (id) => (getRow(id) || {}).user_id;
module.exports = { get, listByUser, upsert, remove, setDay, addAlt, removeAlt, ownerOf };
