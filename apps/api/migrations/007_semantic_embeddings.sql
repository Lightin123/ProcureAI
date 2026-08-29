-- Milestone 6 (part 3) — a real sentence encoder for semantic retrieval.
--
-- Two changes, both consequences of replacing the deterministic concept model
-- with BAAI/bge-small-en-v1.5 as the default embedding model:
--
--  1. The vector columns move from 1024 to the encoder's native 384 dimensions.
--     Padding 384 into a 1024-wide column would have preserved cosine exactly
--     and avoided this migration, but it would leave the schema describing a
--     width no model produces, and every future reader would have to know that
--     640 of the dimensions are structurally zero. The column states the truth
--     instead (D70).
--
--  2. `vendor_profiles` gains `semantic_document` — the capability-bearing
--     prose alone, which is what the encoder reads. The full capability
--     document stays as it is: it is what an official and an LLM read, and it
--     is still the source of the keyword set. See the note below (D71).
--
-- Existing vectors are discarded rather than converted. They are derived data
-- with a recorded source digest, so the next match regenerates them; and a
-- 1024-dimension concept vector has no meaningful projection into a 384-
-- dimension encoder space, so converting them would be inventing data.
--
-- pgvector remains optional exactly as in migration 006: where the extension
-- is absent the vector tables do not exist and this migration skips them,
-- leaving lexical-only retrieval working (D64).
--
-- Every statement is safe to run repeatedly.

-- ---------------------------------------------------------------------------
-- The text the encoder reads.
-- ---------------------------------------------------------------------------
--
-- Separate from `capability_document` because the two are read by different
-- things and want different content. A sentence encoder has a fixed context
-- window and averages over what it finds, so registration numbers, addresses,
-- contact details and delivery-model enums compete with the capability prose
-- for the same vector. Measured on the seeded registry, embedding the full
-- document put unrelated packages and suppliers at 0.75 cosine and ranked a
-- road contractor above a farmer producer company for a vegetable supply
-- package; embedding the capability prose alone separated the intended match
-- in every case. The omitted fields are not lost — they are structured columns
-- the eligibility gate and the ranking dimensions read directly (D71).

ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS semantic_document text;

-- ---------------------------------------------------------------------------
-- Vector width.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  current_dims integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE 'pgvector is not installed; semantic retrieval stays disabled and there '
                 'are no vector columns to migrate.';
    RETURN;
  END IF;

  IF to_regclass('vendor_capability_embeddings') IS NULL THEN
    RAISE NOTICE 'Embedding tables are absent; nothing to migrate.';
    RETURN;
  END IF;

  SELECT atttypmod INTO current_dims
  FROM pg_attribute
  WHERE attrelid = 'vendor_capability_embeddings'::regclass AND attname = 'embedding';

  IF current_dims = 384 THEN
    RETURN;  -- Already migrated.
  END IF;

  -- Stored vectors are from a different model and a different space. Clearing
  -- them is what makes them regenerate; the source digest on each row means an
  -- absent row and a stale row are handled by the same code path.
  EXECUTE 'TRUNCATE vendor_capability_embeddings';
  EXECUTE 'TRUNCATE work_package_embeddings';

  EXECUTE 'DROP INDEX IF EXISTS vendor_capability_embeddings_vector_idx';

  EXECUTE 'ALTER TABLE vendor_capability_embeddings
             ALTER COLUMN embedding TYPE vector(384)';
  EXECUTE 'ALTER TABLE work_package_embeddings
             ALTER COLUMN embedding TYPE vector(384)';

  EXECUTE 'CREATE INDEX IF NOT EXISTS vendor_capability_embeddings_vector_idx
             ON vendor_capability_embeddings USING hnsw (embedding vector_cosine_ops)';

  RAISE NOTICE 'Embedding columns migrated to 384 dimensions; stored vectors cleared and '
               'will regenerate on the next match.';
END$$;
