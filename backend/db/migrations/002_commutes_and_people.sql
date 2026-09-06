-- =============================================================================
--  002 — commutes replace flights+legs, and people get a duration
--
--  MODELLING DECISION (both "many types" problems, same answer):
--
--    Single table + a type discriminator + a JSON `attrs` bag.
--
--  The split is decided by ONE question: is the field ever filtered, sorted,
--  joined, aggregated or constrained on?
--
--    yes -> real column      (dates, kind, status, area refs, price, ord)
--    no  -> attrs JSON       (seat number, terminal, fuel policy, plate)
--
--  Everything the day view, the map and the "what haven't I booked" list need
--  is a column, so those queries stay plain SQL with real indexes. Everything
--  else is per-type detail that is only ever displayed, and modelling it as
--  columns would mean a mostly-NULL table that needs a migration every time a
--  new transport type appears.
--
--  Type sets live in lookup tables rather than CHECK constraints, so adding
--  "sleeper train" is an INSERT, not a schema change. `commute_kinds.spans_days`
--  is a data-driven behaviour flag: a car rental is not special-cased in code,
--  it is simply a kind whose rows cover a date range.
-- =============================================================================

-- ---------------------------------------------------------------- type sets
CREATE TABLE place_kinds (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon  TEXT,
  sort  INTEGER NOT NULL DEFAULT 0
);
INSERT INTO place_kinds (id,label,icon,sort) VALUES
  ('poi',      'Place',       'pin',    10),
  ('lodging',  'Stay',        'bed',    20),
  ('transport','Transport',   'train',  30),   -- airport, station, port, bus terminal
  ('rental',   'Rental desk', 'car',    40),   -- where you collect a car
  ('service',  'Service',     'note',   50);   -- clinic, laundry, left luggage

CREATE TABLE commute_kinds (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  icon       TEXT,
  -- 1 = the row naturally covers a range of days (you hold the thing for a while)
  spans_days INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0
);
INSERT INTO commute_kinds (id,label,icon,spans_days,sort) VALUES
  ('flight',     'Flight',      'plane', 0, 10),
  ('train',      'Train',       'train', 0, 20),
  ('bus',        'Bus',         'bus',   0, 30),
  ('ferry',      'Ferry',       'ferry', 0, 40),
  ('metro',      'Metro',       'metro', 0, 50),
  ('taxi',       'Taxi / ride', 'car',   0, 60),
  ('car_rental', 'Car rental',  'car',   1, 70),
  ('car_own',    'Own car',     'car',   1, 75),
  ('rail_pass',  'Rail pass',   'train', 1, 80),
  ('walk',       'Walk',        'walk',  0, 90),
  ('other',      'Other',       'train', 0, 99);

-- ------------------------------------------------------------------ commutes
-- One row per concrete way of getting somewhere. Alternatives for the same hop
-- share a group_id and exactly one of them may be `chosen` — which is how the
-- old "leg with options" idea survives without a second table.
CREATE TABLE trip_commutes (
  id            TEXT PRIMARY KEY,
  trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL REFERENCES commute_kinds(id),

  group_id      TEXT,                              -- NULL = a standalone commute
  chosen        INTEGER NOT NULL DEFAULT 1,
  -- outbound/inbound drive the overview's Out/Back rows; internal is everything else
  direction     TEXT NOT NULL DEFAULT 'internal'
                CHECK (direction IN ('outbound','inbound','internal')),

  -- WHEN. end_* is NULL for a point-in-time hop and set for anything you hold
  -- for a while (a hire car, a rail pass), so "does this touch day D" is the
  -- same range query used for stays.
  start_date    TEXT NOT NULL,
  start_time    TEXT,
  end_date      TEXT,
  end_time      TEXT,

  -- WHERE. Areas drive the day's city; places give it a map pin.
  from_area_id  TEXT REFERENCES areas(id)  ON DELETE SET NULL,
  to_area_id    TEXT REFERENCES areas(id)  ON DELETE SET NULL,
  from_place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  to_place_id   TEXT REFERENCES places(id) ON DELETE SET NULL,
  from_label    TEXT,
  to_label      TEXT,

  -- the primary display string, e.g. "G high-speed train — 30 min, ¥40"
  label         TEXT,
  operator      TEXT,                              -- Singapore Airlines, Hertz, CRH
  code          TEXT,                              -- SQ836, G7042, rental agreement no.

  status        TEXT NOT NULL DEFAULT 'idea'
                CHECK (status IN ('idea','planned','booked')),
  booking_ref   TEXT,
  price_amount  REAL,
  price_currency TEXT,
  duration_min  INTEGER,

  -- Per-type detail that is only ever displayed. Validated per kind by zod at
  -- the API boundary, so it is structured despite not being columns:
  --   flight     { terminal, gate, seat, baggage, aircraft }
  --   train      { car, seat, platform, class }
  --   car_rental { vendor, vehicleClass, plate, fuelPolicy, insurance, driver }
  --   ferry      { cabin, deck }
  attrs         TEXT NOT NULL DEFAULT '{}',

  note          TEXT,
  ord           INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_commutes_trip ON trip_commutes(trip_id, start_date);
CREATE INDEX idx_commutes_group ON trip_commutes(group_id);
CREATE INDEX idx_commutes_span ON trip_commutes(trip_id, start_date, end_date);
-- a hop can only have one chosen answer
CREATE UNIQUE INDEX idx_commutes_one_chosen
  ON trip_commutes(trip_id, group_id) WHERE group_id IS NOT NULL AND chosen = 1;

-- -------------------------------------------------------------- who's coming
-- Deliberately separate from trip_members: membership is who may SEE and EDIT
-- the trip, participation is who is physically ON it. You can plan a trip you
-- aren't going on, and a traveller need not have an account.
CREATE TABLE trip_participants (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,   -- NULL = no account
  name         TEXT NOT NULL,
  email        TEXT,
  colour       TEXT,                                            -- for the UI
  is_organiser INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  ord          INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_participants_trip ON trip_participants(trip_id, ord);
-- one row per person per trip when they do have an account
CREATE UNIQUE INDEX idx_participants_user ON trip_participants(trip_id, user_id)
  WHERE user_id IS NOT NULL;

-- When each person is actually present. One row per continuous stint, so
-- someone who flies home early and rejoins later is two rows, not a fudge.
-- No rows at all means "here for the whole trip".
CREATE TABLE trip_participant_dates (
  id             TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES trip_participants(id) ON DELETE CASCADE,
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  note           TEXT,
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_participant_dates ON trip_participant_dates(participant_id, start_date);

-- Who is on a given commute / in a given room. Empty means "everyone who is on
-- the trip that day", which keeps the common case free of bookkeeping.
CREATE TABLE trip_commute_participants (
  commute_id     TEXT NOT NULL REFERENCES trip_commutes(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES trip_participants(id) ON DELETE CASCADE,
  PRIMARY KEY (commute_id, participant_id)
);
CREATE TABLE trip_stay_participants (
  stay_id        TEXT NOT NULL REFERENCES trip_stays(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES trip_participants(id) ON DELETE CASCADE,
  PRIMARY KEY (stay_id, participant_id)
);

-- ------------------------------------------------- places get the same treatment
-- kind moves from a CHECK constraint to the lookup table, and gains an attrs
-- bag for per-type detail (opening hours, IATA code, star rating, cuisine).
-- SQLite can't alter a CHECK, so the table is rebuilt.
CREATE TABLE places_new (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'poi' REFERENCES place_kinds(id),
  name         TEXT NOT NULL,
  name_local   TEXT,
  category     TEXT,
  country_code TEXT REFERENCES countries(code) ON DELETE SET NULL,
  area_id      TEXT REFERENCES areas(id) ON DELETE SET NULL,
  district_id  TEXT REFERENCES districts(id) ON DELETE SET NULL,
  lat          REAL,
  lng          REAL,
  address      TEXT,
  link         TEXT,
  description  TEXT,
  source       TEXT,
  attrs        TEXT NOT NULL DEFAULT '{}',
  visibility   TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
INSERT INTO places_new (id,kind,name,name_local,category,country_code,area_id,district_id,
                        lat,lng,address,link,description,source,visibility,created_by,created_at,updated_at)
  SELECT id,kind,name,name_local,category,country_code,area_id,district_id,
         lat,lng,address,link,description,source,visibility,created_by,created_at,updated_at FROM places;
DROP TABLE places;
ALTER TABLE places_new RENAME TO places;
CREATE INDEX idx_places_area ON places(area_id);
CREATE INDEX idx_places_kind ON places(kind);
CREATE INDEX idx_places_category ON places(category);
CREATE INDEX idx_places_district ON places(district_id);

-- ------------------------------------------------- carry the old data across
-- flights become commutes of kind 'flight'
INSERT INTO trip_commutes (id,trip_id,kind,group_id,chosen,direction,start_date,start_time,
                           end_date,end_time,from_area_id,to_area_id,from_label,to_label,
                           label,code,status,booking_ref,attrs,note,ord,created_at)
  SELECT f.id, f.trip_id, 'flight', NULL, 1, f.direction,
         COALESCE(f.date, (SELECT start_date FROM trips WHERE id = f.trip_id)),
         f.depart_time, NULL, f.arrive_time,
         f.from_area_id, f.to_area_id, f.depart_label, f.arrive_label,
         TRIM(COALESCE(f.flight_no,'') || CASE WHEN f.depart_label IS NOT NULL
              THEN ' · ' || f.depart_label || COALESCE(' → ' || f.arrive_label,'') ELSE '' END),
         f.flight_no,
         CASE WHEN f.booked = 1 THEN 'booked' ELSE 'idea' END,
         f.booking_ref, '{}', f.note, f.ord, f.created_at
    FROM trip_flights f;

-- each leg option becomes a commute; options for one leg share the leg's id as group_id
INSERT INTO trip_commutes (id,trip_id,kind,group_id,chosen,direction,start_date,
                           from_area_id,to_area_id,from_label,to_label,
                           label,duration_min,status,attrs,ord,created_at)
  SELECT o.id, l.trip_id,
         COALESCE(NULLIF(o.mode,''),'other'),
         l.id,
         o.chosen,
         'internal',
         l.date, l.from_area_id, l.to_area_id, l.from_label, l.to_label,
         o.label, o.duration_min,
         CASE WHEN o.chosen = 1 THEN 'planned' ELSE 'idea' END,
         '{}', o.ord, l.created_at
    FROM trip_leg_options o JOIN trip_legs l ON l.id = o.leg_id;

-- a leg whose options were all unchosen still needs one row marked chosen,
-- otherwise the hop silently disappears from the plan
UPDATE trip_commutes SET chosen = 1
 WHERE group_id IS NOT NULL
   AND ord = 0
   AND NOT EXISTS (SELECT 1 FROM trip_commutes c2
                    WHERE c2.group_id = trip_commutes.group_id AND c2.chosen = 1);

DROP TABLE trip_leg_options;
DROP TABLE trip_legs;
DROP TABLE trip_flights;
