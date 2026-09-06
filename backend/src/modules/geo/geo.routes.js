const router = require("express").Router();
const { asyncHandler } = require("../../core/http");
const { validate } = require("../../core/validate");
const { requireAuth } = require("../auth/auth.middleware");
const repo = require("./geo.repository");
const districts = require("../places/districts.service");
const audit = require("../../core/audit");
const { z } = require("zod");

router.use(requireAuth);

router.get("/", asyncHandler(async (_req, res) => res.json({
  countries: repo.countries(), areas: repo.areas(), districts: repo.districts(),
})));

// Polygons are ~250KB and change roughly never — served separately and cached.
router.get("/districts.geojson", asyncHandler(async (_req, res) => {
  const features = repo.districtGeo().map(d => ({
    type: "Feature",
    properties: { id: d.id, areaId: d.area_id, name: d.name, nameLocal: d.name_local,
                  adcode: d.adcode, color: d.color },
    geometry: JSON.parse(d.geojson),
  }));
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.json({ type: "FeatureCollection", features });
}));

const countryBody = z.object({
  code: z.string().trim().length(2), name: z.string().trim().min(1).max(80),
  nameLocal: z.string().trim().max(80).nullish(),
}).strict();

const areaBody = z.object({
  id: z.string().trim().max(64).optional(),
  countryCode: z.string().trim().length(2),
  name: z.string().trim().min(1).max(80),
  nameLocal: z.string().trim().max(80).nullish(),
  kind: z.enum(["city", "province", "region"]).default("city"),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  zoom: z.number().int().min(1).max(20).default(11),
}).strict();

router.post("/countries", validate({ body: countryBody }), asyncHandler(async (req, res) => {
  const c = repo.upsertCountry(req.body);
  audit.record(req, "country.upsert", "country", c.code, req.body);
  res.status(201).json({ country: c });
}));

router.post("/areas", validate({ body: areaBody }), asyncHandler(async (req, res) => {
  const a = repo.createArea({ ...req.body, createdBy: req.user.id });
  districts.invalidate();
  require("../trips/commutes.repository").invalidateAreas();   // a new area can now match a label
  audit.record(req, "area.create", "area", a.id, req.body);
  res.status(201).json({ area: a });
}));

module.exports = router;
