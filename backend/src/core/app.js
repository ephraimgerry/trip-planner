const express = require("express");
const cors = require("cors");
const config = require("./config");
const { errorHandler } = require("./errors");

function createApp() {
  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "4mb" }));

  app.get("/health", (req, res) => res.json({ ok: true, env: config.env, ts: new Date().toISOString() }));

  // modules (modulith): each mounts its own router
  app.use("/api/auth", require("../modules/auth/auth.routes"));
  app.use("/api/places", require("../modules/places/places.routes"));
  app.use("/api/trips", require("../modules/trips/trips.routes"));

  app.use((req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
