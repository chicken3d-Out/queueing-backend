-- Migration: remove the Receiving Priority Lane, restore Window 3 to
-- regular Receiving (same as Windows 1 and 2).
-- Run this ONCE against your existing database:
--   psql "$DATABASE_URL" -f migration_remove_priority_lane.sql
--
-- What this does:
--   1. Restores the regular Receiving range back to 1-100 (from 1-89).
--   2. Points Window 3 back at regular Receiving, same as Windows 1 and 2.
--   3. Deactivates the old Priority Lane queue (kept in the table rather
--      than deleted, so ticket_history for any past priority tickets
--      still resolves correctly — it just won't accept new tickets and
--      won't show up anywhere in the app going forward).
--
-- IMPORTANT — check before running: if there are any tickets still
-- WAITING in the Priority Lane queue right now (someone holding a 90-100
-- ticket that hasn't been called yet), no window will be able to call them
-- after this runs, since Window 3 will no longer point to that queue.
-- Check first with:
--   SELECT ticket_number, status FROM tickets t
--   JOIN queue_types qt ON qt.id = t.queue_type_id
--   WHERE qt.code = 'RP' AND status = 'WAITING' AND queue_date = CURRENT_DATE;
-- If that returns rows, either wait until they're all called/cleared, or
-- manually resolve them before running this migration.

BEGIN;

-- 1. Restore Receiving's range to 1-100.
UPDATE queue_types SET end_number = 100 WHERE code = 'R';

-- 2. Point Window 3 back at regular Receiving.
UPDATE windows
SET queue_type_id = (SELECT id FROM queue_types WHERE code = 'R')
WHERE window_number = 3;

-- 3. Deactivate (not delete) the Priority Lane queue.
UPDATE queue_types SET active = FALSE WHERE code = 'RP';

COMMIT;

-- Verify it's fixed:
-- SELECT w.window_number, w.window_name, qt.code, qt.name, qt.start_number, qt.end_number, qt.active
-- FROM windows w JOIN queue_types qt ON qt.id = w.queue_type_id
-- ORDER BY w.window_number;
