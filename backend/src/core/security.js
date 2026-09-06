const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const config = require("./config");
const logger = require("./logger");
const { forbidden } = require("./errors");

// ---- request identity -------------------------------------------------------
// A request id on every response makes an error report traceable to one log line.
function requestContext(req, res, next) {
  req.id = String(req.headers["x-request-id"] || crypto.randomUUID()).slice(0, 64);
  // Behind Cloudflare, req.ip is only trustworthy because of app.set('trust proxy').
  req.clientIp = req.headers["cf-connecting-ip"] || req.ip;
  res.setHeader("x-request-id", req.id);
  req.log = logger.child({ requestId: req.id });
  const started = Date.now();
  res.on("finish", () => {
    req.log.info("request", {
      method: req.method, path: req.originalUrl.split("?")[0],
      status: res.statusCode, ms: Date.now() - started,
      ip: req.clientIp, user: req.user && req.user.id,
    });
  });
  next();
}

// ---- headers ----------------------------------------------------------------
// This process serves JSON only. The CSP is therefore maximally restrictive:
// nothing should ever be loaded or executed from an API response.
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'none'"], "frame-ancestors": ["'none'"],
      "base-uri": ["'none'"], "form-action": ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
  frameguard: { action: "deny" },
  noSniff: true,
  xPoweredBy: false,
});

// ---- origin control ---------------------------------------------------------
function corsGuard(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();                       // same-origin or a non-browser client
  if (!config.cors.origins.includes(origin)) {
    // Reflecting an unknown origin is how CORS turns into a data leak.
    req.log && req.log.warn("origin rejected", { origin });
    return next(forbidden("Origin not allowed"));
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,x-request-id,x-csrf-token");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

// CSRF: an HTML form can only issue GET or POST, and it always sends a body.
// So requiring a JSON content-type on any request that CARRIES a body blocks
// the form-submission attack without a token round-trip. A body-less DELETE is
// exempt because no form can produce one, and a cross-origin fetch using that
// method needs a preflight that the origin allowlist above already refuses.
function requireJsonIntent(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const len = Number(req.headers["content-length"] || 0);
  const hasBody = len > 0 || req.headers["transfer-encoding"] !== undefined;
  if (!hasBody && req.method !== "POST") return next();
  const ct = String(req.headers["content-type"] || "");
  if (!ct.startsWith("application/json")) return next(forbidden("JSON content-type required"));
  next();
}

// ---- rate limiting ----------------------------------------------------------
const keyFor = (req) => req.headers["cf-connecting-ip"] || req.ip;
const limiter = (max, windowMs, name) => rateLimit({
  windowMs, max, keyGenerator: keyFor,
  standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => {
    req.log && req.log.warn("rate limited", { limiter: name, ip: keyFor(req) });
    res.status(429).json({ error: { code: "rate_limited", message: "Too many requests — slow down." } });
  },
});
const limits = {
  global: limiter(config.security.rateMax, config.security.rateWindowMs, "global"),
  write:  limiter(config.security.writeRateMax, config.security.rateWindowMs, "write"),
  auth:   limiter(config.security.authRateMax, config.security.rateWindowMs, "auth"),
};
// only spend the write budget on requests that actually mutate
const writeLimiter = (req, res, next) =>
  ["GET", "HEAD", "OPTIONS"].includes(req.method) ? next() : limits.write(req, res, next);

module.exports = { requestContext, securityHeaders, corsGuard, requireJsonIntent, limits, writeLimiter };
