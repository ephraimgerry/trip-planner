const router = require("express").Router();
const { z } = require("zod");
const { asyncHandler } = require("../../core/http");
const { validate } = require("../../core/validate");
const { requireAuth, requirePlatformRole } = require("../auth/auth.middleware");
const repo = require("./users.repository");
const invites = require("./invites.repository");
const audit = require("../../core/audit");
const { conflict } = require("../../core/errors");

router.use(requireAuth);

router.get("/me", asyncHandler(async (req, res) => res.json({
  user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role },
  prefs: repo.prefs(req.user.id),
})));

// Theme, last view, panel widths — the small stuff that used to sit in localStorage.
router.put("/me/prefs", validate({ body: z.record(z.string().max(64), z.any()) }),
  asyncHandler(async (req, res) => {
    const json = JSON.stringify(req.body);
    if (json.length > 8000) throw conflict("Preferences are too large");
    repo.savePrefs(req.user.id, req.body);
    res.json({ prefs: repo.prefs(req.user.id) });
  }));

// ---- invite-only onboarding (admin) ----
router.get("/", requirePlatformRole("admin"), asyncHandler(async (_req, res) =>
  res.json({ users: repo.list() })));

router.get("/invites", requirePlatformRole("admin"), asyncHandler(async (_req, res) =>
  res.json({ invites: invites.list() })));

router.post("/invites", requirePlatformRole("admin"),
  validate({ body: z.object({
    email: z.string().email().max(200),
    role: z.enum(["admin", "member"]).default("member"),
  }).strict() }),
  asyncHandler(async (req, res) => {
    if (repo.byEmail(req.body.email)) throw conflict("That email already has an account");
    const inv = invites.create({ ...req.body, invitedBy: req.user.id });
    repo.create({ email: req.body.email, role: req.body.role, status: "invited" });
    audit.record(req, "invite.create", "invite", inv.id, { email: req.body.email });
    // The raw token is returned exactly once and never stored in the clear.
    res.status(201).json({ invite: inv });
  }));

router.delete("/invites/:id", requirePlatformRole("admin"),
  validate({ params: z.object({ id: z.string().max(64) }) }),
  asyncHandler(async (req, res) => {
    invites.revoke(req.params.id);
    audit.record(req, "invite.revoke", "invite", req.params.id);
    res.status(204).end();
  }));

module.exports = router;
