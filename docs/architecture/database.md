# Database Design

**Status:** Substantially implemented through Milestone 9. Migration `001_init.sql` (Milestone 2) created `organizations`,
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
`vendor_profiles.semantic_document`; `008_vendor_engagement.sql`
(Milestone 7) added work-package invitations and linked the existing vendor
notifications to them; `009_vendor_responses.sql` (Milestone 8) added the
response configuration, the response itself and its answers, attachments and
clarifications; and `010_evaluation.sql` (Milestone 9) added evaluation
criteria, evaluation runs and their per-response results, the advisory AI
analysis and the recorded human decision — see
[../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md).

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
  request body. **Milestone 7 built the invitation on this table unchanged**
  — no column was added to it, and it remains the sole precondition for
  inviting a supplier.

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

Three of the four areas below have a concrete implementation **for vendor
matching**: ranking suppliers against a confirmed work package from their own
capability data. All four now also have one for the evaluation of vendor
**responses** — scoring what a supplier actually submitted, against criteria
defined for that procurement — see
[Evaluation and Decision (Milestone 9)](#evaluation-and-decision-milestone-9).
What remains unbuilt is only the *reusable template* half of the first area.

- **Evaluation Criteria / Templates** — **built per work package, not as a
  reusable library.** `work_package_evaluation_criteria` holds a criterion's
  name, description, type, weight, direction and optional threshold, and the
  API serves presets per response type. Reusable definitions applied across
  projects — rather than configured per package from a preset — remain
  unimplemented. Supports FR7.7's
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
  acted on, and `work_package_invitations` records which of those shortlist
  entries became an approach to the supplier and how the supplier answered
  (Milestone 7). RFI issue and response evaluation are still **not** modelled.

## Vendor Engagement (Milestone 7)

Added by `apps/api/migrations/008_vendor_engagement.sql`. One new table, one
new enum, six new labels on an existing enum, and one nullable column on an
existing table — the milestone is deliberately small in the schema because
the shortlist seam (D69) and the notification table were already there.

- `work_package_invitations` — an invitation issued by a department to a
  shortlisted supplier for one work package. `work_package_id` and
  `project_id` (both cascading), `vendor_profile_id` (cascading),
  `organization_id` (the **issuing department**, denormalised from the
  project because "who invited us" is a fact the supplier is shown and
  resolving it through two joins on every read saves nothing), `shortlist_id`
  (ON DELETE SET NULL — dropping a shortlist entry must not delete the record
  that the supplier was invited and what they answered), `status`, `message`,
  `response_deadline`, `invited_by` / `invited_at`, `responded_by` /
  `responded_at` / `response_note`, and `withdrawn_by` / `withdrawn_at` /
  `withdrawal_reason`.

  Two CHECK constraints keep the timestamps honest: a row is `ACCEPTED` or
  `DECLINED` **iff** `responded_at` is set, and `WITHDRAWN` **iff**
  `withdrawn_at` is set. A partial unique index over
  `(work_package_id, vendor_profile_id) WHERE status IN ('INVITED','ACCEPTED')`
  permits exactly one live invitation per supplier per package while leaving
  withdrawn and declined invitations outside the constraint, so re-inviting
  after either is a fresh, separately audited row (D75). Indexed on
  `(work_package_id, invited_at DESC)` for the department's tracking view and
  `(vendor_profile_id, invited_at DESC)` for the supplier's own list.

- `work_package_invitation_status` — `INVITED`, `ACCEPTED`, `DECLINED`,
  `WITHDRAWN`. An enum rather than free text for the same reason the vendor
  profile and verification states are enums (D56): this is a fixed state
  machine and the database should enforce it. There is no `EXPIRED` — see
  D75.

- `work_package_history_action` gains `SHORTLISTED`, `SHORTLIST_REMOVED`,
  `INVITED`, `INVITATION_WITHDRAWN`, `INVITATION_ACCEPTED` and
  `INVITATION_DECLINED` (D73). Shortlist and invitation decisions are audited
  in the table every other work-package decision already writes to, with the
  same actor / action / old / new / reason / timestamp shape. A supplier's
  acceptance is recorded with the **supplier's** user as `actor_id`, so the
  department does not appear in the record as the author of an acceptance it
  did not make.

- `vendor_notifications.invitation_id` — nullable, cascading. The existing
  `link_path` already takes the supplier to the right page; this column is
  what makes the relationship queryable, since "is this notification about a
  live invitation" is not answerable from a URL string (D74). A partial index
  on the unread predicate (`WHERE read_at IS NULL`) backs the header badge,
  which is counted on every page load of the supplier portal.

No table was added for the supplier's *answer to the invitation*: that answer
*is* the invitation's `status`, `responded_by`, `responded_at` and
`response_note`. A separate `invitation_responses` table would model a
one-to-one relationship as one-to-many and invite a second, contradictory
answer to exist. The structured proposal is a genuinely different entity and
got its own tables in Milestone 8, below.

## Vendor Responses (Milestone 8)

Added by `apps/api/migrations/009_vendor_responses.sql`. Six new tables, seven
new enums, eleven new labels on `work_package_history_action`, and one
nullable column on `vendor_notifications`. The accepted invitation from
Milestone 7 is the seam and was not changed.

- `work_package_response_configs` — what the department is asking every
  invited supplier for, **one row per work package** (unique on
  `work_package_id`). Carries `response_type`
  (`EXPRESSION_OF_INTEREST` / `RFI` / `PROPOSAL` / `QUOTATION`), `status`
  (`DRAFT` / `OPEN` / `CLOSED`), `title`, `instructions`, `response_deadline`,
  a `sections` jsonb map of section id to `OFF` / `OPTIONAL` / `REQUIRED`,
  `allow_clarifications`, `allow_documents`, `documents_required`, and the
  actor and moment of configuring, opening and closing. CHECK constraints keep
  the lifecycle honest — an `OPEN` or `CLOSED` row carries `opened_at`, a
  `CLOSED` row carries `closed_at` — and documents cannot be mandatory where
  they are not permitted. One configuration per package rather than per
  supplier, because responses compared side by side have to be the same
  response (D78). `sections` is jsonb validated against the catalogue in
  `apps/api/src/responses/schema.ts` rather than a column per section, since
  adding a section should be a list entry and no query filters on one
  section's mode (D79).

- `work_package_response_questions` — the department's own questions, over and
  above the standard sections, attached to the **configuration** so every
  supplier is asked the same thing. `section` (validated against the same
  catalogue), `prompt`, `help_text`, `answer_type`, `options` jsonb,
  `is_required`, `display_order`. A CHECK enforces that the two choice types
  carry options and the other five do not, which is the same rule the API
  states in a message.

- `work_package_responses` — the response itself, **one per invitation**
  (unique on `invitation_id`), not one per (work package, supplier): a
  supplier re-invited after a withdrawal is answering a fresh invitation, and
  its answer to the previous one stays on the record. Carries `config_id`,
  `work_package_id`, `project_id`, `vendor_profile_id`, `organization_id` (the
  issuing department, denormalised as the invitation denormalises it),
  `status`, and the section values as **explicit nullable columns** —
  `summary`, `technical_approach`, `technical_standards`, `execution_plan`,
  `team_composition`, `timeline_summary`, `estimated_duration_weeks`,
  `proposed_start_date`, `capacity_statement`, `committed_team_size`,
  `experience_summary`, `compliance_statement`, `compliance_confirmed`,
  `commercial_summary`, `quoted_value_inr`, `price_validity_days`,
  `payment_terms`, `taxes_included` — plus `submitted_at` / `submitted_by` /
  `submission_count`, `review_started_at` / `_by`, `readied_at` / `_by`, and
  `withdrawn_at` / `_by` / `withdrawal_reason`.

  Columns rather than a jsonb blob because a quoted value, a start date and a
  team size are facts the department reads and sorts on, and Milestone 9 will
  compare (D79). Each is nullable because whether it is *required* belongs to
  the configuration, not to the schema. CHECK constraints keep the numbers
  positive and the lifecycle honest: a row that has left `DRAFT` carries
  `submitted_at` and a non-zero `submission_count`, a `WITHDRAWN` row carries
  `withdrawn_at`, and a `READY_FOR_EVALUATION` row carries `readied_at`.
  Indexed on `(work_package_id, updated_at DESC)` for the department's
  workspace, `(vendor_profile_id, updated_at DESC)` for the supplier's own
  list, and `(organization_id, status)` for the status counts.

- `work_package_response_status` — `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`,
  `CLARIFICATION_REQUESTED`, `RESUBMITTED`, `READY_FOR_EVALUATION`,
  `WITHDRAWN`. There is no `EXPIRED`, for the reason D75 gave for invitations:
  a passed deadline is derived at read time and enforced at submission (D81).

- `work_package_response_requirement_answers` — one row per confirmed
  requirement the supplier answered, unique on `(response_id,
  requirement_id)`. Holds `compliance` (`MEETS` / `PARTIALLY_MEETS` /
  `DOES_NOT_MEET` / `NOT_APPLICABLE`), the written `answer`, a `notes` field,
  and its actor. A table rather than a jsonb map keyed by requirement id,
  because the foreign key is what stops an answer referring to a requirement
  that is not on this work package — and because Milestone 9 compares
  suppliers requirement by requirement.

- `work_package_response_question_answers` — one row per custom question
  answered, unique on `(response_id, question_id)`. `value` is jsonb because
  the question's own `answer_type` decides the shape; the API validates the
  value against that type on write, so the column never holds a shape the
  question did not ask for.

- `work_package_response_documents` — attachment metadata: `title`,
  `description`, `file_name`, `mime_type`, `size_bytes`, `storage_key`, actor
  and moment. Deliberately **not** `vendor_documents`: a compliance document
  belongs to the supplier's profile, is reviewed by an administrator and is
  visible to every department that matches against the supplier, whereas a
  response attachment belongs to one response, is visible to one department,
  and is deleted with the response (D84). The bytes still go through
  `apps/api/src/vendor/documentStorage.ts`, which gained an allowlist of
  upload folders rather than a free-form path.

- `work_package_response_clarifications` — one table for **both directions**.
  `raised_by_side` (`VENDOR` / `GOVERNMENT`) records which side asked and is
  what decides which side may answer, enforced in the `UPDATE`'s `WHERE`
  clause. Holds `subject`, `question`, `asked_by` / `asked_at`, an optional
  `respond_by` date, and `answer` / `answered_by` / `answered_at`, with a
  CHECK that `ANSWERED` and an answer imply each other. Neither the question
  nor the answer is editable, which is what makes the thread a record rather
  than a pair of mutable fields (D82). A partial index on the open predicate
  backs the counts both portals show.

- `work_package_history_action` gains `RESPONSE_CONFIGURED`,
  `RESPONSE_OPENED`, `RESPONSE_CLOSED`, `RESPONSE_SUBMITTED`,
  `RESPONSE_RESUBMITTED`, `RESPONSE_UNDER_REVIEW`,
  `RESPONSE_CLARIFICATION_REQUESTED`, `RESPONSE_CLARIFICATION_ASKED`,
  `RESPONSE_CLARIFICATION_ANSWERED`, `RESPONSE_READY_FOR_EVALUATION` and
  `RESPONSE_WITHDRAWN` — the same reasoning as D73. A supplier's submission,
  withdrawal and clarification answer are recorded with the **supplier's**
  user as `actor_id`.

- `vendor_notifications.response_id` — nullable, cascading, indexed on the
  non-null predicate. The counterpart of Milestone 7's `invitation_id`, for
  the same reason: "is this notification about this response" is not a
  question a URL string answers (D74).

`READY_FOR_EVALUATION` records that a response is complete enough to be
assessed and nothing more — no score, no rank, no comparison. The evaluation
entities are Milestone 9's, below.

## Evaluation and Decision (Milestone 9)

Added by `apps/api/migrations/010_evaluation.sql`. Six new tables, six new
enums, six new labels on `work_package_history_action`. The
`READY_FOR_EVALUATION` response from Milestone 8 is the seam and was not
changed: no column was added to `work_package_responses` and no response
status was added, because an assessment is not a property of the submission.

- `work_package_evaluation_configs` — what responses to one work package are
  scored on, **one row per work package** (unique on `work_package_id`), for
  the same reason there is one response configuration: suppliers who are
  compared have to be compared on the same criteria (D86). Carries `status`
  (`DRAFT` / `READY`), `criteria_version` (bumped on every saved change),
  `title`, `notes`, and the configuring and last-updating actors. Only a
  `READY` configuration can be run, which is what stops a half-weighted
  criteria set producing a ranking somebody reads as final.

- `work_package_evaluation_criteria` — the criteria themselves, one row each.
  `criterion_key` (a stable slug carried into the stored score rows so a result
  stays readable without a join), `criterion_type`, `direction`, `label`,
  `description`, `weight`, an optional `target_value` (a budget ceiling, a
  maximum duration, a minimum team size), an optional `question_id` and
  `display_order`. A table rather than a jsonb array on the configuration,
  because a `CUSTOM` criterion points at one of the department's own response
  questions and a foreign key is what stops it pointing at a question on
  another work package's form. A CHECK ties `question_id` to exactly the
  `CUSTOM` type. Weights must sum to 100 — not expressible row by row, so it is
  validated on write and again before a run, and the run's snapshot records
  what was actually applied.

- `evaluation_criterion_type` — `PRICE`, `TIMELINE`, `CAPACITY`, `COMPLIANCE`,
  `EXPERIENCE`, `TECHNICAL`, `REQUIREMENT_COMPLIANCE`, `CUSTOM`. The type is
  not decoration: it decides which stored field the deterministic scorer reads
  and which response section must be switched on for the criterion to be
  answerable at all. That pairing is what makes the internal-consistency check
  possible — a department cannot score suppliers on a price it never asked any
  of them to quote.

- `work_package_evaluation_runs` — one deterministic pass over the responses,
  the counterpart of `work_package_match_runs` (D68) for responses rather than
  suppliers, and for the same reason. Carries `config_id` (`ON DELETE SET
  NULL`, so deleting a configuration cannot destroy the record of what ran
  under it), `scoring_version`, `criteria_version`, a **`criteria_snapshot`**
  jsonb holding the exact criteria applied, a `request_snapshot` jsonb holding
  the response type, the section modes, the deadline, the confirmed
  requirements and the resolved thresholds, plus the counts and the requesting
  actor. Runs accumulate and are never updated: re-evaluating after a
  resubmission adds a record rather than destroying the one a decision may
  already cite (D87).

- `work_package_evaluation_results` — one row per assessed response per run,
  unique on `(run_id, response_id)`. `ranked` and `rank_position` (a CHECK ties
  them together), `total_score` as `numeric(6,2)`, and jsonb columns holding
  `criterion_scores` (per criterion: score, weight, weighted contribution,
  method, the basis sentence, and the evidence lines it was read from),
  `compliance` (one entry per confirmed requirement), `compliance_summary`,
  `missing_information`, `strengths`, `gaps`, and a `structured_summary` of the
  facts the comparison lays side by side. A response that could not be ranked
  is stored too, with `exclusion_reason` and a CHECK requiring one — a
  department is entitled to ask which submissions were not assessed and why,
  the rule D68 established for the matching gate.

- `work_package_response_ai_analyses` — the advisory reading of one response.
  Deliberately a **separate table with no score column of any kind**, and no
  reference from any score to any row in it: "the model quietly moved a score"
  is not a failure this schema can express (D89). Carries `summary`,
  `technical_fit`, `experience_relevance`, `strengths`, `weaknesses`,
  `attention_points`, an `evidence` jsonb of section-and-quote pairs, the
  provider, model, prompt version and response time, the generating actor, and
  an optional `evaluation_run_id` for context only. Append-only: a regeneration
  is a new row, so "what AI analysis was generated" has a complete answer
  rather than a latest one.

- `work_package_response_decisions` — the human decision, and the only place in
  this system where a supplier is chosen. One row per decision rather than one
  per work package: an official selects one supplier and may separately record
  why each of the others was rejected, and both need an actor, a moment and a
  **mandatory** `reason` (`NOT NULL`, with a non-empty CHECK). Carries
  `decision` (`SELECTED` / `REJECTED`), `status` (`ACTIVE` / `REVOKED`), the
  `evaluation_run_id` the official was looking at, and `rank_at_decision` /
  `score_at_decision` read server-side from the stored result rather than
  accepted from the request — the rule D69 set for shortlists, applied to the
  decision that matters most (D90).

  Two partial unique indexes do the enforcing: one live decision per response,
  and **at most one live `SELECTED` per work package**. A decision is
  immutable; correcting one is a revocation (`revoked_by`, `revoked_at`,
  `revocation_reason`, itself required by a CHECK) that leaves the original row
  and its reason in place, plus a new decision. An `UPDATE` would erase what
  the department first decided, which is the record an auditor is looking for.

- `work_package_history_action` gains `EVALUATION_CONFIGURED`,
  `EVALUATION_RUN`, `EVALUATION_AI_ANALYSIS`, `VENDOR_SELECTED`,
  `VENDOR_REJECTED` and `DECISION_REVOKED` — the same reasoning as D73. The run
  entry carries the ranking that was shown; the decision entry carries the
  official's reason.

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

- **Reusable** evaluation criteria templates across work packages. Milestone 9
  builds criteria **per work package** (`work_package_evaluation_configs` /
  `work_package_evaluation_criteria`) with served presets per response type; an
  organisation-level template library is not modelled, and was not needed to
  make one procurement evaluable.
- Whether an unverified vendor's embeddings/matching data are generated and
  stored before verification, or only after.
- Whether the traceability mechanism in
  [AI Suggestions vs. Confirmed State](#ai-suggestions-vs-confirmed-state)
  needs anything further for response evaluation. Milestone 9 answered it the
  way matching did and then went further: the deterministic result and the AI
  reading live in **different tables**, the AI table has no score column of any
  kind, and a decision cites the run it was taken from. For matching the
  question was already answered, and neither the requirements (D28) nor the work-package pattern
  was the answer: matching produces a *ranking over existing data* rather
  than *new suggested data*, so the mechanism is run provenance (D68) plus a
  shortlist entry that records the official's own act and the run it was
  taken from (D69). Milestone 7 extended the same idea to engagement without
  changing it: an invitation carries the shortlist entry it came from, and
  every shortlist and invitation act is written to `work_package_history`
  (D73). Whether this generalises to evaluating submitted responses is
  untested.
- Retention policy for evaluation and matching runs. Every run is kept and
  nothing prunes them; the workspace reads the newest and the audit reads them
  all, which is correct but unbounded.
- Vendor Memberships / Representatives (multiple staff per vendor
  organization). More pressing again: `work_package_invitations` records
  `responded_by` and `work_package_responses` records `submitted_by`, so both
  are attributable to a named person, but a vendor organization still has
  exactly one user account to name.

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
