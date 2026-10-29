-- Users, roles and per-user customer ownership.
-- Idempotent: safe to run on a database that already has some or all of this schema.

BEGIN;

CREATE TABLE IF NOT EXISTS app_user (
  user_id       SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'sales' CHECK (role IN ('sales', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nullable when added, so the migration never fails on existing rows.
-- Customers with no owner are visible to nobody. To assign them to a user:
--   UPDATE customer SET sales_user_id = <user_id> WHERE sales_user_id IS NULL;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS sales_user_id INTEGER REFERENCES app_user(user_id);

CREATE INDEX IF NOT EXISTS customer_sales_user_id_idx ON customer (sales_user_id);

COMMIT;
