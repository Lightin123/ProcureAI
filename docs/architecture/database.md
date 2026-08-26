# Database Design

**Status:** Planned / conceptual only. No schema, migrations, or ORM have
been implemented. PostgreSQL integration is explicitly out of scope until
requested — see [../product/hackathon-scope.md](../product/hackathon-scope.md).

This document maps the conceptual data areas implied by the product
requirements and architecture. It intentionally does **not** define table
names, columns, relationships, SQL, migrations, or an ORM/model layer — that
level of detail is deferred until PostgreSQL integration is actually
requested.

## Confirmed Decisions

- PostgreSQL is the system of record.
- The pgvector extension will be used for embeddings-based semantic search.
- The Express backend (`apps/api`) is the only component with direct
  database access.

## Conceptual Data Areas (Not Yet Designed in Detail)

Grouped by concern below. This is a scope map, not a schema — no table or
column design should be inferred from the grouping or ordering.

### Identity and Organizational Scope

- **Users** — accounts across all roles (see
  [../product/users-and-roles.md](../product/users-and-roles.md)).
- **Organizations / Departments** — the government organizational or
  departmental scope that users and procurement projects belong to.
  Procurement projects are not free-floating — they exist within an
  organization/department's scope, and oversight roles (e.g. Government
  Administrator) act at this scope.
- **Organization Memberships** — the relationship between a user, an
  organization/department, their role within it, and the authorization
  scope that relationship grants. Kept distinct from a global "role" concept
  since a user's effective permissions may depend on which organization the
  data belongs to (relevant to the open question about Government
  Administrator vs. Procurement Administrator in
  [../product/users-and-roles.md](../product/users-and-roles.md)).

### Procurement Core

- **Procurement Projects** — top-level entity an official creates, scoped to
  an organization/department; holds problem description and current
  workflow stage.
- **Requirements** — structured requirements extracted from a project's
  problem description, including AI-suggested vs. official-approved state
  (see [AI Suggestion vs. Confirmed State](#ai-suggestions-vs-confirmed-state)).
- **Clarification Questions / Answers** — generated questions and official
  responses tied to a project.
- **Work Packages / Solution Components** — divisions of a project's
  structured requirements into procurable units, per
  [../product/requirements.md](../product/requirements.md) FR3.

### Vendors

- **Vendor Organizations** — the startup/vendor entity actually being
  discovered and evaluated: capability data, sector/size/location metadata,
  and the embeddings used for semantic search. This is the organization's
  profile, not an individual user account.
- **Vendor Memberships / Representatives** — individual user accounts that
  act on behalf of a Vendor Organization (e.g. submitting RFI responses).
  Kept distinct from Vendor Organizations for the same reason Users are kept
  distinct from Organizations above: a vendor's capability profile is not
  the same concept as the people authorized to act for it.

### Documents

- **Submissions / Responses** — a vendor organization's response to a work
  package's RFI/proposal request; links a Vendor Organization, a Work
  Package, and the set of Documents provided.
- **Documents** — first-class metadata records for uploaded files:
  filename, type, owning entity (e.g. a Submission, a Vendor Organization
  profile), storage reference (see
  [architecture.md](architecture.md#file--object-storage-conceptual)), and
  processing status. Documents conceptually store metadata and a storage
  reference — not large file content — in PostgreSQL.
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

A single status column (e.g. `suggested` / `approved` / `rejected`) is
**not assumed to be sufficient** for every case — some domains may need it,
others may need separate suggestion vs. confirmed entities, or a versioned
record of edits between suggestion and approval. Which approach fits which
data area (status-based, separate-entity, or version-based) is a per-domain
design decision to be made when each area is actually implemented, not a
single global pattern decided here.

## Explicitly Not Yet Decided

- Whether an ORM (e.g. Prisma) or raw SQL/query builder will be used.
- Migration tooling and strategy.
- Detailed table/column schema for any of the conceptual areas above.
- Indexing strategy beyond the general intent to use pgvector.
- The exact organization/department scoping model (e.g. strict hierarchy vs.
  flat, single-org-per-user vs. multi-org membership).
- How Organization Memberships and the global role model in
  [../product/users-and-roles.md](../product/users-and-roles.md) relate —
  whether roles are always org-scoped or some are global.
- The specific mechanism used to satisfy traceability in
  [AI Suggestions vs. Confirmed State](#ai-suggestions-vs-confirmed-state)
  per data area.
- Retention and comparison UX for multiple Evaluation / Recommendation Runs.

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
