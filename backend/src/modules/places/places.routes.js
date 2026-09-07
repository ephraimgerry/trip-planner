const router = require("express").Router();
const { asyncHandler } = require("../../core/http");
const { validate } = require("../../core/validate");
const { requireAuth } = require("../auth/auth.middleware");
const { forbidden, notFound } = require("../../core/errors");
const audit = require("../../core/audit");
const S = require("./places.schema");
const repo = require("./places.repository");
const geo = require("../geo/geo.repository");
const { assignDistrict } = require("./districts.service");

router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const images = repo.allImages();
  res.json({ places: repo.visibleTo(req.user.id).map(p => ({ ...p, images: images[p.id] || [] })) });
}));

router.post("/", validate({ body: S.placeCreate }), asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // Trust the polygons over whatever the client guessed.
  Object.assign(body, assignDistrict(body));
  // A hotel with no stated policy gets the usual one, so the plan doesn't
  // render "check in —" for every new booking.
  if (body.kind === "lodging" && !(body.attrs && body.attrs.checkInTime))
    body.attrs = Object.assign({ checkInTime: "15:00", checkOutTime: "11:00" }, body.attrs || {});
  const p = repo.create(body, req.user.id);
  audit.record(req, "place.create", "place", p.id, { name: p.name, kind: p.kind });
  res.status(201).json({ place: { ...p, images: repo.imagesFor(p.id) } });
}));

const mustEdit = (req, p) => {
  if (!p) throw notFound("Place not found");
  // Curated catalogue entries are not editable by members; your own pins are.
  if (p.visibility === "private" && p.created_by !== req.user.id) throw notFound("Place not found");
  if (p.created_by !== req.user.id && req.user.role !== "admin")
    throw forbidden("Only the person who added this place can change it");
};

router.patch("/:placeId", validate({ params: S.placeParams, body: S.placePatch }),
  asyncHandler(async (req, res) => {
    const p = repo.byId(req.params.placeId);
    mustEdit(req, p);
    const patch = { ...req.body };
    if (patch.lat != null || patch.lng != null)
      Object.assign(patch, assignDistrict({ ...p, ...patch }));
    const out = repo.update(req.params.placeId, patch);
    audit.record(req, "place.update", "place", out.id, req.body);
    res.json({ place: { ...out, images: repo.imagesFor(out.id) } });
  }));

router.delete("/:placeId", validate({ params: S.placeParams }), asyncHandler(async (req, res) => {
  const p = repo.byId(req.params.placeId);
  mustEdit(req, p);
  repo.remove(req.params.placeId);
  audit.record(req, "place.delete", "place", req.params.placeId);
  res.status(204).end();
}));

// ---- what I think of a place (want / planned / visited) ----
router.put("/:placeId/me", validate({ params: S.placeParams, body: S.userPlacePatch }),
  asyncHandler(async (req, res) => {
    if (!repo.byId(req.params.placeId)) throw notFound("Place not found");
    if (req.body.status === null && req.body.note == null && req.body.rating == null) {
      repo.clearUserPlace(req.user.id, req.params.placeId);
      return res.json({ userPlace: null });
    }
    res.json({ userPlace: repo.setUserPlace(req.user.id, req.params.placeId, req.body) });
  }));

module.exports = router;
