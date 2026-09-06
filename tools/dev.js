#!/usr/bin/env node
// Start the API, wait until it answers, then launch the desktop shell.
// Kills the API when the app exits so nothing is left holding port 4177.
const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const PORT = process.env.PORT || 4177;

// If something is already on the port, /health will answer and we would happily
// drive a stale server running old code. Refuse instead — this cost an hour once.
async function portBusy() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch (e) { return false; }
}

let api = null;

let app = null;
let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  if (app && !app.killed) app.kill();
  if (api && !api.killed) api.kill("SIGTERM");
  // don't leave an orphan holding the port if it ignores the polite signal
  setTimeout(() => { if (api && !api.killed) api.kill("SIGKILL"); process.exit(code || 0); }, 1500).unref();
  setTimeout(() => process.exit(code || 0), 1600).unref();
};

async function waitForApi(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  if (await portBusy()) {
    console.error(`[dev] something is already serving port ${PORT}.`);
    console.error("[dev] that is probably an older backend — it would shadow your changes.");
    console.error(`[dev] find it with:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
    return process.exit(1);
  }
  api = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(root, "backend"), stdio: "inherit",
    env: Object.assign({}, process.env, { PORT }),
  });
  api.on("exit", (code) => { if (code) { console.error("[dev] API exited with", code); stop(code); } });

  if (!await waitForApi()) {
    console.error("[dev] the API never came up.");
    return stop(1);
  }
  console.log("[dev] API is up; starting the app");
  app = spawn("npx", ["electron", "."], { cwd: root, stdio: "inherit" });
  app.on("exit", (code) => stop(code));
})();

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
