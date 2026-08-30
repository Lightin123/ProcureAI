-- Milestone 9 — Evaluation and AI-assisted decision support.
--
-- Milestone 8 stopped at `READY_FOR_EVALUATION`, which records that a response
-- is complete enough to be assessed and is not itself an assessment. This
-- migration adds the assessment, and the human decision it exists to support:
--
--   response in READY_FOR_EVALUATION            (migration 009)
--     -> evaluation criteria                    (here)  — what the department scores on
--     -> evaluation run                         (here)  — one deterministic pass, snapshotted
--     -> per-response result                    (here)  — criterion scores, compliance, gaps
--     -> AI advisory analysis                   (here)  — separate table, never read by a score
--     -> explainable ranking                            — derived from the stored results
--     -> human decision                         (here)  — selected or rejected, reason mandatory
--
-- Six decisions worth stating, because each was the alternative to something
-- that would have made the record less defensible:
--
--  1. Criteria are configured live and **snapshotted into every run**
--     (`work_package_evaluation_runs.criteria_snapshot`). Freezing the
--     configuration outright would stop an official correcting a weight they
--     got wrong; letting a past run re-read the current configuration would
--     make a score an official acted on silently change underneath them. The
--     snapshot is what makes a past run reproducible without freezing the
--     future (D87).
--
--  2. A run **never overwrites an earlier run**. Runs accumulate; the workspace
--     reads the newest, and every earlier one stays readable with the criteria
--     it used. Re-evaluating after a resubmission therefore adds a record
--     rather than destroying the one a decision may already have cited.
--
--  3. **AI analysis lives in its own table**, is append-only, and carries no
--     score column of any kind. There is no foreign key from a criterion score
--     to an analysis and no column an analysis could write a number into, so
--     "the model quietly moved a score" is not a failure this schema can
--     express (D89).
--
--  4. The **decision is per response**, not per work package: an official
--     selects one supplier and may separately record why each of the others was
--     rejected, and both are decisions that need an actor, a moment and a
--     mandatory reason. A partial unique index allows at most one live
--     `SELECTED` per work package, which is the whole of "no automatic
--     selection, and not two of them" (D90).
--
--  5. A decision is **immutable**; correcting one is a revocation that leaves
--     the original row in place with its reason, plus a new decision. The
--     alternative — an UPDATE — would erase the record of what the department
--     first decided, which is the record an auditor is looking for.
--
--  6. Evaluation acts are audited in `work_package_history`, the table every
--     other work-package decision already writes to (D73), by extending its
--     action enum. An auditor asks "what happened to this work package"; the
--     answer must not be split across tables.
--
-- Every statement is safe to run repeatedly.

-- ---------------------------------------------------------------------------
-- Audit vocabulary.
-- ---------------------------------------------------------------------------
--
-- Declared here; written by the API. ADD VALUE is permitted inside the
-- migration runner's transaction so long as the new label is not itself used
-- before that transaction commits, which is why this migration only declares.

ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'EVALUATION_CONFIGURED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'EVALUATION_RUN';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'EVALUATION_AI_ANALYSIS';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'VENDOR_SELECTED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'VENDOR_REJECTED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'DECISION_REVOKED';

-- ---------------------------------------------------------------------------
-- Enumerations.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- What a criterion is scored from. The type is not decoration: it decides
  -- which stored field the deterministic scorer reads and which response
  -- section must be switched on for the criterion to be answerable at all.
  -- `CUSTOM` binds to one of the department's own response questions.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evaluation_criterion_type') THEN
    CREATE TYPE evaluation_criterion_type AS ENUM (
      'PRICE',
      'TIMELINE',
      'CAPACITY',
      'COMPLIANCE',
      'EXPERIENCE',
      'TECHNICAL',
      'REQUIREMENT_COMPLIANCE',
      'CUSTOM'
    );
  END IF;

  -- Which end of a numeric scale is the good end. Fixed for the built-in types
  -- and only meaningful for a numeric `CUSTOM` criterion.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evaluation_criterion_direction') THEN
    CREATE TYPE evaluation_criterion_direction AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER');
  END IF;

  -- A configuration is drafted and then marked ready. Only a ready
  -- configuration can be run, which is what stops a half-weighted criteria set
  -- producing a ranking somebody reads as final.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evaluation_config_status') THEN
    CREATE TYPE evaluation_config_status AS ENUM ('DRAFT', 'READY');
  END IF;

  -- The four verdicts a requirement-by-requirement comparison may reach.
  -- `INSUFFICIENT_INFORMATION` is deliberately distinct from `COMPLIANT`:
  -- silence is not agreement, and a comparison that treated it as agreement
  -- would be the single most misleading thing this table could hold.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evaluation_compliance_status') THEN
    CREATE TYPE evaluation_compliance_status AS ENUM (
      'COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT', 'INSUFFICIENT_INFORMATION'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'procurement_decision_type') THEN
    CREATE TYPE procurement_decision_type AS ENUM ('SELECTED', 'REJECTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'procurement_decision_status') THEN
    CREATE TYPE procurement_decision_status AS ENUM ('ACTIVE', 'REVOKED');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Evaluation configuration — one per work package.
-- ---------------------------------------------------------------------------
--
-- The same reasoning as D78's one-response-configuration-per-work-package:
-- suppliers who are compared have to be compared on the same criteria, and a
-- per-supplier criteria set would produce scores that cannot be laid side by
-- side, which is the reason for scoring them at all.
--
-- `criteria_version` is bumped on every saved change, so a run can state which
-- generation of the criteria it used in one integer as well as in the full
-- snapshot it carries.

CREATE TABLE IF NOT EXISTS work_package_evaluation_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  work_package_id    uuid NOT NULL UNIQUE REFERENCES work_packages (id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  organization_id    uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  status             evaluation_config_status NOT NULL DEFAULT 'DRAFT',
  criteria_version   integer NOT NULL DEFAULT 1,

  title              text,
  notes              text,

  configured_by      uuid NOT NULL REFERENCES users (id),
  updated_by         uuid NOT NULL REFERENCES users (id),

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_evaluation_configs_version_positive CHECK (criteria_version > 0)
);

CREATE INDEX IF NOT EXISTS work_package_evaluation_configs_project_idx
  ON work_package_evaluation_configs (project_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- The criteria themselves.
-- ---------------------------------------------------------------------------
--
-- A table rather than a jsonb array on the configuration, because a criterion
-- can point at a custom question and a foreign key is what stops it pointing at
-- a question belonging to a different work package. Weights are integers that
-- the API requires to sum to exactly 100; expressing that in a CHECK is not
-- possible row by row, so it is validated on write and re-validated before a
-- run, and the run's snapshot records what was actually applied.

CREATE TABLE IF NOT EXISTS work_package_evaluation_criteria (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id      uuid NOT NULL REFERENCES work_package_evaluation_configs (id) ON DELETE CASCADE,

  -- Stable slug used in the stored score rows, so a result stays readable
  -- against its snapshot without a join.
  criterion_key  text NOT NULL,
  criterion_type evaluation_criterion_type NOT NULL,
  direction      evaluation_criterion_direction NOT NULL DEFAULT 'HIGHER_IS_BETTER',

  label          text NOT NULL,
  description    text,

  weight         integer NOT NULL,

  -- The department's own threshold, where it set one: a budget ceiling in INR,
  -- a maximum duration in weeks, a minimum committed team size. Null means the
  -- scorer derives the target from the requirement text instead, and says so.
  target_value   numeric(18, 2),

  -- The custom question a CUSTOM criterion is scored from. Null for every
  -- built-in type.
  question_id    uuid REFERENCES work_package_response_questions (id) ON DELETE CASCADE,

  display_order  integer NOT NULL DEFAULT 0,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_evaluation_criteria_key_unique UNIQUE (config_id, criterion_key),
  CONSTRAINT work_package_evaluation_criteria_weight_range CHECK (weight > 0 AND weight <= 100),
  CONSTRAINT work_package_evaluation_criteria_label_present CHECK (length(btrim(label)) > 0),
  -- A custom criterion is scored from a question; a built-in one is scored from
  -- a stored field and must not claim to be scored from a question.
  CONSTRAINT work_package_evaluation_criteria_question_consistent CHECK (
    (criterion_type = 'CUSTOM') = (question_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS work_package_evaluation_criteria_config_idx
  ON work_package_evaluation_criteria (config_id, display_order, created_at);

-- ---------------------------------------------------------------------------
-- Evaluation runs — one deterministic pass over the responses.
-- ---------------------------------------------------------------------------
--
-- The counterpart of `work_package_match_runs` (D68) for responses rather than
-- for suppliers, and for the same reason: a score an official acted on must
-- stay interpretable after the criteria, the weights or the scoring formulas
-- have moved on. Runs are never updated and never deleted by the application.

CREATE TABLE IF NOT EXISTS work_package_evaluation_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  work_package_id       uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  organization_id       uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  -- ON DELETE SET NULL rather than CASCADE: deleting a configuration must not
  -- silently destroy the record of the evaluations that were run under it. The
  -- snapshot below keeps the run readable either way.
  config_id             uuid REFERENCES work_package_evaluation_configs (id) ON DELETE SET NULL,

  scoring_version       integer NOT NULL,
  criteria_version      integer NOT NULL,

  -- The exact criteria applied, frozen. This is what a later reviewer reads to
  -- reconstruct "which criteria were configured" for this run specifically,
  -- rather than what they happen to be today.
  criteria_snapshot     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- What the department had asked suppliers for at the moment of the run: the
  -- response type, the section modes, the deadline, and the confirmed
  -- requirements the comparison is built over.
  request_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,

  evaluated_count       integer NOT NULL DEFAULT 0,
  ranked_count          integer NOT NULL DEFAULT 0,
  excluded_count        integer NOT NULL DEFAULT 0,
  duration_ms           integer NOT NULL DEFAULT 0,

  requested_by          uuid NOT NULL REFERENCES users (id),
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_evaluation_runs_snapshot_array CHECK (
    jsonb_typeof(criteria_snapshot) = 'array'
  ),
  CONSTRAINT work_package_evaluation_runs_request_object CHECK (
    jsonb_typeof(request_snapshot) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS work_package_evaluation_runs_package_idx
  ON work_package_evaluation_runs (work_package_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Evaluation results — one row per assessed response per run.
-- ---------------------------------------------------------------------------
--
-- Responses that could not be ranked are stored too, with a null rank and the
-- reason they were left out — the same rule the matching gate follows (D68). A
-- department is entitled to see which submissions were not assessed and why,
-- and dropping them silently would make that unanswerable.

CREATE TABLE IF NOT EXISTS work_package_evaluation_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  run_id              uuid NOT NULL REFERENCES work_package_evaluation_runs (id) ON DELETE CASCADE,
  response_id         uuid NOT NULL REFERENCES work_package_responses (id) ON DELETE CASCADE,
  work_package_id     uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  vendor_profile_id   uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,

  ranked              boolean NOT NULL,
  exclusion_reason    text,
  rank_position       integer,

  -- 0.00–100.00. Numeric rather than integer so the weighted sum is stored at
  -- the precision it was computed at, and two responses two tenths apart do not
  -- read as a tie they are not.
  total_score         numeric(6, 2) NOT NULL DEFAULT 0,

  -- Per-criterion score, weight, weighted contribution, method and the evidence
  -- each line was read from. This is the decomposition the explainability
  -- requirement is satisfied by; the total on its own would not be.
  criterion_scores    jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- One entry per confirmed requirement: the supplier's stated position, the
  -- derived compliance status, the evidence and any note.
  compliance          jsonb NOT NULL DEFAULT '[]'::jsonb,
  compliance_summary  jsonb NOT NULL DEFAULT '{}'::jsonb,

  missing_information jsonb NOT NULL DEFAULT '[]'::jsonb,
  strengths           jsonb NOT NULL DEFAULT '[]'::jsonb,
  gaps                jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- The structured facts the comparison lays side by side: quoted value,
  -- duration, committed team size, certifications matched. Stored so the
  -- comparison of a past run does not depend on the response still saying what
  -- it said then.
  structured_summary  jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_evaluation_results_unique UNIQUE (run_id, response_id),
  CONSTRAINT work_package_evaluation_results_rank_consistent CHECK (
    ranked = (rank_position IS NOT NULL)
  ),
  CONSTRAINT work_package_evaluation_results_excluded_explained CHECK (
    ranked = true OR exclusion_reason IS NOT NULL
  ),
  CONSTRAINT work_package_evaluation_results_score_range CHECK (
    total_score >= 0 AND total_score <= 100
  )
);

CREATE INDEX IF NOT EXISTS work_package_evaluation_results_run_idx
  ON work_package_evaluation_results (run_id, rank_position);

CREATE INDEX IF NOT EXISTS work_package_evaluation_results_response_idx
  ON work_package_evaluation_results (response_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- AI advisory analysis.
-- ---------------------------------------------------------------------------
--
-- Deliberately a separate table from the results, with no score column and no
-- reference from any score to any row here. The scoring pipeline never reads
-- it; it is generated on request, stored with its provenance, and rendered to
-- the official under an advisory label.
--
-- Append-only. A regeneration is a new row, so "what AI analysis was generated"
-- has a complete answer rather than a latest one.

CREATE TABLE IF NOT EXISTS work_package_response_ai_analyses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  response_id         uuid NOT NULL REFERENCES work_package_responses (id) ON DELETE CASCADE,
  work_package_id     uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  vendor_profile_id   uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,

  -- The deterministic run this analysis was generated beside, where there was
  -- one. Advisory context for a reviewer, never an input to a score.
  evaluation_run_id   uuid REFERENCES work_package_evaluation_runs (id) ON DELETE SET NULL,

  summary             text NOT NULL,
  technical_fit       text,
  experience_relevance text,

  strengths           jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses          jsonb NOT NULL DEFAULT '[]'::jsonb,
  attention_points    jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Where each observation came from in the response, so a reviewer can check
  -- an assertion against the text it was drawn from rather than taking it.
  evidence            jsonb NOT NULL DEFAULT '[]'::jsonb,

  provider            text NOT NULL,
  model               text NOT NULL,
  prompt_version      text NOT NULL,
  response_time_ms    integer NOT NULL DEFAULT 0,

  generated_by        uuid NOT NULL REFERENCES users (id),
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_response_ai_analyses_summary_present CHECK (
    length(btrim(summary)) > 0
  )
);

CREATE INDEX IF NOT EXISTS work_package_response_ai_analyses_response_idx
  ON work_package_response_ai_analyses (response_id, created_at DESC);

CREATE INDEX IF NOT EXISTS work_package_response_ai_analyses_package_idx
  ON work_package_response_ai_analyses (work_package_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- The human decision.
-- ---------------------------------------------------------------------------
--
-- The only place in this system where a supplier is chosen, and it is written
-- exclusively by a route a government official invoked with a reason they
-- typed. Nothing computes a row here.
--
-- `evaluation_run_id` records which snapshot the official was looking at, so
-- "what ranking was shown when this decision was made" is answerable from the
-- decision itself rather than by guessing at timestamps.

CREATE TABLE IF NOT EXISTS work_package_response_decisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  work_package_id     uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  response_id         uuid NOT NULL REFERENCES work_package_responses (id) ON DELETE CASCADE,
  vendor_profile_id   uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,

  decision            procurement_decision_type NOT NULL,
  status              procurement_decision_status NOT NULL DEFAULT 'ACTIVE',

  -- Not nullable. A procurement decision without a stated reason is not a
  -- record of a decision, it is a record of an outcome.
  reason              text NOT NULL,

  evaluation_run_id   uuid REFERENCES work_package_evaluation_runs (id) ON DELETE SET NULL,
  -- The rank and total the supplier held in that run, read server-side from the
  -- stored result rather than accepted from the request, so a decision cannot
  -- assert a score the system never produced (the rule D69 set for shortlists).
  rank_at_decision    integer,
  score_at_decision   numeric(6, 2),

  decided_by          uuid NOT NULL REFERENCES users (id),
  decided_at          timestamptz NOT NULL DEFAULT now(),

  revoked_by          uuid REFERENCES users (id),
  revoked_at          timestamptz,
  revocation_reason   text,

  CONSTRAINT work_package_response_decisions_reason_present CHECK (
    length(btrim(reason)) > 0
  ),
  CONSTRAINT work_package_response_decisions_revocation_consistent CHECK (
    (status = 'REVOKED') = (revoked_at IS NOT NULL)
  ),
  CONSTRAINT work_package_response_decisions_revocation_explained CHECK (
    status <> 'REVOKED' OR length(btrim(COALESCE(revocation_reason, ''))) > 0
  )
);

-- At most one live decision per response: recording a second while the first
-- stands would leave two answers to "what did the department decide".
CREATE UNIQUE INDEX IF NOT EXISTS work_package_response_decisions_live_unique
  ON work_package_response_decisions (work_package_id, response_id)
  WHERE status = 'ACTIVE';

-- At most one live selection per work package. This is the structural half of
-- "no automatic vendor selection": the other half is that only a route an
-- official calls can write the row at all.
CREATE UNIQUE INDEX IF NOT EXISTS work_package_response_decisions_one_selection
  ON work_package_response_decisions (work_package_id)
  WHERE status = 'ACTIVE' AND decision = 'SELECTED';

CREATE INDEX IF NOT EXISTS work_package_response_decisions_package_idx
  ON work_package_response_decisions (work_package_id, decided_at DESC);
