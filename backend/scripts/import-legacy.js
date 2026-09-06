#!/usr/bin/env node
// Import a localStorage dump from the command line.
//   node scripts/import-legacy.js dump.json
// In the app: DevTools console -> copy(localStorage.getItem("shanghai-planner-v1"))
require("../src/core/migrate");
const fs = require("fs");
const config = require("../src/core/config");
const users = require("../src/modules/users/users.repository");
const legacy = require("../src/modules/import/legacy.service");

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/import-legacy.js <dump.json>"); process.exit(1); }
const store = JSON.parse(fs.readFileSync(file, "utf8"));
const me = users.ensureLocalUser(config.auth.devUserEmail);
const report = legacy.run(store, me.id);
console.log(JSON.stringify(report, null, 2));
