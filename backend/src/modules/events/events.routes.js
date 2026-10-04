const router = require("express").Router();
const { asyncHandler } = require("../../core/http");
const { validate } = require("../../core/validate");
const { requireAuth } = require("../auth/auth.middleware");
const { badRequest, forbidden, notFound } = require("../../core/errors");
const audit = require("../../core/audit");
const S = require("./events.schema");
const repo = require("./events.repository");
const places = require("../places/places.repository");
const { assignDistrict } = require("../places/districts.service");

router.use(requireAuth);

router.get("/categories", asyncHandler(async (_req, res) =>
  res.json({ categories: repo.categories() })));

// Everything you can see, or only what's on in a date window (and areas).
router.get("/", validate({ query: S.eventQuery }), asyncHandler(async (req, res) => {
  const { from, to, areas } = req.validatedQuery;
  const list = (from || to)
    ? repo.overlapping(from || "0000-01-01", to || "9999-12-31", areas ? areas.split(",").filter(Boolean) : null)
        .filter(e => e.visibility === "public" || e.created_by === req.user.id)
    : repo.visibleTo(req.user.id);
  res.json({ events: list });
}));

router.get("/:eventId", validate({ params: S.eventParams }), asyncHandler(async (req, res) => {
  const e = repo.byId(req.params.eventId);
  if (!e || (e.visibility === "private" && e.created_by !== req.user.id)) throw notFound("Event not found");
  res.json({ event: e });
}));

// An event at a saved place takes that place's pin, address and area unless
// told otherwise; any event with a pin gets its district from the polygons,
// and its country always follows its area.
function locate(body, current = {}) {
  if (body.venuePlaceId) {
    const v = places.byId(body.venuePlaceId);
    if (!v) throw badRequest("That venue isn't a place we know");
    if (body.lat == null) { body.lat = v.lat; body.lng = v.lng; }
    if (body.address == null && v.address) body.address = v.address;
    if (body.venueName == null) body.venueName = v.name;
    if (body.areaId == null) body.areaId = v.area_id;
  }
  if (body.lat != null || body.areaId != null) {
    const a = assignDistrict({
      lat: body.lat ?? current.lat, lng: body.lng ?? current.lng,
      areaId: body.areaId ?? current.areaId, countryCode: body.countryCode ?? current.countryCode,
    });
    if (body.districtId == null) body.districtId = a.districtId;
    body.areaId = a.areaId; body.countryCode = a.countryCode;
  }
  return body;
}

router.post("/", validate({ body: S.eventCreate }), asyncHandler(async (req, res) => {
  if (!repo.categoryExists(req.body.category)) throw badRequest("Unknown event category");
  const e = repo.create(locate({ ...req.body }), req.user.id);
  audit.record(req, "event.create", "event", e.id, { name: e.name, category: e.category });
  res.status(201).json({ event: e });
}));

const mustEdit = (req, e) => {
  if (!e) throw notFound("Event not found");
  if (e.visibility === "private" && e.created_by !== req.user.id) throw notFound("Event not found");
  if (e.created_by !== req.user.id && req.user.role !== "admin")
    throw forbidden("Only the person who added this event can change it");
};

router.patch("/:eventId", validate({ params: S.eventParams, body: S.eventPatch }),
  asyncHandler(async (req, res) => {
    const cur = repo.byId(req.params.eventId);
    mustEdit(req, cur);
    if (req.body.category && !repo.categoryExists(req.body.category)) throw badRequest("Unknown event category");
    // the refine only sees the patch; check the range against what's stored too
    const start = req.body.startDate || cur.start_date;
    const end = req.body.endDate === undefined ? cur.end_date : req.body.endDate;
    if (end && end < start) throw badRequest("endDate can't be before startDate");
    const patch = locate({ ...req.body },
      { lat: cur.lat, lng: cur.lng, areaId: cur.area_id, countryCode: cur.country_code });
    const e = repo.update(req.params.eventId, patch);
    audit.record(req, "event.update", "event", e.id, req.body);
    res.json({ event: e });
  }));

router.delete("/:eventId", validate({ params: S.eventParams }), asyncHandler(async (req, res) => {
  mustEdit(req, repo.byId(req.params.eventId));
  repo.remove(req.params.eventId);
  audit.record(req, "event.delete", "event", req.params.eventId);
  res.status(204).end();
}));

module.exports = router;
