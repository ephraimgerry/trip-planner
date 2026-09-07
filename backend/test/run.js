#!/usr/bin/env node
// =============================================================================
//  Integration suite.
//
//  Runs against a THROWAWAY database, never the one you're using: a fresh file,
//  migrated, seeded from the real catalogue, then loaded with a fixture trip.
//  On a spare port, so a running app is undisturbed.
//
//    npm test
// =============================================================================
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const backend = path.join(__dirname, "..");
const PORT = process.env.TEST_PORT || 4199;
const dbFile = path.join(os.tmpdir(), `tripplanner-test-${process.pid}.db`);
const env = Object.assign({}, process.env, {
  DB_FILE: dbFile, PORT, NODE_ENV: "development", AUTH_MODE: "bypass",
  LOG_LEVEL: "warn", CORS_ORIGINS: "",
});

const step = (name, args, quiet) => {
  const r = spawnSync(process.execPath, args, { cwd: backend, env, stdio: quiet ? "pipe" : "inherit" });
  if (r.status !== 0) {
    if (quiet) process.stderr.write(String(r.stdout || "") + String(r.stderr || ""));
    console.error(`\n[test] ${name} failed`);
    process.exit(1);
  }
};

function cleanup() {
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"])
    try { fs.unlinkSync(f); } catch (e) {}
}

(async () => {
  cleanup();
  console.log(`[test] building a throwaway database at ${dbFile}`);
  step("migrate", ["src/core/migrate.js"], true);
  step("seed", ["scripts/seed.js"], true);
  step("fixture import", ["scripts/import-legacy.js", path.join(__dirname, "fixtures", "legacy-trip.json")], true);

  const api = spawn(process.execPath, ["src/server.js"], { cwd: backend, env, stdio: "pipe" });
  let out = "";
  api.stdout.on("data", d => { out += d; });
  api.stderr.on("data", d => { out += d; });

  const up = await (async () => {
    for (let i = 0; i < 60; i++) {
      if (api.exitCode !== null) return false;
      try { if ((await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(700) })).ok) return true; }
      catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })();
  if (!up) { console.error("[test] the API never came up:\n" + out); api.kill(); cleanup(); process.exit(1); }

  const suites = fs.readdirSync(__dirname).filter(f => /^\d.*\.mjs$/.test(f)).sort();
  let failed = 0;
  for (const s of suites) {
    console.log(`\n── ${s} ${"─".repeat(Math.max(0, 46 - s.length))}`);
    const r = spawnSync(process.execPath, [path.join(__dirname, s)], {
      env: Object.assign({}, env, { API_BASE: `http://127.0.0.1:${PORT}` }), stdio: "inherit",
    });
    if (r.status !== 0) failed++;
  }

  api.kill();
  cleanup();
  console.log(failed ? `\n${failed} suite(s) failed` : "\nall suites passed");
  process.exit(failed ? 1 : 0);
})();
