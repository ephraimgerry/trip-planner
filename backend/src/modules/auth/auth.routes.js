const router = require("express").Router();
const { z } = require("zod");
const { asyncHandler } = require("../../core/http");
const service = require("./auth.service");

const cred = z.object({ email: z.string().email(), name: z.string().optional() });
router.post("/register", asyncHandler(async (req, res) => res.status(201).json(service.register(cred.parse(req.body)))));
router.post("/login", asyncHandler(async (req, res) => res.json(service.login(cred.parse(req.body)))));
module.exports = router;
