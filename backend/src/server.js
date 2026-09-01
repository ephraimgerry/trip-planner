require("./core/migrate"); // ensure schema before serving
const { createApp } = require("./core/app");
const config = require("./core/config");

const app = createApp();
app.listen(config.port, () => {
  console.log(`[server] Trip Planner API on http://localhost:${config.port} (${config.env})`);
});
