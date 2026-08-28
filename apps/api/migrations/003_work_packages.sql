DO $$
BEGIN
  -- Add WORK_PACKAGES_UNDER_REVIEW to procurement_project_status if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'WORK_PACKAGES_UNDER_REVIEW'
      AND enumtypid = 'procurement_project_status'::regtype
  ) THEN
    ALTER TYPE procurement_project_status ADD VALUE 'WORK_PACKAGES_UNDER_REVIEW' BEFORE 'WORK_PACKAGES_CONFIRMED';
  END IF;

  -- Create work package enums
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_status') THEN
    CREATE TYPE work_package_status AS ENUM (
      'AI_GENERATED',
      'UNDER_REVIEW',
      'EDITED',
      'ACCEPTED',
      'REJECTED',
      'MANUAL',
      'CONFIRMED',
      'ARCHIVED',
      'DELETED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_source') THEN
    CREATE TYPE work_package_source AS ENUM (
      'AI_GENERATED',
      'MANUAL',
      'MERGED',
      'SPLIT',
      'SINGLE_PROJECT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_priority') THEN
    CREATE TYPE work_package_priority AS ENUM (
      'CRITICAL',
      'HIGH',
      'MEDIUM',
      'LOW'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_complexity') THEN
    CREATE TYPE work_package_complexity AS ENUM (
      'LOW',
      'MEDIUM',
      'HIGH',
      'VERY_HIGH'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_history_action') THEN
    CREATE TYPE work_package_history_action AS ENUM (
      'GENERATED',
      'EDITED',
      'ACCEPTED',
      'REJECTED',
      'MERGED',
      'SPLIT',
      'DELETED',
      'RESTORED',
      'DUPLICATED',
      'REORDERED',
      'CONFIRMED'
    );
  END IF;
END$$;

-- Table for storing AI decomposition analysis runs and full provenance
CREATE TABLE IF NOT EXISTS work_package_analyses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  triggered_by        uuid NOT NULL REFERENCES users (id),
  status              analysis_run_status NOT NULL DEFAULT 'PENDING',
  provider            text,
  model               text,
  prompt_version      text,
  prompt_hash         text,
  temperature         numeric(3, 2) DEFAULT 0.20,
  generation_time_ms  integer,
  completion_id       text,
  raw_prompt          text,
  raw_response        text,
  token_usage         jsonb DEFAULT '{}'::jsonb,
  confidence_score    numeric(4, 3),
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS work_package_analyses_project_idx
  ON work_package_analyses (project_id, created_at DESC);

-- Core work packages table
CREATE TABLE IF NOT EXISTS work_packages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  analysis_id           uuid REFERENCES work_package_analyses (id) ON DELETE SET NULL,
  package_number        text NOT NULL,
  title                 text NOT NULL,
  description           text NOT NULL,
  scope                 text NOT NULL,
  complexity            work_package_complexity NOT NULL DEFAULT 'MEDIUM',
  priority              work_package_priority NOT NULL DEFAULT 'MEDIUM',
  estimated_category    text NOT NULL DEFAULT 'General Procurement',
  deliverables          text[] NOT NULL DEFAULT '{}',
  notes                 text,
  ai_reasoning          text,
  confidence_score      numeric(4, 3),
  status                work_package_status NOT NULL DEFAULT 'UNDER_REVIEW',
  source                work_package_source NOT NULL DEFAULT 'AI_GENERATED',
  display_order         integer NOT NULL DEFAULT 0,
  is_deleted            boolean NOT NULL DEFAULT false,
  deleted_at            timestamptz,
  rejection_reason      text,
  decided_by            uuid REFERENCES users (id),
  decided_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_packages_project_order_idx
  ON work_packages (project_id, display_order ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS work_packages_status_idx
  ON work_packages (project_id, status);

-- Junction between work packages and requirements
CREATE TABLE IF NOT EXISTS work_package_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id   uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  requirement_id    uuid NOT NULL REFERENCES project_requirements (id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_work_package_requirement UNIQUE (work_package_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS work_package_requirements_wp_idx
  ON work_package_requirements (work_package_id);

CREATE INDEX IF NOT EXISTS work_package_requirements_req_idx
  ON work_package_requirements (requirement_id);

-- Dependencies between work packages
CREATE TABLE IF NOT EXISTS work_package_dependencies (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id             uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  depends_on_work_package_id  uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_work_package_dependency UNIQUE (work_package_id, depends_on_work_package_id),
  CONSTRAINT chk_no_self_dependency CHECK (work_package_id <> depends_on_work_package_id)
);

CREATE INDEX IF NOT EXISTS work_package_dependencies_wp_idx
  ON work_package_dependencies (work_package_id);

CREATE INDEX IF NOT EXISTS work_package_dependencies_dep_idx
  ON work_package_dependencies (depends_on_work_package_id);

-- Version snapshots for preserving initial AI version vs official edits
CREATE TABLE IF NOT EXISTS work_package_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id   uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  version_type      text NOT NULL, -- 'AI_INITIAL', 'OFFICIAL_CURRENT', 'ARCHIVED_PRE_MERGE', 'ARCHIVED_PRE_SPLIT'
  title             text NOT NULL,
  description       text NOT NULL,
  scope             text NOT NULL,
  complexity        work_package_complexity NOT NULL,
  priority          work_package_priority NOT NULL,
  estimated_category text NOT NULL,
  deliverables      text[] NOT NULL DEFAULT '{}',
  notes             text,
  requirement_ids   uuid[] NOT NULL DEFAULT '{}',
  dependency_ids    uuid[] NOT NULL DEFAULT '{}',
  created_by        uuid REFERENCES users (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_package_versions_wp_idx
  ON work_package_versions (work_package_id, created_at DESC);

-- Immutable audit history
CREATE TABLE IF NOT EXISTS work_package_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  work_package_id   uuid REFERENCES work_packages (id) ON DELETE SET NULL,
  actor_id          uuid NOT NULL REFERENCES users (id),
  action            work_package_history_action NOT NULL,
  old_value         jsonb,
  new_value         jsonb,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_package_history_project_idx
  ON work_package_history (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS work_package_history_wp_idx
  ON work_package_history (work_package_id, created_at DESC);
