-- Queueing System — PostgreSQL schema (converted from the original MySQL schema)
-- Run once against a fresh database: psql "$DATABASE_URL" -f schema.sql

BEGIN;

CREATE TABLE queue_types (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(5)   NOT NULL UNIQUE,
    name          VARCHAR(100) NOT NULL,
    start_number  INTEGER      NOT NULL,
    end_number    INTEGER      NOT NULL,
    active        BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE windows (
    id                SERIAL PRIMARY KEY,
    window_number     INTEGER      NOT NULL UNIQUE,
    window_name       VARCHAR(100) NOT NULL,
    queue_type_id     INTEGER      NOT NULL REFERENCES queue_types(id),
    status            VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    current_ticket_id INTEGER NULL -- FK added below, after tickets exists
);

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'frontdesk', 'window', 'display')),
    window_id     INTEGER NULL REFERENCES windows(id) ON DELETE SET NULL,
    status        VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
    id             SERIAL PRIMARY KEY,
    ticket_number  INTEGER      NOT NULL,
    queue_type_id  INTEGER      NOT NULL REFERENCES queue_types(id),
    queue_date     DATE         NOT NULL,
    status         VARCHAR(15)  NOT NULL DEFAULT 'WAITING'
                   CHECK (status IN ('WAITING','CALLED','SERVING','COMPLETED','SKIPPED','CANCELLED','TRANSFERRED')),
    window_id      INTEGER NULL REFERENCES windows(id),
    registered_by  INTEGER NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    called_at      TIMESTAMPTZ NULL,
    serving_at     TIMESTAMPTZ NULL,
    completed_at   TIMESTAMPTZ NULL,
    skipped_at     TIMESTAMPTZ NULL,
    cancelled_at   TIMESTAMPTZ NULL
);

ALTER TABLE windows
    ADD CONSTRAINT windows_current_ticket_fk
    FOREIGN KEY (current_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;

CREATE TABLE ticket_history (
    id           SERIAL PRIMARY KEY,
    ticket_id    INTEGER     NOT NULL REFERENCES tickets(id),
    action       VARCHAR(20) NOT NULL, -- REGISTER, CANCEL, CALL_NEXT, RECALL, START_SERVING, COMPLETE, SKIP
    from_status  VARCHAR(15) NULL,
    to_status    VARCHAR(15) NULL,
    window_id    INTEGER NULL REFERENCES windows(id),
    user_id      INTEGER NULL REFERENCES users(id),
    notes        TEXT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_settings (
    setting_key   VARCHAR(50) PRIMARY KEY,
    setting_value TEXT NOT NULL
);

-- Indexes matching the query patterns each endpoint actually runs.
CREATE INDEX idx_tickets_date_status          ON tickets (queue_date, status);
CREATE INDEX idx_tickets_date_queuetype_status ON tickets (queue_date, queue_type_id, status);
CREATE INDEX idx_tickets_window_date_status    ON tickets (window_id, queue_date, status);
CREATE INDEX idx_ticket_history_action_id      ON ticket_history (action, id);

COMMIT;
