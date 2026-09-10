-- Branches: the same business behind more than one door.
--
-- % Arabica has two Shanghai shops; Terraform's cafes trade as Blacksheep
-- Espresso in both Shanghai and Tokyo. Neither shape works on its own: one row
-- per brand loses the coordinates, district, hours and visited-mark that belong
-- to a single door, while one row per door loses the fact that they are the
-- same place to you. So the door stays a place, and the brand becomes its own
-- small entity that any number of places can point at — across areas and
-- across countries, since a brand is tied to neither.
CREATE TABLE brands (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_local  TEXT,
  link        TEXT,
  description TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_brands_name ON brands(name);

-- SET NULL, never CASCADE: dropping a brand must not take its branches with it.
ALTER TABLE places ADD COLUMN brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL;
-- what tells this door from the others — "Wukang Road", "Shibuya", "T2 Airside"
ALTER TABLE places ADD COLUMN branch TEXT;
CREATE INDEX idx_places_brand ON places(brand_id) WHERE brand_id IS NOT NULL;

-- Backfill from the naming habit already in the data: "Brand (Branch)".
-- Only where the same prefix appears more than once — a lone parenthetical is
-- far more likely to be a translation ("Grandma's Home (Waipojia)") than a
-- branch, and inventing a brand for it would be noise.
WITH parsed AS (
  SELECT id AS place_id,
         trim(substr(name, 1, instr(name, ' (') - 1)) AS base
    FROM places
   WHERE instr(name, ' (') > 1 AND substr(name, -1) = ')'
),
shared AS (SELECT base FROM parsed GROUP BY base HAVING count(*) > 1)
INSERT INTO brands (id, name, created_at)
SELECT 'brd_' || lower(hex(randomblob(8))), base, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM shared;

UPDATE places
   SET brand_id = (SELECT b.id FROM brands b
                    WHERE b.name = trim(substr(places.name, 1, instr(places.name, ' (') - 1))),
       branch   = trim(substr(places.name, instr(places.name, ' (') + 2,
                              length(places.name) - instr(places.name, ' (') - 2))
 WHERE instr(name, ' (') > 1 AND substr(name, -1) = ')'
   AND EXISTS (SELECT 1 FROM brands b
                WHERE b.name = trim(substr(places.name, 1, instr(places.name, ' (') - 1)));
