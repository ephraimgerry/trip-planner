data.js, cities.js, districts-geo.js and images.js are no longer loaded by the
app — the app reads everything from the API. They remain as the **seed source**
for `backend/scripts/seed.js`, which parses them and writes the catalogue into
the database. Edit them to change what a fresh `npm run seed` produces.
