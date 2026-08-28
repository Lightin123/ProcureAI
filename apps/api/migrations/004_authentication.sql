-- Milestone 5 — Authentication and RBAC.
-- Migration 003 is reserved for Milestone 4 (work packages), which is being
-- implemented on a separate branch; this file takes 004 so the two never
-- collide on a filename. Every statement is safe to run repeatedly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('GOVERNMENT_OFFICIAL', 'ADMIN', 'VENDOR');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_kind') THEN
    CREATE TYPE organization_kind AS ENUM ('GOVERNMENT', 'VENDOR');
  END IF;
END$$;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS kind organization_kind NOT NULL DEFAULT 'GOVERNMENT';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash  text,
  ADD COLUMN IF NOT EXISTS is_active      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at  timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- Guarded on the column's current type so a second run is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role' AND data_type = 'text'
  ) THEN
    UPDATE users SET role = 'GOVERNMENT_OFFICIAL'
      WHERE role NOT IN ('GOVERNMENT_OFFICIAL', 'ADMIN', 'VENDOR');
    ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS user_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash           text NOT NULL UNIQUE,
  issued_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  absolute_expires_at  timestamptz NOT NULL,
  revoked_at           timestamptz,
  user_agent           text,
  ip_address           text
);

CREATE INDEX IF NOT EXISTS user_sessions_token_hash_idx
  ON user_sessions (token_hash);

CREATE INDEX IF NOT EXISTS user_sessions_user_idx
  ON user_sessions (user_id, issued_at DESC);
