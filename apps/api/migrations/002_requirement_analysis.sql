DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analysis_run_status') THEN
    CREATE TYPE analysis_run_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirement_kind') THEN
    CREATE TYPE requirement_kind AS ENUM ('REQUIREMENT', 'CONSTRAINT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirement_category') THEN
    CREATE TYPE requirement_category AS ENUM (
      'FUNCTIONAL', 'NON_FUNCTIONAL', 'BUDGET', 'TIMELINE', 'COMPLIANCE', 'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirement_source') THEN
    CREATE TYPE requirement_source AS ENUM ('AI_SUGGESTED', 'MANUAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirement_status') THEN
    CREATE TYPE requirement_status AS ENUM ('SUGGESTED', 'ACCEPTED', 'REJECTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clarification_status') THEN
    CREATE TYPE clarification_status AS ENUM ('OPEN', 'ANSWERED', 'DISMISSED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS requirement_analysis_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  triggered_by   uuid NOT NULL REFERENCES users (id),
  status         analysis_run_status NOT NULL DEFAULT 'PENDING',
  provider       text,
  model          text,
  prompt_version text,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS requirement_analysis_runs_project_idx
  ON requirement_analysis_runs (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_requirements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  analysis_run_id  uuid REFERENCES requirement_analysis_runs (id) ON DELETE SET NULL,
  kind             requirement_kind NOT NULL,
  category         requirement_category NOT NULL,
  text             text NOT NULL,
  rationale        text,
  source           requirement_source NOT NULL,
  status           requirement_status NOT NULL DEFAULT 'SUGGESTED',
  original_text    text,
  rejection_reason text,
  decided_by       uuid REFERENCES users (id),
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_requirements_rejection_reason_required
    CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS project_requirements_project_idx
  ON project_requirements (project_id, created_at);

CREATE TABLE IF NOT EXISTS clarification_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  analysis_run_id uuid REFERENCES requirement_analysis_runs (id) ON DELETE SET NULL,
  question        text NOT NULL,
  rationale       text,
  status          clarification_status NOT NULL DEFAULT 'OPEN',
  answer_text     text,
  answered_by     uuid REFERENCES users (id),
  answered_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clarification_questions_answer_required
    CHECK (status <> 'ANSWERED' OR answer_text IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS clarification_questions_project_idx
  ON clarification_questions (project_id, created_at);

CREATE TABLE IF NOT EXISTS project_stage_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  from_status  procurement_project_status,
  to_status    procurement_project_status NOT NULL,
  actor_id     uuid NOT NULL REFERENCES users (id),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_stage_history_project_idx
  ON project_stage_history (project_id, created_at DESC);
