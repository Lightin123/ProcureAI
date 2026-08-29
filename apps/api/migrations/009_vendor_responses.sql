-- Milestone 8 — Vendor response and proposal collection.
--
-- Milestone 7 stopped at an accepted invitation, which registers an intent to
-- respond and is not itself a response. This migration adds the response
-- itself, and the government-side configuration that decides what a response
-- has to contain:
--
--   accepted invitation                    (migration 008)
--     -> response configuration            (here)  — what is being asked for
--     -> vendor draft                      (here)  — saved, resumable
--     -> requirement answers               (here)  — one per confirmed requirement
--     -> custom question answers           (here)
--     -> supporting documents              (here)  — bytes reuse documentStorage
--     -> submission                        (here)  — validated server-side
--     -> clarifications, both directions   (here)
--     -> READY_FOR_EVALUATION                      — Milestone 9 starts here
--
-- Four decisions worth stating, because each was the alternative to inventing
-- a parallel system:
--
--  1. Response lifecycle events are audited in `work_package_history`, the
--     table every work-package decision already writes to, by extending its
--     action enum. The same reasoning as D73 — an auditor asks "what happened
--     to this work package", and the answer must not be split across tables.
--
--  2. Vendors are notified through `vendor_notifications`, which already
--     carries registration, verification, document-review and invitation
--     events. It gains a `response_id` pointer for the same reason it gained
--     `invitation_id` in migration 008: "is this notification about a live
--     response" is not answerable from a URL string (D74).
--
--  3. Response attachments get their own table rather than reusing
--     `vendor_documents`. A compliance document belongs to the supplier's
--     profile, is reviewed by a platform administrator and is visible to every
--     department that matches against the supplier; a response attachment
--     belongs to one response and is visible to one department. A shared owner
--     would have been the only reason to share a table, and they do not share
--     one. The bytes still go through the single storage module.
--
--  4. There is no EXPIRED response and no background job. A passed deadline is
--     derived from `response_deadline` when the row is read, exactly as D75
--     decided for invitations, and enforced at submission time against the
--     current calendar day (D30).
--
-- Every statement is safe to run repeatedly.

-- ---------------------------------------------------------------------------
-- Audit vocabulary.
-- ---------------------------------------------------------------------------
--
-- Declared here; written by the API. ADD VALUE is permitted inside the
-- migration runner's transaction so long as the new label is not itself used
-- before that transaction commits, which is why this migration only declares.

ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_CONFIGURED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_OPENED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_CLOSED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_SUBMITTED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_RESUBMITTED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_UNDER_REVIEW';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_CLARIFICATION_REQUESTED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_CLARIFICATION_ASKED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_CLARIFICATION_ANSWERED';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_READY_FOR_EVALUATION';
ALTER TYPE work_package_history_action ADD VALUE IF NOT EXISTS 'RESPONSE_WITHDRAWN';

-- ---------------------------------------------------------------------------
-- Enumerations.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- What the department is asking for. The four are not interchangeable: an
  -- expression of interest carries no price, a quotation is mostly price, and
  -- the section defaults the API applies differ accordingly.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_response_type') THEN
    CREATE TYPE work_package_response_type AS ENUM (
      'EXPRESSION_OF_INTEREST', 'RFI', 'PROPOSAL', 'QUOTATION'
    );
  END IF;

  -- A configuration is drafted, then opened to the invited suppliers, then
  -- closed. Opening is the act that makes a response possible, and it is what
  -- the supplier is notified about.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_response_config_status') THEN
    CREATE TYPE work_package_response_config_status AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
  END IF;

  --   DRAFT --> SUBMITTED --> UNDER_REVIEW --> READY_FOR_EVALUATION
  --                               |
  --                               +--> CLARIFICATION_REQUESTED --> RESUBMITTED
  --                                                                     |
  --                                                                     +--> UNDER_REVIEW
  --
  -- WITHDRAWN is reachable by the supplier from any state before evaluation.
  -- There is no EXPIRED: see the header.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_response_status') THEN
    CREATE TYPE work_package_response_status AS ENUM (
      'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CLARIFICATION_REQUESTED',
      'RESUBMITTED', 'READY_FOR_EVALUATION', 'WITHDRAWN'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_response_question_type') THEN
    CREATE TYPE work_package_response_question_type AS ENUM (
      'SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SINGLE_CHOICE', 'MULTI_CHOICE'
    );
  END IF;

  -- How a supplier answered one confirmed requirement. Deliberately a stated
  -- position, not a score: scoring a response is Milestone 9, and a column the
  -- supplier fills in is not an assessment the department made.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_package_requirement_compliance') THEN
    CREATE TYPE work_package_requirement_compliance AS ENUM (
      'MEETS', 'PARTIALLY_MEETS', 'DOES_NOT_MEET', 'NOT_APPLICABLE'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'response_clarification_side') THEN
    CREATE TYPE response_clarification_side AS ENUM ('VENDOR', 'GOVERNMENT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'response_clarification_status') THEN
    CREATE TYPE response_clarification_status AS ENUM ('OPEN', 'ANSWERED');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Response configuration — one per work package.
-- ---------------------------------------------------------------------------
--
-- What the department is asking every invited supplier for. One row per work
-- package, because a response the suppliers are compared on has to be the same
-- response: per-supplier configurations would produce submissions that cannot
-- be laid side by side, which is the reason for collecting them at all.
--
-- `sections` is a jsonb map from a section id declared by
-- `apps/api/src/responses/schema.ts` to 'OFF' | 'OPTIONAL' | 'REQUIRED'. It is
-- validated against that catalogue on write, the same way the onboarding
-- questionnaire's conditional answers are (D58) — the alternative, a column per
-- section, would make adding a section a migration rather than a list entry,
-- and no query filters on one section's mode.

CREATE TABLE IF NOT EXISTS work_package_response_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  work_package_id    uuid NOT NULL UNIQUE REFERENCES work_packages (id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  organization_id    uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  response_type      work_package_response_type NOT NULL,
  status             work_package_response_config_status NOT NULL DEFAULT 'DRAFT',

  title              text,
  instructions       text,
  response_deadline  date,

  sections           jsonb NOT NULL DEFAULT '{}'::jsonb,

  allow_clarifications boolean NOT NULL DEFAULT true,
  allow_documents      boolean NOT NULL DEFAULT true,
  documents_required   boolean NOT NULL DEFAULT false,

  configured_by      uuid NOT NULL REFERENCES users (id),
  opened_by          uuid REFERENCES users (id),
  opened_at          timestamptz,
  closed_by          uuid REFERENCES users (id),
  closed_at          timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_response_configs_sections_object CHECK (
    jsonb_typeof(sections) = 'object'
  ),

  -- Documents cannot be mandatory where they are not permitted at all.
  CONSTRAINT work_package_response_configs_documents_consistent CHECK (
    documents_required = false OR allow_documents = true
  ),

  -- An open or closed configuration carries the moment it was opened; a draft
  -- does not claim to have been.
  CONSTRAINT work_package_response_configs_open_consistent CHECK (
    (status IN ('OPEN', 'CLOSED')) = (opened_at IS NOT NULL)
  ),
  CONSTRAINT work_package_response_configs_close_consistent CHECK (
    (status = 'CLOSED') = (closed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS work_package_response_configs_project_idx
  ON work_package_response_configs (project_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Custom questions.
-- ---------------------------------------------------------------------------
--
-- The department's own questions, over and above the standard sections. They
-- belong to the configuration rather than to a response, so every supplier is
-- asked the same thing and the answers stay comparable.

CREATE TABLE IF NOT EXISTS work_package_response_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id      uuid NOT NULL REFERENCES work_package_response_configs (id) ON DELETE CASCADE,

  -- The section the question is shown under, so a custom question appears
  -- beside the standard fields it belongs with rather than in a bucket at the
  -- end. Validated against the same catalogue as `sections`.
  section        text NOT NULL,

  prompt         text NOT NULL,
  help_text      text,
  answer_type    work_package_response_question_type NOT NULL,

  -- Choices for the two choice types, empty for the rest.
  options        jsonb NOT NULL DEFAULT '[]'::jsonb,

  is_required    boolean NOT NULL DEFAULT false,
  display_order  integer NOT NULL DEFAULT 0,

  created_by     uuid NOT NULL REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_response_questions_options_array CHECK (
    jsonb_typeof(options) = 'array'
  ),
  CONSTRAINT work_package_response_questions_options_present CHECK (
    (answer_type IN ('SINGLE_CHOICE', 'MULTI_CHOICE')) = (jsonb_array_length(options) > 0)
  ),
  CONSTRAINT work_package_response_questions_prompt_present CHECK (length(btrim(prompt)) > 0)
);

CREATE INDEX IF NOT EXISTS work_package_response_questions_config_idx
  ON work_package_response_questions (config_id, display_order, created_at);

-- ---------------------------------------------------------------------------
-- The response itself.
-- ---------------------------------------------------------------------------
--
-- One per invitation. Not one per (work package, supplier): a supplier who was
-- re-invited after a withdrawal is answering a fresh invitation, and its answer
-- to the previous one stays on the record rather than being overwritten. The
-- unique constraint therefore sits on `invitation_id`, which migration 008
-- already keeps to one live row per supplier per package.
--
-- The section fields are explicit columns rather than a jsonb blob. A quoted
-- value, a proposed start date and a committed team size are facts a department
-- reads and sorts on; burying them in jsonb would leave every reader
-- re-deriving their types. Each is nullable, because whether it is required is
-- a property of the configuration and not of the schema — the server enforces
-- that at submission time, from one definition shared with the progress
-- indicator the supplier sees while drafting.

CREATE TABLE IF NOT EXISTS work_package_responses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  config_id          uuid NOT NULL REFERENCES work_package_response_configs (id) ON DELETE CASCADE,
  invitation_id      uuid NOT NULL UNIQUE REFERENCES work_package_invitations (id) ON DELETE CASCADE,
  work_package_id    uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  vendor_profile_id  uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,

  -- The issuing department, denormalised from the project for the same reason
  -- the invitation denormalises it: every government-side read is scoped by it.
  organization_id    uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  status             work_package_response_status NOT NULL DEFAULT 'DRAFT',

  summary            text,

  technical_approach       text,
  technical_standards      text,

  execution_plan           text,
  team_composition         text,

  timeline_summary         text,
  estimated_duration_weeks integer,
  proposed_start_date      date,

  capacity_statement       text,
  committed_team_size      integer,

  experience_summary       text,

  compliance_statement     text,
  compliance_confirmed     boolean NOT NULL DEFAULT false,

  commercial_summary       text,
  quoted_value_inr         bigint,
  price_validity_days      integer,
  payment_terms            text,
  taxes_included           boolean,

  created_by         uuid NOT NULL REFERENCES users (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- Submission is recorded with its actor, which is what makes a submitted
  -- response attributable to a person at the supplier and not merely to an
  -- organisation. `submission_count` distinguishes a first submission from a
  -- resubmission after a clarification without a second timestamp column.
  submitted_at       timestamptz,
  submitted_by       uuid REFERENCES users (id),
  submission_count   integer NOT NULL DEFAULT 0,

  review_started_at  timestamptz,
  review_started_by  uuid REFERENCES users (id),

  readied_at         timestamptz,
  readied_by         uuid REFERENCES users (id),

  withdrawn_at       timestamptz,
  withdrawn_by       uuid REFERENCES users (id),
  withdrawal_reason  text,

  CONSTRAINT work_package_responses_duration_positive CHECK (
    estimated_duration_weeks IS NULL OR estimated_duration_weeks > 0
  ),
  CONSTRAINT work_package_responses_team_positive CHECK (
    committed_team_size IS NULL OR committed_team_size > 0
  ),
  CONSTRAINT work_package_responses_value_non_negative CHECK (
    quoted_value_inr IS NULL OR quoted_value_inr >= 0
  ),
  CONSTRAINT work_package_responses_validity_positive CHECK (
    price_validity_days IS NULL OR price_validity_days > 0
  ),
  CONSTRAINT work_package_responses_submission_count_non_negative CHECK (
    submission_count >= 0
  ),

  -- A response that has left DRAFT has been submitted at least once, and a
  -- draft has not. WITHDRAWN is exempt from both halves, because a supplier may
  -- abandon a response it never submitted.
  CONSTRAINT work_package_responses_submitted_consistent CHECK (
    status = 'WITHDRAWN'
    OR (status IN ('SUBMITTED', 'UNDER_REVIEW', 'CLARIFICATION_REQUESTED',
                   'RESUBMITTED', 'READY_FOR_EVALUATION'))
       = (submitted_at IS NOT NULL AND submission_count > 0)
  ),
  CONSTRAINT work_package_responses_withdrawn_consistent CHECK (
    (status = 'WITHDRAWN') = (withdrawn_at IS NOT NULL)
  ),
  CONSTRAINT work_package_responses_ready_consistent CHECK (
    (status = 'READY_FOR_EVALUATION') = (readied_at IS NOT NULL)
  )
);

-- The department's workspace: every response on this package, newest activity
-- first.
CREATE INDEX IF NOT EXISTS work_package_responses_package_idx
  ON work_package_responses (work_package_id, updated_at DESC);

-- The supplier portal's own query: my responses.
CREATE INDEX IF NOT EXISTS work_package_responses_vendor_idx
  ON work_package_responses (vendor_profile_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS work_package_responses_status_idx
  ON work_package_responses (organization_id, status);

-- ---------------------------------------------------------------------------
-- Requirement-by-requirement answers.
-- ---------------------------------------------------------------------------
--
-- One row per confirmed requirement the supplier answered. A table rather than
-- a jsonb map keyed by requirement id, because the foreign key is what stops an
-- answer referring to a requirement that is not on this work package, and
-- because Milestone 9 compares suppliers requirement by requirement.

CREATE TABLE IF NOT EXISTS work_package_response_requirement_answers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id    uuid NOT NULL REFERENCES work_package_responses (id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES project_requirements (id) ON DELETE CASCADE,

  compliance     work_package_requirement_compliance NOT NULL,
  answer         text,
  notes          text,

  updated_by     uuid NOT NULL REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_response_requirement_answers_unique
    UNIQUE (response_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS work_package_response_requirement_answers_response_idx
  ON work_package_response_requirement_answers (response_id);

-- ---------------------------------------------------------------------------
-- Custom question answers.
-- ---------------------------------------------------------------------------
--
-- `value` is jsonb because the question's own `answer_type` decides the shape:
-- a number, a boolean, a day, one choice or several. The API validates the
-- value against the question's declared type on write, so the column never
-- holds a shape the question did not ask for.

CREATE TABLE IF NOT EXISTS work_package_response_question_answers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id  uuid NOT NULL REFERENCES work_package_responses (id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES work_package_response_questions (id) ON DELETE CASCADE,

  value        jsonb NOT NULL,

  updated_by   uuid NOT NULL REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_response_question_answers_unique UNIQUE (response_id, question_id)
);

CREATE INDEX IF NOT EXISTS work_package_response_question_answers_response_idx
  ON work_package_response_question_answers (response_id);

-- ---------------------------------------------------------------------------
-- Supporting documents.
-- ---------------------------------------------------------------------------
--
-- Metadata only; the bytes go through `apps/api/src/vendor/documentStorage.ts`,
-- the single module that decodes, size-limits, signature-checks and writes an
-- upload. See the header for why this is not `vendor_documents`.

CREATE TABLE IF NOT EXISTS work_package_response_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id   uuid NOT NULL REFERENCES work_package_responses (id) ON DELETE CASCADE,

  title         text NOT NULL,
  description   text,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  storage_key   text NOT NULL,

  uploaded_by   uuid NOT NULL REFERENCES users (id),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_response_documents_size_positive CHECK (size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS work_package_response_documents_response_idx
  ON work_package_response_documents (response_id, uploaded_at DESC);

-- ---------------------------------------------------------------------------
-- Clarifications.
-- ---------------------------------------------------------------------------
--
-- One table for both directions. `raised_by_side` records which side asked, and
-- that is what decides which side may answer — a supplier answering its own
-- question, or a department answering the question it asked, would be a record
-- of a conversation that never happened.
--
-- The question is immutable once asked and the answer is written once. Nothing
-- here is editable, which is what makes the thread a history rather than a pair
-- of mutable fields.

CREATE TABLE IF NOT EXISTS work_package_response_clarifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id       uuid NOT NULL REFERENCES work_package_responses (id) ON DELETE CASCADE,
  work_package_id   uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  raised_by_side    response_clarification_side NOT NULL,
  status            response_clarification_status NOT NULL DEFAULT 'OPEN',

  subject           text,
  question          text NOT NULL,
  asked_by          uuid NOT NULL REFERENCES users (id),
  asked_at          timestamptz NOT NULL DEFAULT now(),
  respond_by        date,

  answer            text,
  answered_by       uuid REFERENCES users (id),
  answered_at       timestamptz,

  CONSTRAINT work_package_response_clarifications_question_present CHECK (
    length(btrim(question)) > 0
  ),
  CONSTRAINT work_package_response_clarifications_answer_consistent CHECK (
    (status = 'ANSWERED') = (answered_at IS NOT NULL AND answer IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS work_package_response_clarifications_response_idx
  ON work_package_response_clarifications (response_id, asked_at DESC);

-- Open clarifications on a package, which is what the department's workspace
-- counts and what the supplier's portal badges.
CREATE INDEX IF NOT EXISTS work_package_response_clarifications_open_idx
  ON work_package_response_clarifications (work_package_id)
  WHERE status = 'OPEN';

-- ---------------------------------------------------------------------------
-- Notification linkage.
-- ---------------------------------------------------------------------------
--
-- The counterpart of migration 008's `invitation_id`, for the same reason: a
-- link path is a string, and "is this notification about this response" is not
-- a question a string answers.

ALTER TABLE vendor_notifications
  ADD COLUMN IF NOT EXISTS response_id uuid
    REFERENCES work_package_responses (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS vendor_notifications_response_idx
  ON vendor_notifications (response_id)
  WHERE response_id IS NOT NULL;
