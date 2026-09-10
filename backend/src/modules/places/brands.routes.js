const router = require("express").Router();
const { z } = require("zod");
const { asyncHandler } = require("../../core/http");
const { validate } = require("../../core/validate");
const { requireAuth } = require("../auth/auth.middleware");
const { notFound, badRequest } = require("../../core/errors");
const audit = require("../../core/audit");
const repo = require("./brands.repository");
const { safeUrl } = require("./places.schema");

const txt = (max) => z.string().trim().max(max);
const brandCreate = z.object({
  name: txt(160).min(1),
  nameLocal: txt(160).nullish(),
  link: safeUrl.nullish(),
  description: txt(2000).nullish(),
}).strict();
const brandPatch = brandCreate.partial().strict();
const brandParams = z.object({ brandId: z.string().min(1).max(64) });

router.use(requireAuth);

router.get("/", asyncHandler(async (_req, res) => {
  res.json({ brands: repo.all(), counts: repo.counts() });
}));

router.post("/", validate({ body: brandCreate }), asyncHandler(async (req, res) => {
  // The name is the identity, so say so plainly rather than leaking a
  // UNIQUE constraint error.
  if (repo.byName(req.body.name)) throw badRequest("A brand with that name already exists");
  const b = repo.create(req.body, req.user.id);
  audit.record(req, "brand.create", "brand", b.id, { name: b.name });
  res.status(201).json({ brand: b });
}));

router.patch("/:brandId", validate({ params: brandParams, body: brandPatch }),
  asyncHandler(async (req, res) => {
    if (!repo.byId(req.params.brandId)) throw notFound("Brand not found");
    const b = repo.update(req.params.brandId, req.body);
    audit.record(req, "brand.update", "brand", b.id, req.body);
    res.json({ brand: b });
  }));

router.delete("/:brandId", validate({ params: brandParams }), asyncHandler(async (req, res) => {
  if (!repo.byId(req.params.brandId)) throw notFound("Brand not found");
  repo.remove(req.params.brandId);
  audit.record(req, "brand.delete", "brand", req.params.brandId);
  res.status(204).end();
}));

module.exports = router;
