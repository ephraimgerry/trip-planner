-- =============================================================================
--  004 — check-in / check-out times
--
--  Two different facts, so two different homes:
--    · the hotel's usual policy  -> places.attrs.checkInTime  (a property of the hotel)
--    · what YOU actually agreed  -> trip_stays.check_in_time  (a property of the stay)
--  The UI falls back from the stay to the place, so a normal booking needs no
--  data entry and an early check-in is still recordable.
-- =============================================================================
ALTER TABLE trip_stays ADD COLUMN check_in_time  TEXT;   -- HH:MM, null = use the hotel's default
ALTER TABLE trip_stays ADD COLUMN check_out_time TEXT;
