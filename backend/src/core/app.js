const express = require("express");
const config = require("./config");
const logger = require("./logger");
const { errorHandler, notFound } = require("./errors");
const { modules } = require("./registry");
const sec = require("./security");
const { attachActor } = require("../modules/auth/auth.middleware");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag");
  // Cloudflare terminates TLS and rewrites the source address; without this,
  // rate limiting would key every request to the same proxy IP.
  app.set("trust proxy", config.trustProxy);

  app.use(sec.requestContext);
  app.use(sec.securityHeaders);
  app.use(sec.corsGuard);
  app.use(sec.limits.global);

  app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
  app.get("/readyz", (_req, res) => {
    try { require("./db").prepare("SELECT 1").get(); res.json({ ok: true }); }
    catch (e) { res.status(503).json({ ok: false }); }
  });

  app.use(sec.requireJsonIntent);
  app.use(express.json({ limit: config.security.bodyLimit }));
  app.use(sec.writeLimiter);
  app.use(attachActor);

  for (const m of modules) {
    app.use(m.mount, m.router());
    logger.debug("module mounted", { module: m.name, mount: m.mount });
  }

  app.use((_req, _res, next) => next(notFound("No such endpoint")));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
