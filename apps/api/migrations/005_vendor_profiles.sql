-- Milestone 6 (part 1) — Vendor registration, onboarding and capability profiles.
--
-- Enumerated types are used for lifecycle states, which are a fixed state
-- machine the database should enforce. Classification values (industry,
-- solution type, delivery model, maturity level) are stored as text and
-- validated against the taxonomy in `src/vendor/taxonomy.ts`, because that
-- vocabulary is expected to grow and a growing enum would mean a migration per
-- new industry (D56).
--
-- Every statement is safe to run repeatedly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_profile_status') THEN
    CREATE TYPE vendor_profile_status AS ENUM (
      'DRAFT', 'SUBMITTED', 'VERIFIED', 'CHANGES_REQUESTED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_verification_state') THEN
    CREATE TYPE vendor_verification_state AS ENUM (
      'UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_offering_kind') THEN
    CREATE TYPE vendor_offering_kind AS ENUM ('PRODUCT', 'SERVICE', 'CAPABILITY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_credential_kind') THEN
    CREATE TYPE vendor_credential_kind AS ENUM (
      'CERTIFICATION', 'LICENCE', 'QUALITY_STANDARD', 'AWARD',
      'INTELLECTUAL_PROPERTY', 'EMPANELMENT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_client_type') THEN
    CREATE TYPE vendor_client_type AS ENUM (
      'CENTRAL_GOVERNMENT', 'STATE_GOVERNMENT', 'PSU', 'URBAN_LOCAL_BODY',
      'PRIVATE', 'NGO', 'ACADEMIC', 'INTERNATIONAL'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_interest_state') THEN
    CREATE TYPE vendor_interest_state AS ENUM ('NONE', 'SUBMITTED', 'WITHDRAWN');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Capability profile — one per vendor organization.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_profiles (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               uuid NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE CASCADE,
  created_by                    uuid REFERENCES users (id),

  status                        vendor_profile_status NOT NULL DEFAULT 'DRAFT',
  verification_state            vendor_verification_state NOT NULL DEFAULT 'UNVERIFIED',

  -- Section 1 — organisation details
  legal_name                    text,
  organization_type             text,
  year_established              integer,
  registration_number           text,
  identifiers                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  registered_address            jsonb NOT NULL DEFAULT '{}'::jsonb,
  operating_states              text[] NOT NULL DEFAULT '{}',
  website                       text,
  primary_contact               jsonb NOT NULL DEFAULT '{}'::jsonb,
  authorised_representative     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Section 2 — business classification
  industries                    text[] NOT NULL DEFAULT '{}',
  sub_domains                   text[] NOT NULL DEFAULT '{}',
  solution_types                text[] NOT NULL DEFAULT '{}',
  other_solution_type           text,

  -- Section 3 — products, services and capabilities
  headline                      text,
  capability_summary            text,
  core_capabilities             text[] NOT NULL DEFAULT '{}',
  expertise_areas               text[] NOT NULL DEFAULT '{}',
  problem_domains               text[] NOT NULL DEFAULT '{}',
  differentiators               text,
  value_proposition             text,
  sectors_served                text[] NOT NULL DEFAULT '{}',
  target_customers              text[] NOT NULL DEFAULT '{}',
  delivery_models               text[] NOT NULL DEFAULT '{}',
  service_coverage              text,
  coverage_notes                text,

  -- Section 4 — capacity and operations
  team_size                     integer,
  domain_expertise              text[] NOT NULL DEFAULT '{}',
  capacity_notes                text,
  delivery_capability           text,
  scalability_notes             text,
  infrastructure_notes          text,
  government_scale_readiness    text,
  typical_project_value_inr     numeric(14, 2),
  min_project_value_inr         numeric(14, 2),
  max_project_value_inr         numeric(14, 2),

  -- Section 5 — experience and past performance
  government_experience         text,
  gem_registered                boolean,
  past_tender_experience        text,
  portfolio_url                 text,

  -- Section 7 — innovation profile
  solution_novelty              text,
  innovation_stage              text,
  problem_being_solved          text,
  innovation_description        text,
  deployment_readiness          text,
  measurable_impact             text,
  has_intellectual_property     boolean,
  intellectual_property_details text,

  -- Conditional, industry-specific answers keyed by question id. The question
  -- catalogue lives in `src/vendor/onboardingSchema.ts`; storing answers as
  -- jsonb means adding a question for a new industry is not a migration.
  dynamic_answers               jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Section 9 — progressive onboarding state
  completion_percentage         integer NOT NULL DEFAULT 0,
  completed_sections            text[] NOT NULL DEFAULT '{}',
  last_section                  text,

  -- Section 8 — AI-ready representation, rebuilt on every write.
  capability_document           text,
  capability_keywords           text[] NOT NULL DEFAULT '{}',
  capability_document_at        timestamptz,
  ai_insights                   jsonb,
  ai_insights_at                timestamptz,
  ai_insights_model             text,

  submitted_at                  timestamptz,
  verified_at                   timestamptz,
  verified_by                   uuid REFERENCES users (id),
  verification_notes            text,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vendor_profiles_year_established_range
    CHECK (year_established IS NULL OR year_established BETWEEN 1800 AND 2100),
  CONSTRAINT vendor_profiles_team_size_positive
    CHECK (team_size IS NULL OR team_size >= 0),
  CONSTRAINT vendor_profiles_value_range
    CHECK (
      min_project_value_inr IS NULL
      OR max_project_value_inr IS NULL
      OR min_project_value_inr <= max_project_value_inr
    )
);

CREATE INDEX IF NOT EXISTS vendor_profiles_status_idx
  ON vendor_profiles (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS vendor_profiles_industries_idx
  ON vendor_profiles USING gin (industries);

CREATE INDEX IF NOT EXISTS vendor_profiles_keywords_idx
  ON vendor_profiles USING gin (capability_keywords);

-- ---------------------------------------------------------------------------
-- Repeatable profile entities.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_offerings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,
  kind              vendor_offering_kind NOT NULL,
  name              text NOT NULL,
  description       text,
  categories        text[] NOT NULL DEFAULT '{}',
  tags              text[] NOT NULL DEFAULT '{}',
  sectors           text[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_offerings_profile_idx
  ON vendor_offerings (vendor_profile_id, created_at);

CREATE TABLE IF NOT EXISTS vendor_experience (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id  uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,
  title              text NOT NULL,
  client_name        text,
  client_type        vendor_client_type,
  sector             text,
  description        text,
  outcome            text,
  contract_value_inr numeric(14, 2),
  start_year         integer,
  end_year           integer,
  reference_url      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_experience_profile_idx
  ON vendor_experience (vendor_profile_id, start_year DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS vendor_credentials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id  uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,
  kind               vendor_credential_kind NOT NULL,
  name               text NOT NULL,
  issuing_authority  text,
  identifier         text,
  issued_on          date,
  valid_until        date,
  notes              text,
  verification_state vendor_verification_state NOT NULL DEFAULT 'UNVERIFIED',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_credentials_profile_idx
  ON vendor_credentials (vendor_profile_id, created_at);

-- ---------------------------------------------------------------------------
-- Compliance documents. Bytes live on disk under the API's upload directory;
-- the row holds the metadata and the verification decision.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id  uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,
  document_type      text NOT NULL,
  title              text NOT NULL,
  file_name          text NOT NULL,
  mime_type          text NOT NULL,
  size_bytes         integer NOT NULL,
  storage_key        text NOT NULL,
  reference_number   text,
  issued_on          date,
  valid_until        date,
  verification_state vendor_verification_state NOT NULL DEFAULT 'PENDING',
  review_notes       text,
  reviewed_by        uuid REFERENCES users (id),
  reviewed_at        timestamptz,
  uploaded_by        uuid REFERENCES users (id),
  uploaded_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vendor_documents_size_positive CHECK (size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS vendor_documents_profile_idx
  ON vendor_documents (vendor_profile_id, uploaded_at DESC);

-- ---------------------------------------------------------------------------
-- Vendor engagement with published procurement opportunities.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_opportunity_engagements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  saved             boolean NOT NULL DEFAULT false,
  interest_state    vendor_interest_state NOT NULL DEFAULT 'NONE',
  interest_message  text,
  interest_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vendor_opportunity_engagements_unique
    UNIQUE (vendor_profile_id, project_id)
);

CREATE INDEX IF NOT EXISTS vendor_opportunity_engagements_profile_idx
  ON vendor_opportunity_engagements (vendor_profile_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Notifications. Written from real events (registration, submission,
-- verification decision, document review). No background job manufactures
-- them, consistent with D30.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendor_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,
  category          text NOT NULL,
  title             text NOT NULL,
  body              text NOT NULL,
  link_path         text,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_notifications_profile_idx
  ON vendor_notifications (vendor_profile_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Opportunity publication. A project becomes visible to vendors only when an
-- official publishes it; reaching REQUIREMENTS_CONFIRMED is not by itself
-- publication (D57).
-- ---------------------------------------------------------------------------

ALTER TABLE procurement_projects
  ADD COLUMN IF NOT EXISTS published_at        timestamptz,
  ADD COLUMN IF NOT EXISTS published_by        uuid REFERENCES users (id),
  ADD COLUMN IF NOT EXISTS opportunity_summary text,
  ADD COLUMN IF NOT EXISTS response_deadline   date;

CREATE INDEX IF NOT EXISTS procurement_projects_published_idx
  ON procurement_projects (published_at DESC)
  WHERE published_at IS NOT NULL;
