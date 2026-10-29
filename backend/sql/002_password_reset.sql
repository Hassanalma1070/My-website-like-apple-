-- Password reset tokens, and a per-user token version so changing a password signs out old sessions.
-- Idempotent: safe to run more than once.

BEGIN;

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_reset (
  reset_id   SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 of the token; the token itself is never stored
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_user_created_idx ON password_reset (user_id, created_at);

COMMIT;
