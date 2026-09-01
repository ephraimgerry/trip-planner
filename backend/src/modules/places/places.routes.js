const router = require("express").Router();
const { asyncHandler } = require("../../core/http");
const { requireAuth } = require("../auth/auth.middleware");
const { placeInput } = require("./places.schema");
const service = require("./places.service");

router.get("/", asyncHandler(async (req, res) => res.json(service.list(req.query))));
router.get("/:id", asyncHandler(async (req, res) => res.json(service.get(req.params.id))));
router.post("/", requireAuth, asyncHandler(async (req, res) => res.status(201).json(service.create(placeInput.parse(req.body)))));
router.patch("/:id", requireAuth, asyncHandler(async (req, res) => res.json(service.update(req.params.id, placeInput.partial().parse(req.body)))));
router.delete("/:id", requireAuth, asyncHandler(async (req, res) => res.json(service.remove(req.params.id))));
module.exports = router;
