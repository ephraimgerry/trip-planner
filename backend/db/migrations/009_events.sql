-- Events: things that are on for a while and then stop.
--
-- A place can close, but it is long-term — the question you ask of it is
-- "is it any good?". An event is temporary by nature, and the question is
-- "is it on while I'm there?". That makes it its own entity rather than one
-- more place kind:
--   * it is queried by date overlap with a trip, which a place never is;
--   * it often happens AT a place you already have (a gallery, a hall), so it
--     may point at one — but it doesn't have to: a pop-up in a mall isn't a
--     place you would ever save on its own;
--   * it has its own taxonomy, which has nothing in common with place
--     categories (a "Live Music" place makes no sense; a "Bakery" event neither).
--
-- Same column-vs-JSON rule as places: dates, category, geography and "free"
-- are filtered on, so they are columns. Opening hours, price tiers and booking
-- notes are only ever displayed, so they live in `attrs`, validated by zod.

-- The categories copy SmartShanghai's event listing, the city's best-known
-- what's-on guide, so the filter reads the way people already browse.
-- A lookup table, not a CHECK, so a new category is an INSERT.
CREATE TABLE event_categories (
  id     TEXT PRIMARY KEY,
  label  TEXT NOT NULL,
  ord    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO event_categories (id, label, ord) VALUES
  ('activities',   'Activities',            1),
  ('art',          'Art Exhibitions',       2),
  ('classes',      'Classes',               3),
  ('clubbing',     'Clubbing',              4),
  ('comedy',       'Comedy',                5),
  ('community',    'Community',             6),
  ('food',         'Events for Foodies',    7),
  ('festivals',    'Festivals & Markets',   8),
  ('concerts',     'Jazz & Concerts',       9),
  ('family',       'Kids & Family',        10),
  ('talks',        'Lectures & Talks',     11),
  ('live-music',   'Live Music',           12),
  ('musicals',     'Musicals & Operas',    13),
  ('networking',   'Networking & Meetups', 14),
  ('nightlife',    'Nightlife',            15),
  ('pub-quiz',     'Pub Quiz',             16),
  ('sports',       'Sports',               17),
  ('stage',        'Stage & Dance',        18);

CREATE TABLE events (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  name_local     TEXT,
  category       TEXT NOT NULL REFERENCES event_categories(id) ON DELETE RESTRICT,
  -- where it happens: a saved place when there is one, else a name and a pin
  venue_place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  venue_name     TEXT,
  country_code   TEXT REFERENCES countries(code) ON DELETE RESTRICT,
  area_id        TEXT REFERENCES areas(id) ON DELETE SET NULL,
  district_id    TEXT REFERENCES districts(id) ON DELETE SET NULL,
  lat            REAL,
  lng            REAL,
  address        TEXT,
  -- inclusive range; a one-day event has end_date NULL (or equal to start)
  start_date     TEXT NOT NULL,
  end_date       TEXT,
  is_free        INTEGER NOT NULL DEFAULT 0 CHECK (is_free IN (0, 1)),
  link           TEXT,
  description    TEXT,
  source         TEXT,
  attrs          TEXT NOT NULL DEFAULT '{}',   -- opensAt, closesAt, price, booking, hoursNote
  visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
-- "what's on in these areas between these dates" is the query this exists for
CREATE INDEX idx_events_area_dates ON events(area_id, start_date, end_date);
CREATE INDEX idx_events_category   ON events(category);

-- Events on a trip. Deliberately NOT a variant of trip_items: the plan is saved
-- as one whole document (PUT /plan replaces every item), so anything stored
-- beside it would be wiped by a window holding an older copy. Events are
-- added and removed one at a time through their own endpoints instead.
CREATE TABLE trip_events (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date        TEXT,                 -- NULL = shortlisted for the trip, not on a day yet
  start_time  TEXT,                 -- HH:MM, only when it matters (a show, a slot)
  note        TEXT,
  ord         INTEGER NOT NULL DEFAULT 0,
  added_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (trip_id, event_id)
);
CREATE INDEX idx_trip_events_trip ON trip_events(trip_id, date);
