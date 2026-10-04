// Events on a trip. Kept apart from the plan document on purpose — see
// migration 009: the plan is saved whole, these are saved one at a time.
const db = require("../../core/db");
const { id } = require("../../core/ids");

const COLS = "id,trip_id,event_id,date,start_time,note,ord,added_by,created_at";

const forTrip = (tripId) => db.prepare(
  `SELECT ${COLS} FROM trip_events WHERE trip_id = ? ORDER BY date IS NULL, date, ord`).all(tripId);
const byId = (tripId, teId) => db.prepare(
  `SELECT ${COLS} FROM trip_events WHERE trip_id = ? AND id = ?`).get(tripId, teId);
const byEvent = (tripId, eventId) => db.prepare(
  `SELECT ${COLS} FROM trip_events WHERE trip_id = ? AND event_id = ?`).get(tripId, eventId);

// Adding an event that's already on the trip moves it rather than failing —
// "put it on Tuesday" should work whether or not it was shortlisted first.
function upsert(tripId, v, userId) {
  const existing = byEvent(tripId, v.eventId);
  if (existing) return update(tripId, existing.id, v);
  const ord = db.prepare("SELECT COALESCE(MAX(ord), -1) + 1 n FROM trip_events WHERE trip_id = ? AND date IS ?")
    .get(tripId, v.date || null).n;
  const teId = id("tev");
  db.prepare(`INSERT INTO trip_events (id,trip_id,event_id,date,start_time,note,ord,added_by,created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(teId, tripId, v.eventId, v.date || null, v.startTime || null, v.note || null, ord, userId || null, db.now());
  return byId(tripId, teId);
}

function update(tripId, teId, patch) {
  const map = { date: "date", startTime: "start_time", note: "note" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map))
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); vals.push(patch[k] ?? null); }
  if (sets.length) db.prepare(`UPDATE trip_events SET ${sets.join(", ")} WHERE trip_id = ? AND id = ?`)
    .run(...vals, tripId, teId);
  return byId(tripId, teId);
}

const remove = (tripId, teId) =>
  db.prepare("DELETE FROM trip_events WHERE trip_id = ? AND id = ?").run(tripId, teId).changes;

module.exports = { forTrip, byId, byEvent, upsert, update, remove };
