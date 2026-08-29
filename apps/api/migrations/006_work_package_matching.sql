-- Milestone 6 (part 2) — Work-package-level vendor matching.
--
-- Moves the matching unit from project to confirmed work package, and adds the
-- semantic half of the hybrid retrieval described in
-- ../../docs/ai/vendor-discovery.md. The lexical half needs no schema: it runs
-- on `vendor_profiles.capability_keywords`, which already exists and is already
-- GIN-indexed.
--
-- pgvector is treated as optional (D64). A local Postgres without the extension
-- must still run every migration and every existing feature, so the vector
-- tables are created inside a guard and the application detects their absence
-- at runtime and falls back to lexical-only retrieval. The alternative — a
-- migration that hard-fails on `CREATE EXTENSION` — would make an unrelated
-- packaging decision able to break authentication, projects and requirements.
--
-- Every statement is safe to run repeatedly.

-- ---------------------------------------------------------------------------
-- Vector storage (created only where pgvector is installed).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  has_vector boolean;
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector is not available (%). Semantic retrieval will be disabled and '
                 'matching will run on lexical retrieval alone. Install the extension and '
                 're-run this migration to enable it.', SQLERRM;
  END;

  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') INTO has_vector;
  IF NOT has_vector THEN
    RETURN;
  END IF;

  -- Embeddings live in their own tables rather than as a column on
  -- `vendor_profiles` and `work_packages`. The source rows are read on nearly
  -- every request and a 1024-dimension vector on them would be carried into
  -- every one of those reads; the embedding is also written on a different
  -- schedule than the row it describes, so a separate table keeps the staleness
  -- bookkeeping out of the profile's own updated_at.

  EXECUTE $ddl$
    CREATE TABLE IF NOT EXISTS vendor_capability_embeddings (
      vendor_profile_id  uuid PRIMARY KEY REFERENCES vendor_profiles (id) ON DELETE CASCADE,

      -- Digest of the exact text that was embedded. This is what makes
      -- regeneration cheap and correct: the capability document is rebuilt on
      -- every profile write, but its content usually does not change, and
      -- re-embedding on every write would be an API call per keystroke.
      source_hash        text NOT NULL,

      embedding_model    text NOT NULL,
      embedding_version  integer NOT NULL,
      dimensions         integer NOT NULL,
      embedding          vector(1024) NOT NULL,

      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )
  $ddl$;

  EXECUTE $ddl$
    CREATE TABLE IF NOT EXISTS work_package_embeddings (
      work_package_id       uuid PRIMARY KEY REFERENCES work_packages (id) ON DELETE CASCADE,
      source_hash           text NOT NULL,
      normalization_version integer NOT NULL,
      embedding_model       text NOT NULL,
      embedding_version     integer NOT NULL,
      dimensions            integer NOT NULL,
      embedding             vector(1024) NOT NULL,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now()
    )
  $ddl$;

  -- HNSW rather than IVFFlat: IVFFlat needs a populated table to build a
  -- meaningful list structure and degrades badly when the supplier registry is
  -- small, which is exactly the state this system starts in. HNSW is usable
  -- from the first row (D65). Cosine distance matches the normalised vectors
  -- the embedding service returns.
  EXECUTE $ddl$
    CREATE INDEX IF NOT EXISTS vendor_capability_embeddings_vector_idx
      ON vendor_capability_embeddings USING hnsw (embedding vector_cosine_ops)
  $ddl$;
END$$;

-- ---------------------------------------------------------------------------
-- Match runs — provenance for a single "find suitable vendors" action.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS work_package_match_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id       uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES procurement_projects (id) ON DELETE CASCADE,
  requested_by          uuid NOT NULL REFERENCES users (id),

  -- Everything needed to explain why this run produced what it produced. A
  -- ranking an official acted on must remain interpretable after the weights,
  -- the lexicon or the embedding model have moved on (D68).
  strategy_version      integer NOT NULL,
  normalization_version integer NOT NULL,
  eligibility_version   integer NOT NULL,
  ranking_version       integer NOT NULL,
  weights               jsonb NOT NULL DEFAULT '{}'::jsonb,

  semantic_enabled      boolean NOT NULL,
  embedding_model       text,
  embedding_dimensions  integer,

  lexical_candidates    integer NOT NULL DEFAULT 0,
  semantic_candidates   integer NOT NULL DEFAULT 0,
  pool_size             integer NOT NULL DEFAULT 0,
  eligible_count        integer NOT NULL DEFAULT 0,
  excluded_count        integer NOT NULL DEFAULT 0,
  duration_ms           integer NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_package_match_runs_package_idx
  ON work_package_match_runs (work_package_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Match results — one row per assessed supplier per run.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS work_package_match_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid NOT NULL REFERENCES work_package_match_runs (id) ON DELETE CASCADE,
  work_package_id     uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  vendor_profile_id   uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,

  -- Ineligible suppliers are stored too, with a null rank. An officer is
  -- entitled to see who was excluded and on what ground; silently dropping them
  -- would make the gate unauditable.
  eligible            boolean NOT NULL,
  rank_position       integer,
  overall_score       integer NOT NULL,

  dimension_scores    jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility         jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence            jsonb NOT NULL DEFAULT '{}'::jsonb,

  retrieval_sources   text[] NOT NULL DEFAULT '{}',
  semantic_similarity double precision,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_match_results_unique_vendor UNIQUE (run_id, vendor_profile_id)
);

CREATE INDEX IF NOT EXISTS work_package_match_results_run_idx
  ON work_package_match_results (run_id, rank_position);

-- ---------------------------------------------------------------------------
-- Shortlist — the seam into Milestone 7.
-- ---------------------------------------------------------------------------
--
-- Deliberately minimal: a set of suppliers an official has marked against a
-- work package, and their stated reason. Invitation, RFI issue, structured
-- responses and evaluation are Milestone 7-9 and are NOT modelled here — a
-- table designed now for a workflow not yet specified would be wrong by the
-- time it was used.

CREATE TABLE IF NOT EXISTS work_package_shortlist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id   uuid NOT NULL REFERENCES work_packages (id) ON DELETE CASCADE,
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles (id) ON DELETE CASCADE,

  -- The run the official was looking at when they decided. Keeping it means the
  -- shortlist entry can always be traced back to the scores and the eligibility
  -- result that were on screen at the time.
  source_run_id     uuid REFERENCES work_package_match_runs (id) ON DELETE SET NULL,
  rank_at_shortlist integer,
  score_at_shortlist integer,

  reason            text,
  added_by          uuid NOT NULL REFERENCES users (id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_package_shortlist_unique UNIQUE (work_package_id, vendor_profile_id)
);

CREATE INDEX IF NOT EXISTS work_package_shortlist_package_idx
  ON work_package_shortlist (work_package_id, created_at DESC);
