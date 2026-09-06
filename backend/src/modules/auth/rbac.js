// Per-trip authorisation. Roles are ordered, so a check is a comparison.
const { forbidden, notFound } = require("../../core/errors");
const members = require("../trips/members.repository");
const trips = require("../trips/trips.repository");

const RANK = { viewer: 1, editor: 2, owner: 3 };

// The effective role a user has on a trip: their membership, or ownership by
// creation, or admin override. Returns null when they have no business here.
function roleOn(user, tripId) {
  if (!user) return null;
  const trip = trips.byId(tripId);
  if (!trip) return null;
  if (user.role === "admin") return "owner";
  if (trip.created_by === user.id) return "owner";
  const m = members.find(tripId, user.id);
  return m ? m.role : null;
}

const can = (user, tripId, need) => RANK[roleOn(user, tripId) || ""] >= RANK[need];

// Route guard. Loads the trip once and hands it to the handler, so downstream
// code never re-fetches or re-checks.
function requireTripRole(need) {
  return (req, _res, next) => {
    const tripId = req.params.tripId || req.params.id;
    const trip = trips.byId(tripId);
    if (!trip) return next(notFound("Trip not found"));
    const role = roleOn(req.user, tripId);
    if (!role) return next(notFound("Trip not found"));           // don't confirm it exists
    if (RANK[role] < RANK[need]) return next(forbidden(`This needs ${need} access; you have ${role}`));
    req.trip = trip; req.tripRole = role;
    next();
  };
}

module.exports = { roleOn, can, requireTripRole, RANK };
