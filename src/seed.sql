-- Sample starter data matching the original PHP system's layout.
-- Run after schema.sql: psql "$DATABASE_URL" -f seed.sql

BEGIN;

INSERT INTO queue_types (code, name, start_number, end_number, active) VALUES
    ('R',  'Receiving',           1,   100, TRUE),
    ('RS', 'Releasing — Schools', 200, 299, TRUE),
    ('RD', 'Releasing — Documents', 300, 399, TRUE),
    ('A',  'Authentication',      400, 499, TRUE);

INSERT INTO windows (window_number, window_name, queue_type_id, status) VALUES
    (1, 'Window 1', (SELECT id FROM queue_types WHERE code = 'R'),  'active'),
    (2, 'Window 2', (SELECT id FROM queue_types WHERE code = 'R'),  'active'),
    (3, 'Window 3', (SELECT id FROM queue_types WHERE code = 'R'),  'active'),
    (4, 'Window 4', (SELECT id FROM queue_types WHERE code = 'RS'), 'active'),
    (5, 'Window 5', (SELECT id FROM queue_types WHERE code = 'RD'), 'active'),
    (6, 'Window 6', (SELECT id FROM queue_types WHERE code = 'A'),  'active');

-- Default admin login: username "admin", password "ChangeMe123!"
-- CHANGE THIS PASSWORD IMMEDIATELY after your first login.
INSERT INTO users (username, password_hash, full_name, role, status) VALUES
    ('admin', '$2b$10$i82Mk5pQJaYv.D3NnT5GZuhC/BbFlya8ZFamZYDDNjvTzvvRjo13i', 'System Administrator', 'admin', 'active');

INSERT INTO system_settings (setting_key, setting_value) VALUES
    ('site_title', 'Department of Education Leyte Division (Records-Unit)'),
    ('announcements_enabled', '1'),
    ('display_stale_minutes', '10');

COMMIT;
