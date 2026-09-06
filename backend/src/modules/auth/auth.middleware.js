// =============================================================================
//  THE authentication choke-point. Every authenticated route goes through here.
//
//  Modes:
//    bypass  — development only. Every request runs as a single local user,
//              created on first boot. config.js refuses to start in this mode
//              when NODE_ENV=production, so it cannot be shipped by accident.
//    session — the real path. The plumbing is written but intentionally
//              inert: no sign-in route issues a session yet.
// =============================================================================
const config = require("../../core/config");
const { unauthorized, forbidden } = require("../../core/errors");
const users = require("../users/users.repository");
const sessions = require("./sessions.repository");
const { hashToken } = require("../../core/ids");

let devUserId = null;
function devUser() {
  if (!devUserId) devUserId = users.ensureLocalUser(config.auth.devUserEmail).id;
  return users.byId(devUserId);
}

function resolveActor(req) {
  if (config.auth.mode === "bypass") return devUser();
  const raw = req.cookies_token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!raw) return null;
  const s = sessions.findValid(hashToken(raw));
  if (!s) return null;
  sessions.touch(s.id);
  return users.byId(s.user_id);
}

function attachActor(req, _res, next) {
  try { req.user = resolveActor(req) || null; next(); } catch (e) { next(e); }
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.status === "disabled") return next(forbidden("This account is disabled"));
  next();
}

function requirePlatformRole(role) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (role === "admin" && req.user.role !== "admin") return next(forbidden("Admins only"));
    next();
  };
}

module.exports = { attachActor, requireAuth, requirePlatformRole };
