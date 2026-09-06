require("dotenv").config();
const path = require("path");

const env = process.env.NODE_ENV || "development";
const isProd = env === "production";
const bool = (v, d) => (v == null || v === "" ? d : /^(1|true|yes|on)$/i.test(String(v)));
const list = (v) => String(v || "").split(",").map(s => s.trim()).filter(Boolean);

const config = {
  env, isProd,
  port: Number(process.env.PORT || 4177),
  dbFile: process.env.DB_FILE
    ? path.resolve(process.cwd(), process.env.DB_FILE)
    : path.join(__dirname, "..", "..", "data", "tripplanner.db"),

  // Behind Cloudflare the socket address is Cloudflare's. Trust exactly the
  // number of proxies in front of us so rate limiting keys on the real client.
  trustProxy: Number(process.env.TRUST_PROXY || (isProd ? 1 : 0)),

  cors: {
    // No wildcard, ever. In development the Electron shell loads the UI from
    // file://, which Chrome sends as a "file://" or "null" origin.
    origins: list(process.env.CORS_ORIGINS).length
      ? list(process.env.CORS_ORIGINS)
      : (isProd ? [] : ["file://", "null", "http://localhost:4177", "http://127.0.0.1:4177"]),
    credentials: true,
  },

  security: {
    bodyLimit: process.env.BODY_LIMIT || "1mb",
    // Global budget, then a much tighter one on anything that mutates.
    rateWindowMs: Number(process.env.RATE_WINDOW_MS || 60_000),
    rateMax: Number(process.env.RATE_MAX || 300),
    writeRateMax: Number(process.env.WRITE_RATE_MAX || 60),
    authRateMax: Number(process.env.AUTH_RATE_MAX || 10),
  },

  auth: {
    // "bypass" = every request runs as devUser. The ONLY mode that skips auth,
    // and it refuses to start in production.
    mode: process.env.AUTH_MODE || (isProd ? "session" : "bypass"),
    devUserEmail: process.env.DEV_USER_EMAIL || "you@local",
    sessionSecret: process.env.SESSION_SECRET || "",
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
    inviteTtlDays: Number(process.env.INVITE_TTL_DAYS || 14),
  },

  log: { level: process.env.LOG_LEVEL || (isProd ? "info" : "debug") },
};

// Fail fast rather than boot something unsafe.
const problems = [];
if (config.isProd) {
  if (config.auth.mode === "bypass") problems.push("AUTH_MODE=bypass is not allowed in production");
  if (!config.auth.sessionSecret || config.auth.sessionSecret.length < 32)
    problems.push("SESSION_SECRET must be at least 32 characters in production");
  if (config.cors.origins.includes("*")) problems.push("CORS_ORIGINS may not contain '*' in production");
}
if (problems.length) {
  console.error("[config] refusing to start:\n  - " + problems.join("\n  - "));
  process.exit(1);
}

module.exports = config;
