-- =============================================================================
--  Trip Planner — core schema
--
--  Shape of the world:
--    country -> area (city / province / region) -> district -> place
--    A hotel is a PLACE (kind='lodging'), so it carries the same geography,
--    links and images as anything else you'd pin on the map.
--    A trip is owned by a user, shared with members, and made of
--    stays (where you sleep), legs (how you move) and items (what you do).
-- =============================================================================

-- ----------------------------------------------------------------- identity
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT,
  avatar_url  TEXT,
  -- invited: row exists, has never signed in. active: can use the app.
  status      TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
  -- platform-level role, distinct from per-trip roles below
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  last_seen_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Credentials live apart from the profile so the profile can be read freely.
-- Nothing writes here yet — authentication is deliberately not wired up.
CREATE TABLE user_credentials (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT,
  totp_secret   TEXT,
  updated_at    TEXT NOT NULL
);

-- Sign-up is invite only: no invite row, no account.
CREATE TABLE invites (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL COLLATE NOCASE,
  token_hash  TEXT NOT NULL UNIQUE,      -- only ever store the hash
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  invited_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_invites_email ON invites(email);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip         TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ---------------------------------------------------------------- geography
CREATE TABLE countries (
  code       TEXT PRIMARY KEY,            -- ISO-3166-1 alpha-2, lowercase
  name       TEXT NOT NULL,
  name_local TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE areas (
  id           TEXT PRIMARY KEY,
  country_code TEXT NOT NULL REFERENCES countries(code) ON DELETE RESTRICT,
  name         TEXT NOT NULL,
  name_local   TEXT,
  kind         TEXT NOT NULL DEFAULT 'city' CHECK (kind IN ('city','province','region')),
  lat          REAL,
  lng          REAL,
  zoom         INTEGER DEFAULT 11,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_areas_country ON areas(country_code);

CREATE TABLE districts (
  id         TEXT PRIMARY KEY,
  area_id    TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  name_local TEXT,
  adcode     INTEGER,
  color      TEXT,
  blurb      TEXT,
  geojson    TEXT,                        -- MultiPolygon, WGS-84. Nullable.
  created_at TEXT NOT NULL
);
CREATE INDEX idx_districts_area ON districts(area_id);

-- ------------------------------------------------------------------- places
-- One table for everything you can pin, hotels included.
CREATE TABLE places (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'poi' CHECK (kind IN ('poi','lodging','transport')),
  name         TEXT NOT NULL,
  name_local   TEXT,
  category     TEXT,                      -- sight/food/coffee/... ; null for lodging
  country_code TEXT REFERENCES countries(code) ON DELETE SET NULL,
  area_id      TEXT REFERENCES areas(id) ON DELETE SET NULL,
  district_id  TEXT REFERENCES districts(id) ON DELETE SET NULL,
  lat          REAL,
  lng          REAL,
  address      TEXT,
  link         TEXT,
  description  TEXT,
  source       TEXT,                      -- where it came from ("your list", "added by me", ...)
  -- 'public' places are the shared catalogue; 'private' belong to their creator.
  visibility   TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_places_area ON places(area_id);
CREATE INDEX idx_places_kind ON places(kind);
CREATE INDEX idx_places_category ON places(category);
CREATE INDEX idx_places_district ON places(district_id);

CREATE TABLE place_images (
  id       TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  url      TEXT NOT NULL,
  ord      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_place_images_place ON place_images(place_id);

-- What a given user thinks of a given place. Survives trips being deleted.
-- 'visited' is what keeps a place out of future suggestions.
CREATE TABLE user_places (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id   TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  status     TEXT CHECK (status IN ('want','planned','visited')),
  note       TEXT,
  rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
  visited_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, place_id)
);
CREATE INDEX idx_user_places_status ON user_places(user_id, status);

-- -------------------------------------------------------------------- trips
CREATE TABLE trips (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,               -- YYYY-MM-DD
  end_date   TEXT NOT NULL,
  note       TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_trips_creator ON trips(created_by);

-- Who is in the trip and what they may do.
--   owner  — full control, including deleting the trip and managing members
--   editor — may change the plan
--   viewer — read only
CREATE TABLE trip_members (
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','editor','viewer')),
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  joined_at  TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
CREATE INDEX idx_trip_members_user ON trip_members(user_id);

-- Where you sleep. The hotel is a place, so it brings its own coordinates.
-- A day belongs to every stay whose [check_in, check_out] range covers it —
-- that is what makes a travel day show both the bed you leave and the one you take.
CREATE TABLE trip_stays (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  area_id     TEXT REFERENCES areas(id) ON DELETE SET NULL,
  place_id    TEXT REFERENCES places(id) ON DELETE SET NULL,   -- the hotel, kind='lodging'
  check_in    TEXT NOT NULL,
  check_out   TEXT NOT NULL,
  booked      INTEGER NOT NULL DEFAULT 0,
  booking_ref TEXT,
  note        TEXT,
  ord         INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  CHECK (check_out >= check_in)
);
CREATE INDEX idx_trip_stays_trip ON trip_stays(trip_id, check_in);

CREATE TABLE trip_flights (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  direction    TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound','internal')),
  flight_no    TEXT,
  date         TEXT,
  depart_label TEXT, depart_time TEXT,
  arrive_label TEXT, arrive_time TEXT,
  from_area_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
  to_area_id   TEXT REFERENCES areas(id) ON DELETE SET NULL,
  booked       INTEGER NOT NULL DEFAULT 0,
  booking_ref  TEXT,
  note         TEXT,
  ord          INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_trip_flights_trip ON trip_flights(trip_id, date);

-- Getting between two stays. Options are candidates; exactly one may be chosen.
CREATE TABLE trip_legs (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  from_area_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
  to_area_id   TEXT REFERENCES areas(id) ON DELETE SET NULL,
  from_label   TEXT,                      -- for hops that aren't area-to-area (airport -> city)
  to_label     TEXT,
  ord          INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_trip_legs_trip ON trip_legs(trip_id, date);

CREATE TABLE trip_leg_options (
  id           TEXT PRIMARY KEY,
  leg_id       TEXT NOT NULL REFERENCES trip_legs(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  mode         TEXT CHECK (mode IN ('train','car','taxi','metro','bus','ferry','flight','walk')),
  duration_min INTEGER,
  price        TEXT,
  chosen       INTEGER NOT NULL DEFAULT 0,
  ord          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_leg_options_leg ON trip_leg_options(leg_id);

-- What you actually do on a day. Timing is optional by design: most things only
-- need morning/noon/evening, a few (a booked tour, a train) need a real clock time.
CREATE TABLE trip_items (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  place_id   TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  slot       TEXT CHECK (slot IN ('morning','noon','evening')),
  start_time TEXT,                        -- HH:MM, null unless it matters
  end_time   TEXT,
  ord        INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (trip_id, date, place_id)
);
CREATE INDEX idx_trip_items_day ON trip_items(trip_id, date, ord);

-- The saved shortlist. Deliberately curated by the user — this is the whole
-- point: suggestions come from here, never from a firehose of nearby results.
CREATE TABLE trip_alternatives (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  place_id   TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  date       TEXT,                        -- null = anywhere in the trip
  note       TEXT,
  ord        INTEGER NOT NULL DEFAULT 0,
  added_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (trip_id, place_id)
);
CREATE INDEX idx_trip_alts_trip ON trip_alternatives(trip_id);

-- Per-user, per-trip preferences that don't belong to the plan itself.
CREATE TABLE trip_settings (
  trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);

-- User-level app preferences (theme, last view) — replaces the old localStorage blob.
CREATE TABLE user_settings (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs      TEXT NOT NULL DEFAULT '{}',  -- small JSON document
  updated_at TEXT NOT NULL
);

-- Append-only trail of who changed what. Cheap insurance on a shared trip.
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
