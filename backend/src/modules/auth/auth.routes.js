// Authentication is deliberately not enabled yet. These routes exist so the
// shape of the API is fixed: turning auth on means implementing the bodies and
// flipping AUTH_MODE, not redesigning the surface.
const router = require("express").Router();
const { asyncHandler } = require("../../core/http");
const config = require("../../core/config");
const { AppError } = require("../../core/errors");

const notYet = () => { throw new AppError(501, "not_implemented", "Authentication is not enabled on this deployment"); };

router.get("/status", asyncHandler(async (req, res) => res.json({
  mode: config.auth.mode,
  authenticated: !!req.user,
  // Sign-up is invite only, by design. There is no open registration route.
  signupOpen: false,
})));

router.post("/login", asyncHandler(notYet));
router.post("/logout", asyncHandler(notYet));
router.post("/accept-invite", asyncHandler(notYet));

module.exports = router;
