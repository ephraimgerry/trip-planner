const db = require("../../core/db");
const now = db.now;

const find = (tid, uid) => db.prepare(
  "SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ?").get(tid, uid);
const listFor = (tid) => db.prepare(
  `SELECT m.trip_id, m.user_id, m.role, m.joined_at, u.email, u.name, u.status
     FROM trip_members m JOIN users u ON u.id = m.user_id
    WHERE m.trip_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.name`
).all(tid);
const add = (tid, uid, role, invitedBy) => db.prepare(
  `INSERT INTO trip_members (trip_id,user_id,role,invited_by,created_at) VALUES (?,?,?,?,?)
   ON CONFLICT(trip_id,user_id) DO UPDATE SET role = excluded.role`
).run(tid, uid, role, invitedBy || null, now());
const setRole = (tid, uid, role) => db.prepare(
  "UPDATE trip_members SET role = ? WHERE trip_id = ? AND user_id = ?").run(role, tid, uid);
const remove = (tid, uid) => db.prepare(
  "DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?").run(tid, uid);
// A trip must never lose its last owner.
const ownerCount = (tid) => db.prepare(
  "SELECT COUNT(*) n FROM trip_members WHERE trip_id = ? AND role = 'owner'").get(tid).n;

module.exports = { find, listFor, add, setRole, remove, ownerCount };
