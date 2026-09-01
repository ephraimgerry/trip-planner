const router = require("express").Router();
const { z } = require("zod");
const { asyncHandler } = require("../../core/http");
const { requireAuth } = require("../auth/auth.middleware");
const { tripInput } = require("./trips.schema");
const service = require("./trips.service");

router.use(requireAuth); // all trip routes require a user (dev shim for now)

router.get("/", asyncHandler(async (req, res) => res.json(service.list(req.user.id))));
router.get("/:id", asyncHandler(async (req, res) => res.json(service.get(req.params.id))));
router.post("/", asyncHandler(async (req, res) => res.status(201).json(service.create(req.user.id, tripInput.parse(req.body)))));
router.put("/:id", asyncHandler(async (req, res) => res.json(service.replace(req.user.id, req.params.id, tripInput.parse(req.body)))));
router.delete("/:id", asyncHandler(async (req, res) => res.json(service.remove(req.params.id))));

router.put("/:id/plan/:date", asyncHandler(async (req, res) =>
  res.json(service.setDay(req.params.id, req.params.date, z.array(z.string()).parse(req.body.placeIds)))));
router.post("/:id/alternatives", asyncHandler(async (req, res) =>
  res.status(201).json(service.addAlt(req.params.id, z.string().parse(req.body.placeId)))));
router.delete("/:id/alternatives/:placeId", asyncHandler(async (req, res) =>
  res.json(service.removeAlt(req.params.id, req.params.placeId))));
module.exports = router;
