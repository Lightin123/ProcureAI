# Database Design

**Status:** Substantially implemented through Milestone 5, in progress on
Milestone 6. Migration `001_init.sql` (Milestone 2) created `organizations`,
`users`, and `procurement_projects`; `002_requirement_analysis.sql`
(Milestone 3) added requirement/clarification tracking;
`003_work_packages.sql` (Milestone 4) added work-package decomposition and
review; `004_authentication.sql` (Milestone 5) added real credentials,
sessions, and roles; `005_vendor_profiles.sql` (Milestone 6) added the
vendor capability profile, portfolio, document, opportunity-engagement, and
notification tables. Vendor **matching** (Eligibility Criteria, Candidate
Evaluations, Evaluation Runs, and the embeddings/pgvector schema below)
remains conceptual and undesigned — see
[../ai/vendor-discovery.md](../ai/vendor-discovery.md).

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
- The pgvector extension will be used for embeddings-based semantic search.
  It is **not enabled yet**. It is now the immediate next priority (see
  [../development-roadmap.md](../development-roadmap.md) Milestone 6, "Next
  Phase"), not a later-milestone concern as previously framed here.
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

Added in Milestone 6, so far (`apps/api/migrations/005_vendor_profiles.sql`):

- `vendor_profiles` — one row per vendor organization: onboarding status
  and verification state; organisation details, business classification,
  capability narrative and structured tags, capacity, experience, and
  innovation-profile columns collected across the onboarding sections;
  completion tracking; and a derived `capability_document` (natural-
  language) plus `capability_keywords` (normalized array), rebuilt on every
  write — the artifact semantic search will embed once
  [../ai/rag-and-semantic-search.md](../ai/rag-and-semantic-search.md) is
  implemented.
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

Not yet added: any table for eligibility criteria, candidate evaluations,
evaluation/recommendation runs, or vendor capability embeddings — these
remain in [Conceptual Data Areas](#conceptual-data-areas-not-yet-designed-in-detail)
below, now narrowed to specifically the matching/evaluation layer rather
than vendors in general.

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
  capability document/keywords described above. The **embeddings** used for
  semantic search are not yet part of this table — see
  [Embeddings / Vector Search](#embeddings--vector-search-planned) below.
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

### Evaluation and Recommendations

- **Evaluation Criteria / Templates** — reusable definitions of evaluation
  criteria (e.g. name, description, scoring approach, weight) that can be
  applied across projects or work packages, rather than being redefined
  each time. Supports FR7.7's deterministic-vs-AI-assisted split (see
  [../product/requirements.md](../product/requirements.md)).
- **Candidate Evaluations / Criterion Results** — a per-candidate evaluation
  record, decomposed into individual criterion results (score,
  rationale/evidence, deterministic vs. AI-assisted), which aggregate into
  an overall evaluation for that candidate.
- **Evaluation / Recommendation Runs** — a specific execution of evaluation
  and ranking against a defined set of inputs (candidates), criteria, and
  weights. Runs exist so that evaluation results are traceable and
  reproducible, and so that different runs can be compared, rather than a
  new evaluation silently overwriting the previous one. See
  [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md).
- **Rankings / Recommendations** — the derived, explainable output of a
  specific Evaluation / Recommendation Run.

## Embeddings / Vector Search (Planned)

- Vendor Organization capability data (and possibly requirement text) will
  be embedded and stored using pgvector for similarity search.
- Embedding generation is owned by the AI service; the resulting vectors are
  persisted by the Express backend.
- Specific embedding model, dimensionality, and indexing strategy (e.g.
  IVFFlat vs. HNSW) are **unresolved**.

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

- Detailed table/column schema for eligibility criteria, candidate
  evaluations, and evaluation/recommendation runs (Milestone 6 next phase
  and Milestone 9) — see
  [../ai/vendor-discovery.md](../ai/vendor-discovery.md) and
  [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md).
- Embedding storage schema: dimensionality, indexing strategy (IVFFlat vs.
  HNSW), and whether embeddings live on `vendor_profiles` directly or in a
  separate table — see
  [Embeddings / Vector Search](#embeddings--vector-search-planned).
- Whether an unverified vendor's embeddings/matching data are generated and
  stored before verification, or only after.
- The specific mechanism used to satisfy traceability in
  [AI Suggestions vs. Confirmed State](#ai-suggestions-vs-confirmed-state)
  for vendor matching and evaluation specifically — the requirements (D28)
  and work-package patterns exist as precedent but have not been confirmed
  as the right fit for matching, which produces a *ranking over existing
  data* rather than *new suggested data* in the same sense.
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
