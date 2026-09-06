const db = require("../../core/db");
const { id } = require("../../core/ids");
const commutes = require("./commutes.repository");
const now = db.now;

const byId = (tid) => db.prepare("SELECT * FROM trips WHERE id = ?").get(tid);

// Trips a user may see: theirs by creation, or by membership.
const listFor = (userId) => db.prepare(
  `SELECT DISTINCT t.* FROM trips t
     LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = @u
    WHERE t.created_by = @u OR m.user_id IS NOT NULL
    ORDER BY t.start_date DESC`).all({ u: userId || "" });

function create({ name, startDate, endDate, note }, userId) {
  const tid = id("trip");
  db.prepare(`INSERT INTO trips (id,name,start_date,end_date,note,created_by,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?)`).run(tid, name, startDate, endDate, note || null, userId || null, now(), now());
  if (userId)
    db.prepare(`INSERT INTO trip_members (trip_id,user_id,role,joined_at,created_at)
                VALUES (?,?,'owner',?,?)`).run(tid, userId, now(), now());
  return byId(tid);
}
function update(tid, patch) {
  const map = { name: "name", startDate: "start_date", endDate: "end_date", note: "note" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map))
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); vals.push(patch[k]); }
  if (!sets.length) return byId(tid);
  sets.push("updated_at = ?"); vals.push(now(), tid);
  db.prepare(`UPDATE trips SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return byId(tid);
}
const remove = (tid) => db.prepare("DELETE FROM trips WHERE id = ?").run(tid);

// ---- the pieces a trip is made of ----
const stays = (tid) => db.prepare(
  "SELECT * FROM trip_stays WHERE trip_id = ? ORDER BY check_in, ord").all(tid);
// flights and inter-city legs are both commutes now; see commutes.repository
const items = (tid) => db.prepare(
  "SELECT * FROM trip_items WHERE trip_id = ? ORDER BY date, ord").all(tid);
const alternatives = (tid) => db.prepare(
  "SELECT * FROM trip_alternatives WHERE trip_id = ? ORDER BY ord").all(tid);
const settings = (tid, uid) => db.prepare(
  "SELECT * FROM trip_settings WHERE trip_id = ? AND user_id = ?").get(tid, uid);

const saveSettings = (tid, uid, { basePlaceId }) => db.prepare(
  `INSERT INTO trip_settings (trip_id,user_id,base_place_id,updated_at) VALUES (?,?,?,?)
   ON CONFLICT(trip_id,user_id) DO UPDATE SET base_place_id = excluded.base_place_id,
     updated_at = excluded.updated_at`).run(tid, uid, basePlaceId || null, now());

// -----------------------------------------------------------------------------
// Replace a trip's plan wholesale, inside one transaction. The client edits a
// trip as a document; the server still stores it normalised. Either the whole
// new plan lands or none of it does.
// -----------------------------------------------------------------------------
const replacePlan = db.transaction((tid, doc) => {
  for (const t of ["trip_stays", "trip_items", "trip_alternatives"])
    db.prepare(`DELETE FROM ${t} WHERE trip_id = ?`).run(tid);

  const ts = now();
  const insStay = db.prepare(`INSERT INTO trip_stays
    (id,trip_id,area_id,place_id,check_in,check_out,check_in_time,check_out_time,
     booked,booking_ref,note,ord,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insSleeper = db.prepare(
    "INSERT OR IGNORE INTO trip_stay_participants (stay_id,participant_id) VALUES (?,?)");
  (doc.stays || []).forEach((s, i) => {
    const sid = s.id || id("stay");
    insStay.run(sid, tid, s.areaId || null, s.placeId || null, s.checkIn, s.checkOut,
                s.checkInTime || null, s.checkOutTime || null,
                s.booked ? 1 : 0, s.bookingRef || null, s.note || null, i, ts);
    (s.participantIds || []).forEach(pid => insSleeper.run(sid, pid));
  });

  commutes.replaceAll(tid, doc.commutes);

  const insItem = db.prepare(`INSERT INTO trip_items
    (id,trip_id,date,place_id,slot,start_time,end_time,ord,note,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  (doc.items || []).forEach((it, i) => insItem.run(
    it.id || id("itm"), tid, it.date, it.placeId, it.slot || null,
    it.startTime || null, it.endTime || null, it.ord ?? i, it.note || null, ts));

  const insAlt = db.prepare(`INSERT INTO trip_alternatives
    (id,trip_id,place_id,date,note,ord,added_by,created_at) VALUES (?,?,?,?,?,?,?,?)`);
  (doc.alternatives || []).forEach((a, i) => insAlt.run(
    a.id || id("alt"), tid, a.placeId, a.date || null, a.note || null, i, a.addedBy || null, ts));

  db.prepare("UPDATE trips SET updated_at = ? WHERE id = ?").run(ts, tid);
});

module.exports = { byId, listFor, create, update, remove, stays,
                   items, alternatives, settings, saveSettings, replacePlan };
