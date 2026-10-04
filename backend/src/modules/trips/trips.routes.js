const router = require("express").Router();
const { asyncHandler } = require("../../core/http");
const { validate } = require("../../core/validate");
const { requireAuth } = require("../auth/auth.middleware");
const { requireTripRole } = require("../auth/rbac");
const S = require("./trips.schema");
const repo = require("./trips.repository");
const members = require("./members.repository");
const people = require("./participants.repository");
const commutes = require("./commutes.repository");
const tripEvents = require("./tripEvents.repository");
const events = require("../events/events.repository");
const ES = require("../events/events.schema");
const users = require("../users/users.repository");
const service = require("./trips.service");
const audit = require("../../core/audit");
const { badRequest, notFound, conflict } = require("../../core/errors");
const { z } = require("zod");

router.use(requireAuth);

// The type catalogue — the UI reads labels, icons and the spans-days flag from
// here rather than hardcoding a list that would drift from the database.
router.get("/commute-kinds", asyncHandler(async (_req, res) =>
  res.json({ kinds: commutes.kinds() })));

router.get("/", asyncHandler(async (req, res) => {
  res.json({ trips: repo.listFor(req.user.id).map(t => ({
    id: t.id, name: t.name, startDate: t.start_date, endDate: t.end_date,
    createdBy: t.created_by, updatedAt: t.updated_at,
  })) });
}));

router.post("/", validate({ body: S.tripCreate }), asyncHandler(async (req, res) => {
  const t = repo.create(req.body, req.user.id);
  audit.record(req, "trip.create", "trip", t.id, { name: t.name });
  res.status(201).json({ trip: service.document(t.id, req.user.id) });
}));

router.get("/:tripId", validate({ params: S.tripParams }), requireTripRole("viewer"),
  asyncHandler(async (req, res) => res.json({ trip: service.document(req.params.tripId, req.user.id) })));

router.patch("/:tripId", validate({ params: S.tripParams, body: S.tripPatch }), requireTripRole("editor"),
  asyncHandler(async (req, res) => {
    repo.update(req.params.tripId, req.body);
    audit.record(req, "trip.update", "trip", req.params.tripId, req.body);
    res.json({ trip: service.document(req.params.tripId, req.user.id) });
  }));

// Replace the whole plan. One transaction — it lands completely or not at all.
router.put("/:tripId/plan", validate({ params: S.tripParams, body: S.planDoc }), requireTripRole("editor"),
  asyncHandler(async (req, res) => {
    repo.replacePlan(req.params.tripId, req.body);
    audit.record(req, "trip.plan.replace", "trip", req.params.tripId, {
      stays: req.body.stays.length, commutes: req.body.commutes.length, items: req.body.items.length,
    });
    res.json({ trip: service.document(req.params.tripId, req.user.id) });
  }));

router.delete("/:tripId", validate({ params: S.tripParams }), requireTripRole("owner"),
  asyncHandler(async (req, res) => {
    repo.remove(req.params.tripId);
    audit.record(req, "trip.delete", "trip", req.params.tripId);
    res.status(204).end();
  }));

router.put("/:tripId/settings", validate({ params: S.tripParams, body: S.settingsPatch }),
  requireTripRole("viewer"), asyncHandler(async (req, res) => {
    repo.saveSettings(req.params.tripId, req.user.id, req.body);   // per-user, so viewers may set it
    res.json({ settings: repo.settings(req.params.tripId, req.user.id) });
  }));

// Curated suggestions for one day of the trip.
router.get("/:tripId/days/:date/suggestions",
  validate({ params: z.object({ tripId: z.string().min(1).max(64), date: S.date }) }),
  requireTripRole("viewer"), asyncHandler(async (req, res) => {
    const allAreas = req.query.allAreas === "1";
    res.json({ suggestions: service.suggestionsFor(req.params.tripId, req.params.date, req.user.id, { allAreas }) });
  }));

// ---- events on the trip: added and removed one at a time, never via PUT /plan ----
// A date has to be inside the trip AND inside the event's run: "is it on while
// I'm there?" is the entire reason events are their own thing.
function checkDate(trip, ev, date) {
  if (!date) return;
  if (date < trip.start_date || date > trip.end_date) throw badRequest("That date isn't in this trip");
  const end = ev.end_date || ev.start_date;
  if (date < ev.start_date || date > end)
    throw badRequest(`${ev.name} isn't on that day — it runs ${ev.start_date}${end !== ev.start_date ? " to " + end : ""}`);
}

router.post("/:tripId/events", validate({ params: S.tripParams, body: ES.tripEventCreate }),
  requireTripRole("editor"), asyncHandler(async (req, res) => {
    const trip = repo.byId(req.params.tripId);
    const ev = events.byId(req.body.eventId);
    if (!ev || (ev.visibility === "private" && ev.created_by !== req.user.id)) throw notFound("Event not found");
    checkDate(trip, ev, req.body.date);
    const te = tripEvents.upsert(req.params.tripId, req.body, req.user.id);
    audit.record(req, "trip.event.add", "trip", req.params.tripId, { eventId: ev.id, date: te.date });
    res.status(201).json({ tripEvent: te });
  }));

router.patch("/:tripId/events/:tripEventId", validate({ params: ES.tripEventParams, body: ES.tripEventPatch }),
  requireTripRole("editor"), asyncHandler(async (req, res) => {
    const cur = tripEvents.byId(req.params.tripId, req.params.tripEventId);
    if (!cur) throw notFound("That event isn't on this trip");
    if (req.body.date) checkDate(repo.byId(req.params.tripId), events.byId(cur.event_id), req.body.date);
    const te = tripEvents.update(req.params.tripId, cur.id, req.body);
    audit.record(req, "trip.event.update", "trip", req.params.tripId, { tripEventId: cur.id, ...req.body });
    res.json({ tripEvent: te });
  }));

router.delete("/:tripId/events/:tripEventId", validate({ params: ES.tripEventParams }),
  requireTripRole("editor"), asyncHandler(async (req, res) => {
    if (!tripEvents.remove(req.params.tripId, req.params.tripEventId)) throw notFound("That event isn't on this trip");
    audit.record(req, "trip.event.remove", "trip", req.params.tripId, { tripEventId: req.params.tripEventId });
    res.status(204).end();
  }));

// ---- who is actually on the trip (distinct from who may edit it) ----
router.get("/:tripId/participants", validate({ params: S.tripParams }), requireTripRole("viewer"),
  asyncHandler(async (req, res) =>
    res.json({ participants: service.document(req.params.tripId, req.user.id).participants })));

router.post("/:tripId/participants", validate({ params: S.tripParams, body: S.participantCreate }),
  requireTripRole("editor"), asyncHandler(async (req, res) => {
    const p = people.create(req.params.tripId, req.body);
    audit.record(req, "trip.participant.add", "trip", req.params.tripId, { name: p.name });
    res.status(201).json({ participants: service.document(req.params.tripId, req.user.id).participants });
  }));

router.patch("/:tripId/participants/:participantId",
  validate({ params: z.object({ tripId: z.string().max(64), participantId: z.string().max(64) }),
             body: S.participantPatch }),
  requireTripRole("editor"), asyncHandler(async (req, res) => {
    const cur = people.byId(req.params.participantId);
    if (!cur || cur.trip_id !== req.params.tripId) throw notFound("Not on this trip");
    people.update(req.params.participantId, req.body);
    audit.record(req, "trip.participant.update", "trip", req.params.tripId, req.body);
    res.json({ participants: service.document(req.params.tripId, req.user.id).participants });
  }));

router.delete("/:tripId/participants/:participantId",
  validate({ params: z.object({ tripId: z.string().max(64), participantId: z.string().max(64) }) }),
  requireTripRole("editor"), asyncHandler(async (req, res) => {
    const cur = people.byId(req.params.participantId);
    if (!cur || cur.trip_id !== req.params.tripId) throw notFound("Not on this trip");
    people.remove(req.params.participantId);
    audit.record(req, "trip.participant.remove", "trip", req.params.tripId);
    res.json({ participants: service.document(req.params.tripId, req.user.id).participants });
  }));

// ---- membership (access control) ----
router.get("/:tripId/members", validate({ params: S.tripParams }), requireTripRole("viewer"),
  asyncHandler(async (req, res) => res.json({ members: members.listFor(req.params.tripId) })));

router.post("/:tripId/members", validate({ params: S.tripParams, body: S.memberUpsert }),
  requireTripRole("owner"), asyncHandler(async (req, res) => {
    // Invite-only: we never create an account here, only link an existing one.
    const u = users.byEmail(req.body.email);
    if (!u) throw notFound("No account with that email — send them an invite first");
    members.add(req.params.tripId, u.id, req.body.role, req.user.id);
    audit.record(req, "trip.member.add", "trip", req.params.tripId, { user: u.id, role: req.body.role });
    res.status(201).json({ members: members.listFor(req.params.tripId) });
  }));

router.patch("/:tripId/members/:userId",
  validate({ params: z.object({ tripId: z.string().max(64), userId: z.string().max(64) }), body: S.memberRole }),
  requireTripRole("owner"), asyncHandler(async (req, res) => {
    const { tripId, userId } = req.params;
    const cur = members.find(tripId, userId);
    if (!cur) throw notFound("Not a member of this trip");
    if (cur.role === "owner" && req.body.role !== "owner" && members.ownerCount(tripId) <= 1)
      throw conflict("A trip needs at least one owner");
    members.setRole(tripId, userId, req.body.role);
    audit.record(req, "trip.member.role", "trip", tripId, { user: userId, role: req.body.role });
    res.json({ members: members.listFor(tripId) });
  }));

router.delete("/:tripId/members/:userId",
  validate({ params: z.object({ tripId: z.string().max(64), userId: z.string().max(64) }) }),
  requireTripRole("owner"), asyncHandler(async (req, res) => {
    const { tripId, userId } = req.params;
    const cur = members.find(tripId, userId);
    if (cur && cur.role === "owner" && members.ownerCount(tripId) <= 1)
      throw conflict("A trip needs at least one owner");
    members.remove(tripId, userId);
    audit.record(req, "trip.member.remove", "trip", tripId, { user: userId });
    res.json({ members: members.listFor(tripId) });
  }));

module.exports = router;
