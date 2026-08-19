-- Migration: change Releasing - Schools range from 200-299 to 101-199.
-- Run this ONCE against your existing database:
--   psql "$DATABASE_URL" -f migration_releasing_schools_range.sql
--
-- No app code changes are needed for this — Front Desk, Window operator,
-- and the public Display all read each queue's valid range straight from
-- queue_types.start_number / end_number on every request.
--
-- This only changes the valid range for NEW tickets going forward. Any
-- tickets already registered today under the old 200-299 numbers keep
-- their existing ticket_number as-is — nothing needs to be touched there.

BEGIN;

UPDATE queue_types
SET start_number = 101, end_number = 199
WHERE code = 'RS';

COMMIT;

-- Verify it's fixed:
-- SELECT code, name, start_number, end_number FROM queue_types ORDER BY start_number;
