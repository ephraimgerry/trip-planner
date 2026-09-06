const config = require("./core/config");
const logger = require("./core/logger");

require("./core/migrate");                 // schema is up to date before we serve
const { createApp } = require("./core/app");

const server = createApp().listen(config.port, () => {
  logger.info("server listening", { port: config.port, env: config.env, authMode: config.auth.mode });
  if (config.auth.mode === "bypass")
    logger.warn("AUTH BYPASS ACTIVE — every request runs as the local dev user", { user: config.auth.devUserEmail });
});

// Slow-loris and header-flood hardening. Cloudflare handles most of this, but
// the origin should not fall over if someone reaches it directly.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 10_000;
server.maxHeadersCount = 60;

// Finish in-flight requests before exiting so a deploy never truncates a write.
function shutdown(signal) {
  logger.info("shutting down", { signal });
  server.close(() => { logger.info("closed cleanly"); process.exit(0); });
  setTimeout(() => { logger.warn("forced exit"); process.exit(1); }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => logger.error("unhandled rejection", { err: String(e && e.message || e) }));
process.on("uncaughtException", (e) => { logger.error("uncaught exception", { err: e.message, stack: e.stack }); shutdown("uncaughtException"); });
