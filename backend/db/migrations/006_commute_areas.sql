-- =============================================================================
--  006 — resolve commute endpoints to real areas
--
--  A commute imported from the old model only had free text ("Shanghai" ->
--  "Suzhou"), so nothing could tell a hop between cities from a taxi across
--  town. Without that distinction every day carrying any transport looked like
--  a travel day — including a same-city hotel change.
--
--  Match each label to an area by name. Labels carry noise ("Hangzhou (Hubin)",
--  "Shanghai Pudong (PVG) 08:20"), so the match is a containment test against
--  the area name, longest name first so "Hong Kong" never loses to a substring.
-- =============================================================================

UPDATE trip_commutes SET from_area_id = (
  SELECT a.id FROM areas a
   WHERE trip_commutes.from_label IS NOT NULL
     AND lower(trip_commutes.from_label) LIKE '%' || lower(a.name) || '%'
   ORDER BY length(a.name) DESC LIMIT 1)
 WHERE from_area_id IS NULL;

UPDATE trip_commutes SET to_area_id = (
  SELECT a.id FROM areas a
   WHERE trip_commutes.to_label IS NOT NULL
     AND lower(trip_commutes.to_label) LIKE '%' || lower(a.name) || '%'
   ORDER BY length(a.name) DESC LIMIT 1)
 WHERE to_area_id IS NULL;

-- An airport transfer names the airport, not the city it serves. Where one end
-- resolved and the other didn't, and the hop is a local mode, both ends are the
-- same place — that is precisely the case that must NOT read as travel.
UPDATE trip_commutes
   SET from_area_id = COALESCE(from_area_id, to_area_id),
       to_area_id   = COALESCE(to_area_id, from_area_id)
 WHERE kind IN ('taxi','metro','bus','walk','car_own','car_rental')
   AND (from_area_id IS NULL) <> (to_area_id IS NULL);

CREATE INDEX idx_commutes_areas ON trip_commutes(trip_id, from_area_id, to_area_id);
