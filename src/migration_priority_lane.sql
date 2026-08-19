-- Migration: split "Receiving" into a normal lane and a priority lane.
-- Run this ONCE against your existing (already-seeded) database:
--   psql "$DATABASE_URL" -f migration_priority_lane.sql
--
-- Before:  Receiving 001-100, served by Windows 1, 2, and 3 (all same queue)
-- After:   Receiving          001-089, served by Windows 1 and 2
--          Receiving Priority 090-100, served by Window 3 only
--
-- No app code changes are needed for this — every screen (Front Desk
-- dropdown, Window operator, public Display) already reads queue ranges
-- and window assignments straight from these two tables.

BEGIN;

-- 1. Shrink the existing Receiving queue's range down to 1-89.
UPDATE queue_types SET end_number = 89 WHERE code = 'R';

-- 2. Create the new priority queue, 90-100.
INSERT INTO queue_types (code, name, start_number, end_number, active)
VALUES ('RP', 'Receiving — Priority Lane', 90, 100, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 3. Point Window 3 at the new priority queue instead of regular Receiving.
--    Windows 1 and 2 are untouched — they keep serving regular Receiving.
UPDATE windows
SET queue_type_id = (SELECT id FROM queue_types WHERE code = 'RP')
WHERE window_number = 3;

COMMIT;

-- Safety check — run this after, to confirm it looks right:
-- SELECT w.window_number, w.window_name, qt.code, qt.name, qt.start_number, qt.end_number
-- FROM windows w JOIN queue_types qt ON qt.id = w.queue_type_id
-- ORDER BY w.window_number;
