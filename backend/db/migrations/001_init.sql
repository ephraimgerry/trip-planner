CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  created_at TEXT
);

CREATE TABLE places (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_cn     TEXT,
  category    TEXT,
  sub         TEXT,
  city        TEXT,
  district    TEXT,
  lat         REAL,
  lng         REAL,
  link        TEXT,
  description TEXT,
  source      TEXT,
  image_urls  TEXT,          -- JSON array
  created_at  TEXT
);
CREATE INDEX idx_places_city ON places(city);
CREATE INDEX idx_places_category ON places(category);

CREATE TABLE trips (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  name       TEXT,
  start_date TEXT,
  end_date   TEXT,
  outbound   TEXT,           -- JSON
  inbound    TEXT,           -- JSON
  segments   TEXT,           -- JSON array
  legs       TEXT,           -- JSON array
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX idx_trips_user ON trips(user_id);

CREATE TABLE trip_places (
  trip_id  TEXT NOT NULL,
  date     TEXT NOT NULL,
  place_id TEXT NOT NULL,
  ord      INTEGER,
  PRIMARY KEY (trip_id, date, place_id)
);
CREATE INDEX idx_trip_places_trip ON trip_places(trip_id);

CREATE TABLE trip_alternatives (
  trip_id  TEXT NOT NULL,
  place_id TEXT NOT NULL,
  ord      INTEGER,
  PRIMARY KEY (trip_id, place_id)
);
