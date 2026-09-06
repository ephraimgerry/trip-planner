const db = require("../../core/db");
const { id } = require("../../core/ids");
const now = db.now;

const forTrip = (tid) => db.prepare(
  "SELECT * FROM trip_participants WHERE trip_id = ? ORDER BY ord, name").all(tid);

const datesFor = (tid) => db.prepare(
  `SELECT d.* FROM trip_participant_dates d
     JOIN trip_participants p ON p.id = d.participant_id
    WHERE p.trip_id = ? ORDER BY d.start_date`).all(tid);

const stayLinks = (tid) => db.prepare(
  `SELECT sp.stay_id, sp.participant_id FROM trip_stay_participants sp
     JOIN trip_stays s ON s.id = sp.stay_id WHERE s.trip_id = ?`).all(tid);

const byId = (pid) => db.prepare("SELECT * FROM trip_participants WHERE id = ?").get(pid);

function create(tid, p) {
  const pid = p.id || id("prt");
  db.prepare(`INSERT INTO trip_participants (id,trip_id,user_id,name,email,colour,is_organiser,note,ord,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(pid, tid, p.userId || null, p.name, p.email || null, p.colour || null,
         p.isOrganiser ? 1 : 0, p.note || null, p.ord ?? 0, now());
  setDates(pid, p.dates || []);
  return byId(pid);
}

function update(pid, p) {
  const map = { name: "name", email: "email", colour: "colour", note: "note", ord: "ord" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map))
    if (p[k] !== undefined) { sets.push(`${col} = ?`); vals.push(p[k]); }
  if (p.isOrganiser !== undefined) { sets.push("is_organiser = ?"); vals.push(p.isOrganiser ? 1 : 0); }
  if (sets.length) { vals.push(pid); db.prepare(`UPDATE trip_participants SET ${sets.join(", ")} WHERE id = ?`).run(...vals); }
  if (p.dates !== undefined) setDates(pid, p.dates);
  return byId(pid);
}

// One row per continuous stint. No rows at all means "here the whole trip",
// which keeps the common case free of data entry.
function setDates(pid, ranges) {
  db.prepare("DELETE FROM trip_participant_dates WHERE participant_id = ?").run(pid);
  const ins = db.prepare(
    "INSERT INTO trip_participant_dates (id,participant_id,start_date,end_date,note) VALUES (?,?,?,?,?)");
  (ranges || []).forEach(r => ins.run(id("pdt"), pid, r.startDate, r.endDate, r.note || null));
}

const remove = (pid) => db.prepare("DELETE FROM trip_participants WHERE id = ?").run(pid);

module.exports = { forTrip, datesFor, stayLinks, byId, create, update, setDates, remove };
