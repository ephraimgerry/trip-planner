#!/usr/bin/env node
// =============================================================================
//  One command to run the whole app.
//
//  Works from a bare clone: installs the backend's own dependencies if they're
//  missing, brings the database up to date, seeds it if empty, starts the API,
//  waits until it actually answers, then launches the desktop shell — and takes
//  the API down again when the app exits.
// =============================================================================
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const backend = path.join(root, "backend");
const PORT = process.env.PORT || 4177;

const say = (msg) => console.log(`[dev] ${msg}`);
const die = (msg) => { console.error(`[dev] ${msg}`); process.exit(1); };

// better-sqlite3 ships prebuilt binaries per Node ABI. On too old a Node it
// segfaults rather than failing cleanly, which is a miserable thing to debug —
// so check first and say so. .nvmrc pins the version this is developed against.
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  die(`Node ${process.versions.node} is too old — this needs Node 22 or newer.\n`
    + "       With nvm:  nvm install && nvm use   (reads .nvmrc)");
}

// ---- 1. the backend has its own package.json; a root install doesn't cover it
function ensureBackendDeps() {
  const probe = path.join(backend, "node_modules", "better-sqlite3", "package.json");
  if (fs.existsSync(probe)) return;
  say("installing backend dependencies (first run only)…");
  const r = spawnSync("npm", ["install", "--no-fund", "--no-audit"], { cwd: backend, stdio: "inherit" });
  if (r.status !== 0) die("backend dependency install failed — run `npm install` inside backend/ to see why.");
}

// better-sqlite3 is a native module: a Node upgrade or a different machine
// needs it rebuilt, and the error it throws otherwise is inscrutable.
function ensureNativeModule() {
  const r = spawnSync(process.execPath, ["-e", "require('better-sqlite3')"], { cwd: backend, encoding: "utf8" });
  if (r.status === 0) return;
  if (/NODE_MODULE_VERSION|was compiled against a different Node|invalid ELF|mach-o/i.test(r.stderr || "")) {
    say("better-sqlite3 was built for a different Node — rebuilding…");
    const b = spawnSync("npm", ["rebuild", "better-sqlite3"], { cwd: backend, stdio: "inherit" });
    if (b.status !== 0) die("rebuild failed — try `cd backend && npm rebuild better-sqlite3`.");
    return;
  }
  die("the backend can't load better-sqlite3:\n" + (r.stderr || "").trim());
}

// ---- 2. schema + first-run seed
function ensureDatabase() {
  const r = spawnSync(process.execPath, ["scripts/setup.js"], { cwd: backend, stdio: "inherit" });
  if (r.status !== 0) die("database setup failed.");
}

// ---- 3. refuse to drive someone else's server
async function portBusy() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch (e) { return false; }
}

let api = null, app = null, stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  if (app && !app.killed) app.kill();
  if (api && !api.killed) api.kill("SIGTERM");
  setTimeout(() => { if (api && !api.killed) api.kill("SIGKILL"); process.exit(code || 0); }, 1200).unref();
}

async function waitForApi(tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (api && api.exitCode !== null) return false;      // it died; stop waiting
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(700) });
      if (res.ok) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

// Resolve Electron's binary from node_modules rather than shelling out to npx,
// so there's no network round-trip and no ambiguity about which copy runs.
function electronBinary() {
  try { return require(path.join(root, "node_modules", "electron")); }
  catch (e) { return null; }
}

(async () => {
  ensureBackendDeps();
  ensureNativeModule();
  ensureDatabase();

  if (await portBusy()) {
    console.error(`[dev] something is already serving port ${PORT}.`);
    console.error("[dev] that is probably an older backend — it would shadow your changes.");
    console.error(`[dev] find it with:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
    process.exit(1);
  }

  api = spawn(process.execPath, ["src/server.js"], {
    cwd: backend, stdio: "inherit",
    env: Object.assign({}, process.env, { PORT }),
  });
  api.on("exit", (code) => {
    if (!stopping && code) { console.error(`[dev] the API exited with ${code}`); stop(code); }
  });

  if (!await waitForApi()) die("the API never became healthy — see the log above.");
  say("API is up; starting the app");

  const bin = electronBinary();
  if (!bin) die("Electron isn't installed — run `npm install` in the project root.");
  app = spawn(bin, ["."], {
    cwd: root, stdio: "inherit",
    env: Object.assign({}, process.env, { PORT }),   // so the renderer knows where the API is
  });
  app.on("exit", (code) => stop(code));
})();

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
