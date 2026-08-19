-- Migration: restructure Windows 5-6 and add Window 7.
-- Run this ONCE against your existing database:
--   psql "$DATABASE_URL" -f migration_windows_5_6_7.sql
--
-- Before:
--   Window 5 -> Releasing - Documents (300-399)
--   Window 6 -> Authentication (400-499)
--
-- After:
--   Window 5 -> Releasing S.O. (300-350)
--   Window 6 -> Releasing T.O. (351-399)
--   Window 7 (new) -> Authentication (400-499, unchanged range)
--
-- No app code changes are needed — Front Desk's transaction dropdown,
-- Window operator, the public Display, and Admin's window-assignment
-- picker all read window/queue data live from the database on every
-- request, so this takes effect immediately once run.

BEGIN;

-- 1. Create the two new queue types.
INSERT INTO queue_types (code, name, start_number, end_number, active) VALUES
    ('RSO', 'Releasing S.O.', 300, 350, TRUE),
    ('RTO', 'Releasing T.O.', 351, 399, TRUE);

-- 2. Point Window 5 at the new Releasing S.O. queue.
UPDATE windows
SET queue_type_id = (SELECT id FROM queue_types WHERE code = 'RSO')
WHERE window_number = 5;

-- 3. Point Window 6 at the new Releasing T.O. queue.
UPDATE windows
SET queue_type_id = (SELECT id FROM queue_types WHERE code = 'RTO')
WHERE window_number = 6;

-- 4. Deactivate the old combined Releasing - Documents queue (kept, not
--    deleted, so ticket_history for anything already processed under it
--    still resolves correctly).
UPDATE queue_types SET active = FALSE WHERE code = 'RD';

-- 5. Add the new Window 7, serving Authentication.
INSERT INTO windows (window_number, window_name, queue_type_id, status)
VALUES (7, 'Window 7', (SELECT id FROM queue_types WHERE code = 'A'), 'active');

COMMIT;

-- Verify it's fixed:
-- SELECT w.window_number, w.window_name, qt.code, qt.name, qt.start_number, qt.end_number
-- FROM windows w JOIN queue_types qt ON qt.id = w.queue_type_id
-- ORDER BY w.window_number;
