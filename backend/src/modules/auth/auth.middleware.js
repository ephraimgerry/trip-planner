// SECURITY CHOKE-POINT (not enforced yet).
// Today: injects a dev user and lets the request through.
// To enable later: verify a JWT (config.jwtSecret) from the Authorization
// header, set req.user, else respond 401. No route changes needed.
function requireAuth(req, res, next) {
  // TODO(security): const token = (req.headers.authorization||"").replace(/^Bearer /,"");
  //                 req.user = verifyJwt(token) || return res.status(401)...
  req.user = req.user || { id: "dev-user", email: "dev@local", role: "owner" };
  next();
}
function optionalAuth(req, res, next) { req.user = req.user || { id: "dev-user" }; next(); }
module.exports = { requireAuth, optionalAuth };
