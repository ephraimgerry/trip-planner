# Trip Planner — backend

A modular monolith. Express + SQLite, all data in the database, invite-only by
design, built to sit behind Cloudflare.

```bash
npm install
cp .env.example .env
npm run migrate          # schema
npm run seed             # geography, 38 districts + polygons, 237 places, images
npm start                # http://127.0.0.1:4177
```

`npm run reset` does all three from scratch.

## Data model

```
country ─┬─ area (city / province / region) ─┬─ district ─┐
         │                                   │            │
         └───────────────────────────────────┴────────────┴─ place ── kind → place_kinds
                                                              ├─ attrs (JSON, per kind)
                                                              ├─ place_images
                                                              └─ user_places (want / planned / visited)

user ─┬─ trip (created_by)
      └─ trip_members (owner | editor | viewer)      ← who may SEE/EDIT

trip ─┬─ trip_stays          → area + place (the hotel) + check_in/check_out
      ├─ trip_commutes       → kind → commute_kinds, attrs (JSON, per kind)
      ├─ trip_items          → place + optional slot + optional HH:MM
      ├─ trip_alternatives   → the saved shortlist suggestions come from
      ├─ trip_participants   → who is ON the trip    ← distinct from members
      │    └─ trip_participant_dates (one row per continuous stint)
      └─ trip_settings       → per-user, per-trip (base point)
```

### Why one table per concept, not one per type

Both "many types" problems — places and transport — get the same answer:
**a single table, a type discriminator that is a foreign key to a lookup
table, and a JSON `attrs` bag for the rest.** The split between column and
JSON is decided by one question:

> is this field ever filtered, sorted, joined, aggregated or constrained on?

| | |
|---|---|
| **column** | dates, kind, status, area/place refs, price, duration, ord — everything the day view, the map, and the "what haven't I booked" list need |
| **`attrs` JSON** | seat, terminal, fuel policy, plate, cabin, platform — per-type detail that is only ever displayed |

Separate tables per type would mean a join for every read and a migration for
every new transport type. One wide table with a column per type would be mostly
NULL. This keeps every real query as plain indexed SQL while the long tail stays
flexible — and `attrs` is **still validated**, per kind, by zod at the API
boundary (`attrsByKind` in `trips.schema.js`), so JSON storage does not mean
unstructured storage. SQLite's JSON1 also means a hot field can be promoted to
a generated, indexed column later without a rewrite.

`commute_kinds.spans_days` is the payoff: a car rental is not special-cased
anywhere in the code, it is simply a kind whose rows carry an `end_date`.
Adding "sleeper train" is an `INSERT`, not a schema change.

### Commutes

One row per concrete way of getting somewhere: `flight`, `train`, `bus`,
`ferry`, `metro`, `taxi`, `car_rental`, `car_own`, `rail_pass`, `walk`, `other`.

Alternatives for the same hop share a `group_id`, and a partial unique index
enforces that **exactly one is `chosen`** — which is how the old "leg with
options" idea survives without a second table. A standalone commute (a hire
car, an airport transfer) simply has no group.

`start_date`/`end_date` mean a car rental held Fri–Mon appears on all four
days, using the same range query as a hotel stay. `trip_commute_participants`
records who is actually on a given commute; empty means everyone on the trip
that day.

### People

`trip_participants` is deliberately **not** `trip_members`: membership is who
may see and edit the trip, participation is who is physically on it. You can
plan a trip you aren't going on, and a traveller need not have an account.

`trip_participant_dates` holds one row per continuous stint, so someone who
flies home early and rejoins later is two rows rather than a fudge. No rows at
all means "here for the whole trip", which keeps the common case free of data
entry.

### A day's cities

`staysOn(date)` orders by check-in and collapses only **consecutive** repeats,
so a Shanghai → Suzhou → Shanghai day keeps all three legs. De-duplicating by
city id would silently flatten it to two.

### Times

Check-in and check-out exist in two places on purpose:

| | |
|---|---|
| `places.attrs.checkInTime` | the hotel's usual policy — a property of the hotel |
| `trip_stays.check_in_time` | what you actually agreed — a property of the stay |

The UI falls back from the stay to the place, so a normal booking needs no data
entry and an early check-in is still recordable.

### Travel days

A day counts as travel when you **leave the area** — not merely when some
transport exists on it. Moving hotels across one city is not travel.

That needs commute endpoints resolved to real areas, which the old free-text
model never had (`"Hangzhou (Hubin)" -> "Club Med Longwu"` told you nothing).
`006` backfills them by matching labels to area names, longest name first, and
`commutes.repository.resolveArea()` does the same on every write so a hop typed
into the app agrees with an imported one. Local modes (taxi, metro, bus, walk,
car) with only one end resolved get the other filled in from it — an airport
transfer names the airport at one end and the city at the other, and both are
the same place.

`day.travel` and `day.areaIds` are then derived server-side from the stays plus
any area-crossing commutes, so a day trip out and back with no hotel change
still reads `Shanghai → Suzhou → Shanghai`.

### Reference geography

Countries and areas ship as **migrations**, not seed data, so every deployment
has the same ids however old it is. They are upserted by id: re-running never
duplicates, and a later migration can correct a coordinate without touching
anyone's places or trips. `005` adds Japan (23 areas) and Vietnam (18).

**A hotel is a place.** `kind='lodging'`, so it has a country, an area, a
district assigned by polygon, coordinates, a link and images — exactly like
anything else you pin. A stay points at it. Detaching a hotel from a trip
leaves the place in the catalogue.

**A day is derived, not stored.** A stay covers its check-in *and* check-out
date inclusively, so a travel day resolves to two stays and two cities. That is
why the UI can show the bed you're leaving and the bed you're taking without
duplicating a hotel row per night.

**Timing is optional on purpose.** Most items only need morning/noon/evening.
The few that matter — a booked tour, a train — carry `start_time`/`end_time`.

**Suggestions are curated.** They come from `trip_alternatives`, which only
ever contains places *you* saved, narrowed to the areas you're in that day,
minus anything already scheduled and anything you've marked `visited`. The
server never calls out to a places API.

## Modules

| Module | Mount | Owns |
|---|---|---|
| `auth` | `/api/auth` | the authentication choke-point, per-trip RBAC, sessions |
| `users` | `/api/users` | users, invites, preferences |
| `geo` | `/api/geo` | countries, areas, districts, polygons |
| `places` | `/api/places` | the catalogue (hotels included), images, your marks |
| `trips` | `/api/trips` | trips, members, stays, flights, legs, items, alternatives |
| `bootstrap` | `/api/bootstrap` | one request that hydrates the whole client |
| `import` | `/api/import` | one-way rescue of the old localStorage document |

Modules talk to each other only through the owning module's repository or
service — never by reading another module's tables directly. `src/core/registry.js`
is the whole module list; adding one is a single line.

## Authentication — deliberately not on

`AUTH_MODE=bypass` runs every request as one local user, created on first boot.
The structure around it is complete:

- `users`, `user_credentials`, `invites`, `sessions` tables exist
- `attachActor` → `requireAuth` → `requirePlatformRole` is the only path in
- `requireTripRole('editor')` guards every trip mutation, and `roleOn()` already
  resolves admin override, creation ownership and membership
- there is **no open registration route**; `/api/auth/status` reports
  `signupOpen: false` and `POST /api/users/invites` (admin only) is the only way
  an account comes into existence. Invite tokens are stored hashed and the
  plaintext is returned exactly once.

Turning it on means implementing three route bodies in `auth.routes.js` and
setting `AUTH_MODE=session`. No other file changes. **`config.js` exits rather
than start in bypass mode with `NODE_ENV=production`.**

## Security posture

Enforced in code:

- **Origin allowlist**, no wildcard, never reflected. `'*'` in `CORS_ORIGINS`
  is a boot failure in production.
- **CSRF shape blocked**: state changes require `content-type: application/json`,
  which a cross-origin HTML form cannot send.
- **Rate limits** keyed on `CF-Connecting-IP`: a global budget, a tighter one
  for mutations, a tighter one still for auth. `TRUST_PROXY` must match your
  proxy depth or every request keys to Cloudflare's address.
- **Every input validated** by a zod schema before it reaches a service, with
  bounded array lengths so one request can't balloon the database. URLs must be
  `http(s)` — `javascript:` is rejected.
- **Helmet headers**: `default-src 'none'` CSP (this process serves only JSON),
  `frame-ancestors none`, `no-referrer`, HSTS in production, no `x-powered-by`.
- **Body limit** 1 MB; slow-loris timeouts on headers, requests and keep-alive.
- **Errors never leak**: 5xx returns a generic message in production; the real
  cause goes to the log with a request id echoed in `x-request-id`.
- **Logs are scrubbed** of `authorization`, `cookie`, `password`, `token`,
  `secret`, `api-key`.
- **SQLite** in WAL with foreign keys on, prepared statements only, every
  multi-row write in a transaction.
- **Audit trail** (`audit_log`) for every mutation: actor, action, entity, IP.
- **Graceful shutdown** so a deploy never truncates a write in flight.
- `npm audit` is clean; `qs` is pinned past its DoS advisory via `overrides`.

### Cloudflare

Keep the origin unreachable except through Cloudflare — a Tunnel
(`cloudflared`) is the cleanest way and needs no inbound ports at all.

1. **Tunnel** the origin; don't expose `4177` publicly.
2. **WAF**: rate-limit `/api/*`, and put Cloudflare Access in front of
   everything while `AUTH_MODE=bypass` — that is your only access control today.
3. **Bot Fight Mode** on; **Under Attack** mode available for L7 floods.
4. Set `TRUST_PROXY=1` and `CORS_ORIGINS=https://your.domain`.
5. Cache `/api/geo/districts.geojson` (immutable, ~250 KB); never cache
   anything else — responses are per-user.

> While `AUTH_MODE=bypass`, **anyone who reaches the origin is you.** Do not
> expose it without Cloudflare Access in front.

## Migrating the old browser data

The desktop app pushes whatever is left in its `localStorage` to
`POST /api/import/legacy` on first boot, then archives the blob under a dated
key — it is never deleted. To do it by hand:

```bash
# in the app's DevTools console:
#   copy(localStorage.getItem("shanghai-planner-v1"))
node scripts/import-legacy.js dump.json
```

Import is keyed on the legacy trip id, so re-running updates rather than
duplicates. Hotels become `lodging` places; anything referencing a place that
no longer exists is reported in `skipped` rather than silently dropped.
