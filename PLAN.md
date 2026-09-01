# Trip Planner — Frontend / Backend Split · Architecture & Plan

## 1. Goal
Turn the single Electron web app into **frontend + backend + database + API**, structured
production-ready and as a **modular monolith ("modulith")** so this becomes one of several
apps sharing a common core (especially **auth**). API security is **not enabled yet** but the
structure is prepared for it (single auth choke-point).

## 2. Top-level architecture
```
repo/
  frontend/            # the existing web app (Electron shell loads it)
    index.html, data.js (seed/fallback), cities.js, districts-geo.js, images.js
    vendor/, tiles/    # bundled Leaflet + offline map tiles
    api/client.js      # NEW: talks to the backend API
  backend/             # NEW: Node + Express modulith, SQLite database
    src/
      server.js
      core/            # shared kernel: config, db, migrate, errors, http, app
      modules/
        auth/          # users + auth middleware (security wired but OFF)
        places/        # POI catalog CRUD
        trips/         # trips + days(plan) + alternatives CRUD
    db/migrations/     # versioned SQL
    db/seed.js         # imports frontend/data.js into the DB
  main.js              # Electron main (loads frontend/index.html)
  tools/               # tile downloader, image scraper (Task 3)
```

## 3. Database choice — **RDBMS (SQLite now → Postgres in prod)**
Why relational: the domain is highly relational and integrity-sensitive
(user → trips → segments/legs/days → places; a shared places catalog).
- **Now:** SQLite via `better-sqlite3` (file DB = simple, zero-ops, fast, real SQL).
- **Prod:** same schema on **Postgres**; the repository layer isolates the driver so the
  swap is one adapter. **pgvector** can be added later for semantic "similar places" search
  (future `search` module) — that's the only place a vector store earns its keep here.
- Graph/NoSQL rejected: no free-form graph traversal or schemaless needs that outweigh
  relational integrity for a trip planner.

### Schema (v1)
- `users(id, email UNIQUE, name, created_at)`
- `places(id, name, name_cn, category, sub, city, district, lat, lng, link, description, source, image_urls JSON, created_at)`
- `trips(id, user_id, name, start_date, end_date, outbound JSON, inbound JSON, segments JSON, legs JSON, created_at, updated_at)`
- `trip_places(trip_id, date, place_id, ord)`      — the day-by-day plan
- `trip_alternatives(trip_id, place_id, ord)`       — the "alternatives / couldn't-fit" list

Trip-scoped structured blobs (segments/legs/flights) are JSON columns; the truly relational,
queried bits (catalog, plan membership, alternatives) are normalized tables.

## 4. API (REST, JSON) — `/api`
```
GET    /health
# auth (stubs now; JWT later)
POST   /api/auth/register            {email,name}
POST   /api/auth/login               {email}            -> {user, token}
# places catalog
GET    /api/places                    ?city&category&q&limit
GET    /api/places/:id
POST   /api/places                    (auth)  place body
PATCH  /api/places/:id                (auth)
DELETE /api/places/:id                (auth)
# trips
GET    /api/trips                      (auth) list mine
GET    /api/trips/:id                  (auth) full trip (plan + alternatives + segments + legs)
POST   /api/trips                      (auth)
PUT    /api/trips/:id                  (auth) replace full trip (matches frontend trip shape)
DELETE /api/trips/:id                  (auth)
# granular (nice for the UI)
PUT    /api/trips/:id/plan/:date       (auth) set place ids for a day
POST   /api/trips/:id/alternatives     (auth) {placeId}
DELETE /api/trips/:id/alternatives/:placeId (auth)
```
Validation via **zod** at the controller edge. Errors via a central handler (`{error, details}`).

## 5. Security — prepared, not enabled
- Single choke-point: `modules/auth/auth.middleware.js` → `requireAuth`.
  Today it injects a **dev user** and lets requests through. To turn security ON later:
  verify a JWT (`config.jwtSecret`) from the `Authorization: Bearer` header, set `req.user`,
  401 otherwise. No route changes needed — they already declare `requireAuth`.
- Auth is its own module so other apps can reuse it (shared identity for the modulith).
- Next-phase hardening (documented, not built): password hashing (argon2), refresh tokens,
  rate-limiting, helmet, structured logging (pino), request IDs, CORS allow-list, tests.

## 6. Work breakdown (phased)
- **P1 — Backend foundation (this turn):** modulith scaffold, SQLite + migrations, places &
  trips CRUD, auth stubs, error handling, validation, seed importer from `data.js`. Runnable.
- **P2 — FE/BE split (this turn):** move web app into `frontend/`, add `api/client.js`,
  point Electron at it. Frontend keeps working on localStorage; API wiring is opt-in via a
  `USE_API` flag + a small data-source layer (full migration is incremental & low-risk).
- **P3 — Alternatives as an extended sidebar (Task 2, next):** a toggle on each Day card
  (top-right, beside "focus") that slides out a *second* sidebar listing that day's
  alternatives, with add-to-day / remove, next to the main sidebar.
- **P4 — Image scraper (Task 3, next):** replace the "too random" Wikimedia images. Google
  Images has **no official API and scraping violates its ToS + is easily blocked**; the
  production path is **Google Programmable Search (Custom Search JSON API)** or **Bing Image
  Search** / **SerpAPI** with a key. Deliver `tools/scrape-images.js` that uses a pluggable
  provider (key via env), writes results to the `places.image_urls` column, with a headless
  fallback clearly flagged as best-effort.
- **P5 — Prod hardening:** enable auth, logging, rate-limit, Dockerfile, tests, CI.

## 7. Non-goals right now
Multi-user sharing, real payments/bookings, offline write-sync/conflict resolution.
```
