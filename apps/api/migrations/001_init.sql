CREATE TABLE IF NOT EXISTS organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  code          text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  email            text NOT NULL UNIQUE,
  role             text NOT NULL,
  organization_id  uuid NOT NULL REFERENCES organizations (id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'procurement_project_status') THEN
    CREATE TYPE procurement_project_status AS ENUM (
      'DRAFT',
      'REQUIREMENTS_ANALYSIS',
      'REQUIREMENTS_CONFIRMED',
      'WORK_PACKAGES_CONFIRMED',
      'IN_DISCOVERY',
      'UNDER_EVALUATION',
      'AWAITING_DECISION',
      'DECISION_RECORDED',
      'CANCELLED'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS procurement_projects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number     text NOT NULL UNIQUE,
  organization_id      uuid NOT NULL REFERENCES organizations (id),
  created_by           uuid NOT NULL REFERENCES users (id),
  title                text NOT NULL,
  problem_description  text NOT NULL,
  status               procurement_project_status NOT NULL DEFAULT 'DRAFT',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS procurement_projects_organization_id_idx
  ON procurement_projects (organization_id);

CREATE INDEX IF NOT EXISTS procurement_projects_created_at_idx
  ON procurement_projects (created_at DESC);
