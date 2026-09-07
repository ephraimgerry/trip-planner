-- =============================================================================
--  007 — give hotels a check-in policy
--
--  A stay shows the hotel's usual times when you haven't recorded your own.
--  Without a policy the plan reads "check in —", so lodging places get the
--  near-universal default. It is ordinary editable data, not a hardcoded
--  constant, so correcting one hotel is a normal edit.
-- =============================================================================
UPDATE places
   SET attrs = json_set(COALESCE(NULLIF(attrs,''), '{}'), '$.checkInTime', '15:00', '$.checkOutTime', '11:00'),
       updated_at = datetime('now')
 WHERE kind = 'lodging'
   AND json_extract(COALESCE(NULLIF(attrs,''), '{}'), '$.checkInTime') IS NULL;
