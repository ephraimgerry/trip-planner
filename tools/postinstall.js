#!/usr/bin/env node
// The backend keeps its own package.json, so a root `npm install` doesn't reach
// it. Pull its dependencies in here so `npm install && npm start` just works.
// A failure warns rather than aborting the root install — `npm start` retries.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.env.SKIP_BACKEND_INSTALL) process.exit(0);

const backend = path.join(__dirname, "..", "backend");
if (!fs.existsSync(path.join(backend, "package.json"))) process.exit(0);
if (fs.existsSync(path.join(backend, "node_modules", "better-sqlite3", "package.json"))) process.exit(0);

console.log("[postinstall] installing backend dependencies…");
const r = spawnSync("npm", ["install", "--no-fund", "--no-audit"], { cwd: backend, stdio: "inherit" });
if (r.status !== 0)
  console.warn("[postinstall] backend install failed — `npm start` will retry, or run it yourself in backend/");
