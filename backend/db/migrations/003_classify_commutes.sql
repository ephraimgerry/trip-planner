-- =============================================================================
--  003 — give the imported hops a real kind
--
--  The old model stored each option as one free-text line ("G high-speed train
--  — 23–35 min, ¥40"), so 002 could only carry them across as 'other'. Now that
--  kinds are a lookup table this is a data fix, not a schema change: classify
--  by the words people actually wrote, most specific pattern first.
-- =============================================================================

-- maglev before metro/train: it is a train, but calling it one loses the point
UPDATE trip_commutes SET kind = 'train'
 WHERE kind = 'other' AND (label LIKE '%maglev%' OR label LIKE '%磁悬浮%');

UPDATE trip_commutes SET kind = 'metro'
 WHERE kind = 'other' AND (label LIKE '%metro%' OR label LIKE '%subway%' OR label LIKE '%地铁%');

UPDATE trip_commutes SET kind = 'train'
 WHERE kind = 'other' AND (label LIKE '%train%' OR label LIKE '%bullet%' OR label LIKE '%fuxing%'
    OR label LIKE '%复兴%' OR label LIKE '%high-speed%' OR label LIKE 'G %' OR label LIKE '%G-train%'
    OR label LIKE '%D/G%' OR label LIKE '%高铁%');

UPDATE trip_commutes SET kind = 'taxi'
 WHERE kind = 'other' AND (label LIKE '%taxi%' OR label LIKE '%didi%' OR label LIKE '%private car%'
    OR label LIKE '%car /%' OR label LIKE '%intercity car%' OR label LIKE '%出租%');

UPDATE trip_commutes SET kind = 'bus'
 WHERE kind = 'other' AND (label LIKE '%bus%' OR label LIKE '%coach%' OR label LIKE '%大巴%');

UPDATE trip_commutes SET kind = 'ferry'
 WHERE kind = 'other' AND (label LIKE '%ferry%' OR label LIKE '%boat%' OR label LIKE '%渡%');

UPDATE trip_commutes SET kind = 'walk'
 WHERE kind = 'other' AND (label LIKE '%walk%' OR label LIKE '%on foot%');

-- Pull the stated duration out of the label so it can be summed and sorted on.
-- Only the unambiguous "~N min" shapes; anything vaguer stays in the label.
UPDATE trip_commutes SET duration_min = CAST(
    TRIM(REPLACE(REPLACE(SUBSTR(label, INSTR(label,'~') + 1,
      INSTR(SUBSTR(label, INSTR(label,'~')), ' min') - 1), '~',''), ' ','')) AS INTEGER)
 WHERE duration_min IS NULL
   AND INSTR(label, '~') > 0
   AND INSTR(SUBSTR(label, INSTR(label,'~')), ' min') > 1
   AND CAST(TRIM(REPLACE(REPLACE(SUBSTR(label, INSTR(label,'~') + 1,
       INSTR(SUBSTR(label, INSTR(label,'~')), ' min') - 1), '~',''), ' ','')) AS INTEGER) BETWEEN 1 AND 2880;
