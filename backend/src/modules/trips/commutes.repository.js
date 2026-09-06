const db = require("../../core/db");
const { id } = require("../../core/ids");
const now = db.now;

// Resolve a free-text endpoint ("Hangzhou (Hubin)") to an area. Kept here so
// every write path agrees with migration 006 — otherwise a hop typed into the
// app would look local while an imported one looked like travel.
let areaCache = null;
const areaList = () => (areaCache ||= db.prepare(
  "SELECT id, lower(name) nm FROM areas ORDER BY length(name) DESC").all());
const invalidateAreas = () => { areaCache = null; };
function resolveArea(label) {
  if (!label) return null;
  const s = String(label).toLowerCase();
  const hit = areaList().find(a => s.includes(a.nm));   // longest name wins
  return hit ? hit.id : null;
}

const kinds = () => db.prepare(
  "SELECT id,label,icon,spans_days,sort FROM commute_kinds ORDER BY sort").all()
  .map(k => ({ ...k, spans_days: !!k.spans_days }));

const forTrip = (tid) => db.prepare(
  "SELECT * FROM trip_commutes WHERE trip_id = ? ORDER BY start_date, ord").all(tid);

const participantsFor = (tid) => db.prepare(
  `SELECT cp.commute_id, cp.participant_id FROM trip_commute_participants cp
     JOIN trip_commutes c ON c.id = cp.commute_id WHERE c.trip_id = ?`).all(tid);

const insert = db.prepare(`INSERT INTO trip_commutes
  (id,trip_id,kind,group_id,chosen,direction,start_date,start_time,end_date,end_time,
   from_area_id,to_area_id,from_place_id,to_place_id,from_label,to_label,
   label,operator,code,status,booking_ref,price_amount,price_currency,duration_min,
   attrs,note,ord,created_at)
  VALUES (@id,@trip_id,@kind,@group_id,@chosen,@direction,@start_date,@start_time,@end_date,@end_time,
   @from_area_id,@to_area_id,@from_place_id,@to_place_id,@from_label,@to_label,
   @label,@operator,@code,@status,@booking_ref,@price_amount,@price_currency,@duration_min,
   @attrs,@note,@ord,@created_at)`);

const insertRider = db.prepare(
  "INSERT OR IGNORE INTO trip_commute_participants (commute_id,participant_id) VALUES (?,?)");

// Rewrite a trip's commutes. Called from inside the plan transaction.
function replaceAll(tid, list) {
  db.prepare("DELETE FROM trip_commutes WHERE trip_id = ?").run(tid);
  const ts = now();
  (list || []).forEach((c, i) => {
    const cid = c.id || id("cmt");
    insert.run({
      id: cid, trip_id: tid, kind: c.kind || "other",
      group_id: c.groupId || null,
      // a standalone commute is always "the plan"; within a group only one wins
      chosen: c.groupId ? (c.chosen ? 1 : 0) : 1,
      direction: c.direction || "internal",
      start_date: c.startDate, start_time: c.startTime || null,
      end_date: c.endDate || null, end_time: c.endTime || null,
      from_area_id: c.fromAreaId || resolveArea(c.fromLabel),
      to_area_id: c.toAreaId || resolveArea(c.toLabel),
      from_place_id: c.fromPlaceId || null, to_place_id: c.toPlaceId || null,
      from_label: c.fromLabel || null, to_label: c.toLabel || null,
      label: c.label || null, operator: c.operator || null, code: c.code || null,
      status: c.status || "idea", booking_ref: c.bookingRef || null,
      price_amount: c.price == null ? null : Number(c.price),
      price_currency: c.currency || null,
      duration_min: c.durationMin ?? null,
      attrs: JSON.stringify(c.attrs || {}),
      note: c.note || null, ord: i, created_at: ts,
    });
    (c.participantIds || []).forEach(pid => insertRider.run(cid, pid));
  });
  // A local hop names a landmark at one end and a city at the other ("Pudong
  // Airport" -> "Shanghai"). Both ends are the same place; without this it
  // would read as travel.
  db.prepare(`UPDATE trip_commutes
       SET from_area_id = COALESCE(from_area_id, to_area_id),
           to_area_id   = COALESCE(to_area_id, from_area_id)
     WHERE trip_id = ? AND kind IN ('taxi','metro','bus','walk','car_own','car_rental')
       AND (from_area_id IS NULL) <> (to_area_id IS NULL)`).run(tid);
  // A group whose options are all unchosen would vanish from the plan; make the
  // first one the answer so the hop stays visible.
  db.prepare(`UPDATE trip_commutes SET chosen = 1
     WHERE trip_id = ? AND group_id IS NOT NULL AND ord = (
       SELECT MIN(ord) FROM trip_commutes c2 WHERE c2.group_id = trip_commutes.group_id)
       AND NOT EXISTS (SELECT 1 FROM trip_commutes c3
                        WHERE c3.group_id = trip_commutes.group_id AND c3.chosen = 1)`).run(tid);
}

module.exports = { kinds, forTrip, participantsFor, replaceAll, resolveArea, invalidateAreas };
