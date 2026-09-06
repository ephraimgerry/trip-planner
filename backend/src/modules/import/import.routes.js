// One-shot migration endpoint. The browser posts whatever is left in its old
// localStorage document, the server normalises it, and the client clears it.
const router = require("express").Router();
const { z } = require("zod");
const { asyncHandler } = require("../../core/http");
const { requireAuth } = require("../auth/auth.middleware");
const { validate } = require("../../core/validate");
const legacy = require("./legacy.service");
const audit = require("../../core/audit");

router.use(requireAuth);

// Loosely typed on purpose: this is a best-effort rescue of old data, and the
// service validates every field it actually uses. Size is what's bounded here.
router.post("/legacy", validate({ body: z.object({
  status: z.record(z.string().max(64), z.string().max(16)).optional(),
  notes: z.record(z.string().max(64), z.string().max(4000)).optional(),
  custom: z.array(z.any()).max(2000).optional(),
  countries: z.array(z.any()).max(300).optional(),
  areas: z.array(z.any()).max(2000).optional(),
  trips: z.array(z.any()).max(200).optional(),
  base: z.string().max(64).nullish(),
}).passthrough() }), asyncHandler(async (req, res) => {
  const report = legacy.run(req.body, req.user.id);
  audit.record(req, "import.legacy", "user", req.user.id, report);
  res.json({ imported: report });
}));

module.exports = router;
