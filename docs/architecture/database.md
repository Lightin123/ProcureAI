# Database Design

**Status:** Substantially implemented through Milestone 5, in progress on
Milestone 6. Migration `001_init.sql` (Milestone 2) created `organizations`,
`users`, and `procurement_projects`; `002_requirement_analysis.sql`
(Milestone 3) added requirement/clarification tracking;
`003_work_packages.sql` (Milestone 4) added work-package decomposition and
review; `004_authentication.sql` (Milestone 5) added real credentials,
sessions, and roles; `005_vendor_profiles.sql` (Milestone 6) added the
vendor capability profile, portfolio, document, opportunity-engagement, and
notification tables; `006_work_package_matching.sql` (Milestone 6, part 2)
added capability and work-package embeddings, match-run provenance,
per-supplier match results, and the shortlist;
`007_semantic_embeddings.sql` (Milestone 6, part 3) narrowed the vector
columns to the current embedding model's 384 dimensions and added
`vendor_profiles.semantic_document`. Evaluation of vendor
**responses** (Evaluation Criteria/Templates, Candidate Evaluations,
Evaluation Runs over submitted proposals) remains conceptual and undesigned
— see [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md).

This document maps the data areas implied by the product requirements and
architecture. The Implemented Schema section below reflects what actually
exists; everything under Conceptual Data Areas is a scope map only, and
detailed design for those areas is deferred to the milestone that builds
them.

## Confirmed Decisions

- PostgreSQL is the system of record. The development instance is hosted
  rather than local (D19).
- Data access is `pg` with hand-written SQL and plain `.sql` migrations —
  no ORM (D20).
- The pgvector extension is used for embeddings-based semantic search, and is
  **optional** rather than required: migration `006` creates the vector tables
  only where the extension installs successfully, migration `007` is guarded
  the same way, and the application detects their absence at runtime and
  degrades to lexical-only retrieval (D64). See
  [Embeddings / Vector Search](#embeddings--vector-search).
- The Express backend (`apps/api`) is the only component with direct
  database access.

## Implemented Schema (Milestone 2)

Defined in `apps/api/migrations/001_init.sql`:

- `organizations` — `id`, `name`, `code` (unique), `created_at`.
- `users` — `id`, `full_name`, `email` (unique), `role`, `organization_id`,
  `created_at`. **No credential columns**: authentication is unresolved
  (U3), so only identity is modelled.
- `procurement_projects` — `id`, `reference_number` (unique),
  `organization_id`, `created_by`, `title`, `problem_description`,
  `status`, `created_at`, `updated_at`. Indexed on `organization_id` and
  `created_at DESC`.
- `procurement_project_status` — a PostgreSQL enum holding the nine
  workflow states defined in
  [../design/procurement-workflow.md](../design/procurement-workflow.md)
  (D22). Only `DRAFT` is currently reachable.
- `schema_migrations` — applied-migration tracking for the runner.

Added in Milestone 3 (`apps/api/migrations/002_requirement_analysis.sql`):

- `requirement_analysis_runs` — one row per analysis attempt: `status`
  (PENDING/SUCCEEDED/FAILED), `provider`, `model`, `prompt_version`,
  `error_message`, `triggered_by`, timestamps. Re-running never overwrites a
  prior run (D31), and failures are recorded rather than lost.
- `project_requirements` — requirements and constraints with full
  provenance: `kind`, `category`, `text`, `rationale`, `source`
  (AI_SUGGESTED/MANUAL), `status` (SUGGESTED/ACCEPTED/REJECTED),
  `analysis_run_id`, `original_text`, `rejection_reason`, `decided_by`.
  A CHECK constraint enforces that a REJECTED row carries a reason.
- `clarification_questions` — `question`, `rationale`, `status`
  (OPEN/ANSWERED/DISMISSED), `answer_text`, `answered_by`. A CHECK constraint
  enforces that an ANSWERED row carries an answer.
- `project_stage_history` — append-only workflow transitions:
  `from_status`, `to_status`, `actor_id`, `reason`, `created_at` (D32).

Supporting enums: `analysis_run_status`, `requirement_kind`,
`requirement_category`, `requirement_source`, `requirement_status`,
`clarification_status`.

Added in Milestone 4 (`apps/api/migrations/003_work_packages.sql`):

- `work_package_analysis_runs` — one row per decomposition attempt, mirroring
  `requirement_analysis_runs`'s provenance pattern.
- `work_packages` — title, description, scope, deliverables, dependencies,
  complexity, priority, estimated procurement category, AI reasoning,
  confidence score, and the same accept/reject/edit/manual provenance
  pattern established for requirements (D28), plus merge/split/soft-delete
  lineage specific to work packages.
- `work_package_history` — append-only record of actions taken on a work
  package (created, edited, merged, split, accepted, rejected, restored),
  distinct from `project_stage_history`, which tracks the project's own
  workflow stage.

Added in Milestone 5 (`apps/api/migrations/004_authentication.sql`):

- `organizations.kind` — `GOVERNMENT` or `VENDOR`, distinguishing a
  government department from a vendor company sharing the same table.
- `users` gained `password_hash`, `is_active`, `last_login_at`, and a
  `role` enum (`GOVERNMENT_OFFICIAL` / `ADMIN` / `VENDOR`) replacing the
  earlier free-text placeholder.
- `user_sessions` — opaque server-side sessions: hashed token, issue/expiry
  timestamps (idle and absolute), revocation, and the requesting user agent
  and IP for audit purposes.

Added in Milestone 6, part 1 (`apps/api/migrations/005_vendor_profiles.sql`):

- `vendor_profiles` — one row per vendor organization: onboarding status
  and verification state; organisation details, business classification,
  capability narrative and structured tags, capacity, experience, and
  innovation-profile columns collected across the onboarding sections;
  completion tracking; and a derived `capability_document` (natural-
  language) plus `capability_keywords` (normalized array), rebuilt on every
  write. Both are now consumed by matching: `capability_keywords` is the
  lexical half of retrieval (it needs no schema of its own and is already
  GIN-indexed), and `capability_document` is what an official and an LLM
  read and the source the keyword set is derived from. The text actually
  embedded into `vendor_capability_embeddings` is a third derived column,
  `semantic_document`, added by migration `007` below — see
  [../ai/rag-and-semantic-search.md](../ai/rag-and-semantic-search.md).
- `vendor_offerings`, `vendor_experience`, `vendor_credentials` — repeatable
  entities under a vendor profile: products/services, past projects,
  certifications.
- `vendor_documents` — compliance document metadata and per-document
  verification state, consistent with the Documents scope map below (file
  content is stored on disk, not in PostgreSQL).
- `vendor_opportunity_engagements` — a vendor's saved/interest state against
  a published procurement project.
- `vendor_notifications` — in-app notifications written from real
  onboarding, verification, and document-review events (no background job
  manufactures them, consistent with D30).
- `procurement_projects` gained `published_at`, `published_by`,
  `opportunity_summary`, `response_deadline` — publication to the vendor
  portal is a distinct, explicit act from confirming requirements
  internally, not a side effect of workflow status.

Added in Milestone 6, part 2
(`apps/api/migrations/006_work_package_matching.sql`) — work-package-level
vendor matching:

- `vendor_capability_embeddings` — one row per vendor profile, keyed on
  `vendor_profile_id` (primary key, cascading from `vendor_profiles`):
  `source_hash` (SHA-256 of the exact text embedded), `embedding_model`,
  `embedding_version`, `dimensions`, `embedding vector(384)` (originally
  `vector(1024)`; narrowed by migration `007` below), and timestamps.
  Indexed by `vendor_capability_embeddings_vector_idx` USING **hnsw**
  (`embedding vector_cosine_ops`) (D65). Created only where pgvector is
  available (D64).
- `work_package_embeddings` — the same shape keyed on `work_package_id`
  (cascading from `work_packages`), plus `normalization_version`, since the
  embedded text is produced by the normalization stage rather than taken
  verbatim from the row. No vector index: work-package vectors are read one
  at a time by primary key, never searched.
- `work_package_match_runs` — one row per "find suitable vendors" action,
  holding everything needed to explain the result later (D68):
  `work_package_id`, `project_id`, `requested_by`; the `strategy_version`,
  `normalization_version`, `eligibility_version`, `ranking_version` and the
  `weights` (jsonb) in force; `semantic_enabled`, `embedding_model`,
  `embedding_dimensions`; and the run's counters —
  `lexical_candidates`, `semantic_candidates`, `pool_size`,
  `eligible_count`, `excluded_count`, `duration_ms`. Indexed on
  `(work_package_id, created_at DESC)`, which is how the last run is found.
- `work_package_match_results` — one row per **assessed** supplier per run,
  not per recommended supplier: `run_id` (cascading), `work_package_id`,
  `vendor_profile_id`, `eligible`, `rank_position` (null for an excluded
  supplier, which is still stored), `overall_score`, the full
  `dimension_scores` array (`{key, label, score, weight, detail}`),
  `eligibility` and `evidence` (jsonb), the `retrieval_sources` that found
  the supplier, and `semantic_similarity`. Unique on
  `(run_id, vendor_profile_id)`.
- `work_package_shortlist` — deliberately minimal (D69): `work_package_id`,
  `vendor_profile_id`, `source_run_id` (the run on screen at the time; ON
  DELETE SET NULL, so a discarded run does not remove the decision),
  `rank_at_shortlist`, `score_at_shortlist`, `reason`, `added_by`,
  `created_at`. Unique on `(work_package_id, vendor_profile_id)`. The rank
  and score are read server-side from the stored run, never accepted from a
  request body.

Added in Milestone 6, part 3
(`apps/api/migrations/007_semantic_embeddings.sql`) — the consequences of
replacing the deterministic concept embedding model with a real sentence
encoder, `BAAI/bge-small-en-v1.5` (D70):

- `vendor_profiles.semantic_document` — a third derived text column
  alongside `capability_document` and `capability_keywords`, holding the
  capability-bearing prose alone: headline, capability summary, problem
  solved, value proposition, differentiators, capabilities and expertise,
  domains and sectors, offerings, past engagements, and the
  industry-specific answers. It is **separate from `capability_document`
  because the two are read by different things and want different content**
  (D71). A sentence encoder reads a fixed window and averages over what it
  finds, so the legal name, registration numbers, address, contact block
  and delivery-model enums in the full document compete with the capability
  prose for the same vector — and being near-identical across suppliers,
  they pull every vector towards the same point. The full document is
  unchanged and still serves display, LLM reading, and keyword derivation.
  The omitted fields are not lost: they are structured columns the
  eligibility gate and the ranking dimensions read directly.
- `vendor_capability_embeddings.embedding` and
  `work_package_embeddings.embedding` move from `vector(1024)` to
  **`vector(384)`**, the encoder's native width, and the HNSW index is
  dropped and recreated around the type change. Padding 384 into a
  1024-wide column would have preserved cosine and avoided the migration,
  but it leaves the schema asserting a width no model produces (D70).
- **Stored vectors are TRUNCATEd, not converted.** A 1024-dimension
  concept vector has no meaningful projection into a 384-dimension encoder
  space, so converting them would be inventing data. They are derived data
  carrying a recorded source digest, so the next match run regenerates them
  through the ordinary digest-keyed path (D67) — an absent row and a stale
  row are already the same code path.
- The whole migration is guarded and repeatable: it no-ops where pgvector
  or the embedding tables are absent (D64), and no-ops again where the
  columns are already 384 wide.

Not yet added: any table for eligibility criteria templates, candidate
evaluations of vendor **responses**, or evaluation/recommendation runs over
submitted proposals — these remain in
[Conceptual Data Areas](#conceptual-data-areas-not-yet-designed-in-detail)
below, now narrowed to specifically the response-evaluation layer
(Milestone 9) rather than vendor matching in general.

## Conceptual Data Areas (Not Yet Designed in Detail)

Grouped by concern below. This is a scope map, not a schema — no table or
column design should be inferred from the grouping or ordering.

### Identity and Organizational Scope — Implemented (Milestone 5)

- **Users** — implemented: real credentials, three roles, session-based
  identity (see [../product/users-and-roles.md](../product/users-and-roles.md)).
- **Organizations / Departments** — implemented: `organizations.kind`
  distinguishes a government department from a vendor company; every
  procurement project and vendor profile is scoped to one organization.
- **Organization Memberships** — still conceptual. The implemented model is
  deliberately **flat, single-organization-per-user** (D49); a user
  belonging to multiple organizations, or a role that varies by
  organization, remains undesigned and is not needed by anything currently
  built.

### Procurement Core

- **Procurement Projects** — top-level entity an official creates, scoped to
  an organization/department; holds problem description and current
  workflow stage.
- **Requirements** — structured requirements extracted from a project's
  problem description, including AI-suggested vs. official-approved state
  (see [AI Suggestion vs. Confirmed State](#ai-suggestions-vs-confirmed-state)).
- **Clarification Questions / Answers** — generated questions and official
  responses tied to a project.
- **Work Packages / Solution Components** — **implemented** (Milestone 4,
  `work_packages`) — divisions of a project's structured requirements into
  procurable units, per
  [../product/requirements.md](../product/requirements.md) FR3.

### Vendors — Partially Implemented (Milestone 6)

- **Vendor Organizations** — implemented as `vendor_profiles`: capability
  data, structured classification, capacity, experience, and the derived
  capability document, semantic document and keywords described above. The
  **embeddings** used for semantic search live in a separate table rather
  than on this one — see
  [Embeddings / Vector Search](#embeddings--vector-search) below.
- **Vendor Memberships / Representatives** — still conceptual, and
  simplified today: one vendor organization currently has exactly one user
  account (the account created at registration), not a set of
  representatives. A vendor organization needing multiple staff accounts
  with different permissions is not yet supported.

### Documents

- **Submissions / Responses** — still conceptual (Milestone 8). A vendor
  organization's response to a work package's RFI/proposal request; links a
  Vendor Organization, a Work Package, and the set of Documents provided.
- **Documents** — **partially implemented.** `vendor_documents` (Milestone
  6) already establishes the pattern this scope map describes for
  compliance documents specifically: metadata in PostgreSQL (filename,
  type, owning vendor profile, storage reference, per-document
  verification state), file content on local disk under the API's upload
  directory rather than in the database — matching
  [architecture.md](architecture.md#file--object-storage-conceptual).
  Extending this pattern to RFI/proposal submissions (Milestone 8) and to
  document-processing output (below) is not yet designed.
- **Document Processing Results** — structured output produced by document
  intelligence (see
  [../ai/document-intelligence.md](../ai/document-intelligence.md)) against
  a specific Document. Results must preserve provenance: each extracted
  piece of information should be traceable back to the source Document (and
  ideally the specific processing attempt that produced it), not merged
  into application state as if it were officially entered data.

### Workflow and Audit

- **Workflow / Stage History** — an append-only record of a procurement
  project's transitions between workflow stages: previous state, new state,
  actor, timestamp, and optionally a reason or triggering action. This is
  conceptually distinct from the general Audit Log below — Workflow / Stage
  History is specifically about the project's stage machine (see
  [../design/procurement-workflow.md](../design/procurement-workflow.md));
  the Audit Log is the broader record of state-changing actions in general.
- **Audit Log** — record of key state-changing actions (see
  [../engineering/security.md](../engineering/security.md)).

### Evaluation and Recommendations — Partly Realised for Matching (Milestone 6)

Three of the four areas below now have a concrete implementation **for
vendor matching specifically**: ranking suppliers against a confirmed work
package from their own capability data. None of them is implemented for the
evaluation of vendor **responses** — scoring what a supplier actually
submits, against criteria defined for that procurement — which is
Milestone 9 and remains undesigned.

- **Evaluation Criteria / Templates** — **not implemented.** Reusable
  definitions of evaluation criteria (e.g. name, description, scoring
  approach, weight) that can be applied across projects or work packages,
  rather than being redefined each time. Supports FR7.7's
  deterministic-vs-AI-assisted split (see
  [../product/requirements.md](../product/requirements.md)). Matching's
  ranking dimensions and weights are code-level and versioned per run
  (`work_package_match_runs.ranking_version` / `weights`), not rows an
  official can define — a criteria-template table is still future work.
- **Candidate Evaluations / Criterion Results** — **partly realised** as
  `work_package_match_results`: a per-supplier record decomposed into
  individual dimension scores with their weight and supporting evidence,
  aggregating into an `overall_score`, and carrying the eligibility verdict
  that gated it. It evaluates a supplier's *profile*, however, not a
  submitted response, and every score in it is deterministic — there is no
  AI-assisted criterion result yet.
- **Evaluation / Recommendation Runs** — **partly realised** as
  `work_package_match_runs`. A run captures the inputs, versions and weights
  behind one execution, so results stay traceable and reproducible and a new
  run never silently overwrites the previous one (D68). Comparison UX across
  runs is still not designed. See
  [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md).
- **Rankings / Recommendations** — **partly realised**: the ordered,
  explainable output of a matching run is the `rank_position`-bearing subset
  of `work_package_match_results`, and excluded suppliers are retained in the
  same table with a null rank so the eligibility gate stays auditable.
  `work_package_shortlist` records which of those recommendations an official
  acted on. Vendor invitation, RFI issue and response evaluation are
  **not** modelled (D69).

## Embeddings / Vector Search

Implemented in Milestone 6, part 2; the model and vector width were revised in
part 3. Two vectors are stored, both in their own tables rather than as a
column on the row they describe — the source rows are read on nearly every
request and would otherwise carry the vector into all of those reads, and the
vector is written on a different schedule than its source row.

- **What is stored.** `vendor_capability_embeddings` holds one vector per
  vendor profile, embedded from the derived `semantic_document`;
  `work_package_embeddings` holds one vector per work package, embedded from
  the normalization stage's `semanticDocument`. Neither is embedded from the
  full document it belongs to (D71). Each row carries the model, the
  embedding and pipeline versions, the dimensionality, and the digest of the
  exact text embedded.
- **Model and dimensionality (D66, D70).** The default is
  `BAAI/bge-small-en-v1.5`, a sentence encoder run locally on CPU inside the
  AI service through `fastembed`'s ONNX runtime — no API key, and offline
  after a one-off model download. The earlier deterministic concept-space
  model is retained as the offline fallback, and hosted embeddings remain
  available opt-in; all three sit behind one `EmbeddingProvider` protocol.
  Vector width is **384**, the encoder's native size. Embedding generation
  stays owned by the AI service; the resulting vectors are persisted by the
  Express backend.
- **Indexing (D65).** HNSW with `vector_cosine_ops` on the vendor capability
  vectors, chosen over IVFFlat because IVFFlat builds its list structure from
  the data present at index time and degrades on the small registry this
  system starts with. The work-package vectors are not indexed: they are read
  by primary key, one at a time.
- **Optionality (D64).** The migration attempts `CREATE EXTENSION IF NOT
  EXISTS vector` inside a `DO $$ ... EXCEPTION WHEN OTHERS THEN RAISE NOTICE
  ... END $$` guard and creates the two vector tables via `EXECUTE` only when
  the extension is present. The non-vector matching tables are created
  unconditionally. At runtime `semanticStorageAvailable()` checks for the
  tables with `to_regclass(...)`, and retrieval degrades to its lexical half
  alone when they are absent. A Postgres without pgvector therefore runs every
  migration and every existing feature.
- **Lifecycle (D67).** Vectors are regenerated on a **source digest**, not on
  a write: a row is recomputed only when `source_hash`, the pipeline version,
  or the `embedding_model` that produced it changes, and the check runs at
  match time rather than on the profile-save path. A failed regeneration
  leaves the previous vector in place. Migration `007` relies on exactly this
  — it clears the stored vectors and lets the next match run rebuild them.

## AI Suggestions vs. Confirmed State

Per the product principle of separating AI output from confirmed state (see
[../product/product.md](../product/product.md)), AI-generated content
(requirements, work packages/solution components, document processing
results, evaluations) must remain **traceable to the human-confirmed data
that resulted from it**, and vice versa — an official-confirmed record
should be traceable back to the AI suggestion(s) it was derived from, where
applicable.

**For requirements (implemented, D28)** the chosen mechanism is a single
table with provenance columns: `source` distinguishes AI-suggested from
manually authored, `status` carries the review decision, `analysis_run_id`
links back to the run that produced it, and `original_text` preserves the
AI's wording so an edited item remains traceable to what was suggested.

For every other data area, a single status column is
**not assumed to be sufficient** — some domains may need it,
others may need separate suggestion vs. confirmed entities, or a versioned
record of edits between suggestion and approval. Which approach fits which
data area (status-based, separate-entity, or version-based) is a per-domain
design decision to be made when each area is actually implemented, not a
single global pattern decided here.

## Explicitly Not Yet Decided

- Detailed table/column schema for reusable evaluation criteria/templates and
  for candidate evaluations of vendor **responses** (Milestone 9) — see
  [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md). The
  matching-side equivalents are now built (`work_package_match_runs` /
  `work_package_match_results`); see
  [../ai/vendor-discovery.md](../ai/vendor-discovery.md).
- Whether an unverified vendor's embeddings/matching data are generated and
  stored before verification, or only after.
- The specific mechanism used to satisfy traceability in
  [AI Suggestions vs. Confirmed State](#ai-suggestions-vs-confirmed-state)
  for response **evaluation** specifically. For matching the question is now
  answered, and neither the requirements (D28) nor the work-package pattern
  was the answer: matching produces a *ranking over existing data* rather
  than *new suggested data*, so the mechanism is run provenance (D68) plus a
  shortlist entry that records the official's own act and the run it was
  taken from (D69). Whether that generalises to evaluating submitted
  responses is untested.
- Retention and comparison UX for multiple Evaluation / Recommendation Runs.
- Schema for vendor submissions/responses (Milestone 8) and Vendor
  Memberships / Representatives (multiple staff per vendor organization).

## Related Documents

- [architecture.md](architecture.md)
- [technology-stack.md](technology-stack.md)
- [../product/users-and-roles.md](../product/users-and-roles.md)
- [../ai/rag-and-semantic-search.md](../ai/rag-and-semantic-search.md)
- [../ai/document-intelligence.md](../ai/document-intelligence.md)
- [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
- [../engineering/security.md](../engineering/security.md)
- [decisions.md](decisions.md)
