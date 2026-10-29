-- One row per Excel export attempt (who, when, what, how many rows).
-- Idempotent: safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS export_log (
  export_id    SERIAL PRIMARY KEY,
  -- SET NULL keeps the audit trail when a user is deleted; user_email still says who it was
  user_id      INTEGER REFERENCES app_user(user_id) ON DELETE SET NULL,
  user_email   TEXT NOT NULL,
  categories   TEXT[] NOT NULL,
  filters      JSONB NOT NULL DEFAULT '{}',
  record_count INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('success', 'failed', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_log_user_created_idx ON export_log (user_id, created_at);

COMMIT;
