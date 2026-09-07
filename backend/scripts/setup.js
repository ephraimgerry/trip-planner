#!/usr/bin/env node
// =============================================================================
//  Get the database into a usable state. Idempotent, so it is safe to run on
//  every start: migrations that have already run are skipped, and the catalogue
//  is only seeded when it is actually empty.
// =============================================================================
require("../src/core/migrate");
const db = require("../src/core/db");

const count = (t) => {
  try { return db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; }
  catch (e) { return 0; }
};

if (count("places") === 0) {
  console.log("[setup] empty catalogue — seeding");
  require("./seed.js");            // runs on require
} else {
  console.log(`[setup] ready — ${count("places")} places, ${count("areas")} areas, ${count("trips")} trips`);
}
