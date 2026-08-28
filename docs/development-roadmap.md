# Development Roadmap

**Status:** Milestones 0 through 5 are complete. Milestone 6 (Vendor
Ecosystem) is in progress: vendor onboarding, profiles, verification, the
vendor portal, and opportunity-level matching are implemented; work-package-
level hybrid matching is the current development priority. Milestones 7
onward are planned sequencing only.

## Milestone 0 — Documentation Foundation (Complete)

Establish `docs/`, `README.md`, and `CLAUDE.md` so architecture, product,
and process decisions are recorded before implementation begins.

## Milestone 1 — Project Foundation (Complete)

```
React Frontend -> Express Backend -> GET /health -> Frontend displays backend connection status
```

- [x] Scaffold `apps/web` (React + TypeScript + Vite).
- [x] Scaffold `apps/api` (Node.js + Express + TypeScript).
- [x] Implement a single `GET /health` endpoint.
- [x] Frontend calls `/health` and displays connection status.
- [x] No auth, no database, no AI service involvement.

## Milestone 2 — Procurement Project Skeleton (Complete)

```
Create / list / view procurement projects, persisted in PostgreSQL
```

- [x] PostgreSQL integration via `pg` with plain SQL migrations (D20);
      hosted development database (D19).
- [x] Initial schema: `organizations`, `users`, `procurement_projects`
      (see [architecture/database.md](architecture/database.md)).
- [x] Nine-state project workflow enum defined (D22); projects created in
      `DRAFT`.
- [x] `GET /api/v1/projects`, `GET /api/v1/projects/:id`,
      `POST /api/v1/projects` with `zod` validation.
- [x] Frontend routing plus Projects list, detail, and create screens.
- [x] `GET /health` extended to report database connectivity.

## Milestone 3 — AI Requirement Analysis (Complete)

```
Run AI analysis -> review suggestions -> answer clarifications -> confirm requirements
```

- [x] `apps/ai-service` (FastAPI + Pydantic, venv + requirements.txt).
- [x] Requirement extraction, constraint identification, missing-information
      detection, and clarification-question generation, called from `apps/api`.
- [x] Anthropic provider, an OpenAI-compatible provider (Groq et al.), and a
      deterministic stub provider so the platform runs without an API key
      (D27, D38, D41).
- [x] Structured requirements review UI: accept, edit, reject-with-reason,
      add manually, answer clarifications, confirm, reopen.
- [x] `project_stage_history` records every workflow transition.

Delivers FR2.1–FR2.6. Analysis runs synchronously (D30); no background job
infrastructure was introduced.

## Milestone 4 — Work Packages (Complete)

```
Confirmed requirements -> AI work package decomposition -> review, edit, merge, split -> confirm
```

- [x] `apps/ai-service` decomposes confirmed requirements into suggested
      work packages (title, description, scope, deliverables, dependencies,
      complexity, priority, estimated procurement category, AI reasoning,
      confidence score), with a deterministic stub fallback.
- [x] Full review surface: accept, reject, edit, manually add, duplicate,
      merge multiple packages into one, split one package into several,
      reorder, soft-delete/restore.
- [x] A project can proceed with a single, non-decomposed work package
      where that is the appropriate procurement unit (FR3.3).
- [x] `work_package_analysis_runs` and `work_package_history` give the same
      provenance and audit trail as requirement analysis (extends D28).
- [x] Confirming all packages transitions the project to
      `WORK_PACKAGES_CONFIRMED`.

Delivers FR3.1–FR3.3. Migration `003_work_packages.sql`.

## Milestone 5 — Authentication and RBAC (Complete)

```
Sign in -> session cookie -> role + organization scoped access on every request
```

- [x] Opaque server-side sessions in an `HttpOnly; SameSite=Strict` cookie
      (D44); `scrypt` password hashing (D45).
- [x] Three roles — `GOVERNMENT_OFFICIAL`, `ADMIN`, `VENDOR` — as a
      PostgreSQL enum (D46), with permission-based authorization: routes
      declare a permission via `requirePermission(...)`, and
      `ROLE_PERMISSIONS` in `apps/api/src/auth/permissions.ts` is the single
      role-to-permission mapping (D47).
- [x] Organization-scoped access preserved and made session-derived rather
      than seeded (D49, D53); cross-organization access returns 404, not
      403.
- [x] Route and API protection: `requireAuth` mounted on the `/api/v1`
      prefix so a route added later cannot be left public by omission (D52).
- [x] Role-aware frontend navigation, route guards, and landing redirects.

Delivers FR9 (human-in-the-loop is now attributable to a real identity),
FR10, and FR11.1. Migration `004_authentication.sql`. See
[engineering/security.md](engineering/security.md) and
[product/users-and-roles.md](product/users-and-roles.md).

## Milestone 6 — Vendor Ecosystem (In Progress)

Goal, in full: take a vendor from public registration through a verified,
matchable capability profile, and match that profile against government
procurement opportunities. The milestone is being delivered in two halves —
**vendor onboarding and opportunity-level matching are built**; **work-
package-level hybrid matching is the active development priority.**

### Completed

- [x] Public vendor self-registration (`POST /api/v1/auth/register`) —
      creates a `VENDOR` account, never a government or admin account.
- [x] Progressive, schema-driven onboarding across 8 sections (organisation,
      classification, capabilities, capacity, experience, compliance,
      innovation, plus review), with save-and-resume, a server-computed
      completion percentage, and conditional questions that adapt to the
      vendor's declared industry and solution type (D58).
- [x] A vendor capability taxonomy spanning manufacturing, agriculture,
      construction, infrastructure, logistics, healthcare, education,
      sustainability, hardware, software, professional services, and
      research — not technology-only (D56).
- [x] Repeatable profile entities: products/services offered, past
      experience, credentials/certifications.
- [x] Compliance document upload, storage, and per-document verification
      state (D59).
- [x] Admin-side supplier verification workflow (`vendor:verification:manage`
      permission, deliberately platform-wide rather than organization-scoped
      — D60) and a supplier registry.
- [x] A derived **capability document** (natural-language) and
      **capability keyword set**, rebuilt on every profile write — the
      artifact the next phase's embeddings will consume (see
      [ai/vendor-discovery.md](ai/vendor-discovery.md)).
- [x] Government-side opportunity publication: an official explicitly
      publishes a confirmed project, choosing what summary and which
      *accepted* requirements become visible to vendors (D57) — publication
      is a separate act from confirming requirements internally.
- [x] Vendor-facing opportunity discovery: a vendor portal dashboard, an
      opportunity list and detail view, save-for-later, and interest
      registration (an expression of interest, not a proposal).
- [x] **Deterministic, opportunity-level lexical matching**: every published
      opportunity is scored against every vendor's capability keywords using
      stop-word-filtered term overlap plus declared-industry alignment,
      geographic/delivery fit, and credibility signals — fully explainable
      (matched terms, per-component scores) but **whole-project granularity
      and lexical only**, not per-work-package and not semantic. See
      [ai/vendor-discovery.md](ai/vendor-discovery.md) for exactly what this
      does and does not do today.
- [x] AI-generated capability insights (advisory only — never read back by
      matching, verification, or eligibility).

Migration `005_vendor_profiles.sql`. Delivers a vendor-facing precursor to
FR4, not FR4 itself: FR4 is specified at work-package granularity with
semantic search, and the current matching is project-level and lexical.

### Remaining (Current Priority — see "Next Phase" below)

- [ ] Work-package-level matching (matching a specific work package, not
      the whole project, against vendors).
- [ ] Deterministic eligibility filtering as a distinct pre-ranking gate.
- [ ] pgvector integration and vendor/requirement embeddings.
- [ ] Semantic candidate retrieval.
- [ ] Hybrid (lexical + semantic) matching, replacing lexical-only.
- [ ] Vendor ranking per work package with individually-inspectable
      dimensions.
- [ ] Explainable, package-level recommendations.
- [ ] Government-side vendor comparison and shortlisting UI.
- [ ] Vendor invitation workflow.
- [ ] Vendor gap analysis.

---

## Next Phase — Work Package to Vendor Matching (Immediate Priority)

The system currently answers *"which published opportunities look relevant
to this vendor"* — project-level, lexical, and the same question regardless
of which work package within the project a vendor might actually be suited
to. The next phase answers the question the product is actually meant to
answer: *"for this specific confirmed work package, which eligible vendors
are the best fit, ranked and explained."*

```
Vendor <-> Procurement Project / Opportunity Matching        (current)
                            |
                            v
Work Package <-> Eligible Vendors <-> Ranked Recommendations (next)
```

Full design lives in [ai/vendor-discovery.md](ai/vendor-discovery.md) (the
matching pipeline) and [ai/evaluation-and-ranking.md](ai/evaluation-and-ranking.md)
(ranking and explainability). Summary of the planned pipeline:

```
CONFIRMED WORK PACKAGE
        |
        v
Requirement Normalization
        |
        v
Structured Eligibility Filtering
        |
        v
Hybrid Candidate Retrieval
   +---------------+----------------+
   v                                v
Lexical Search                Semantic Search
   |                                |
   +---------------+----------------+
                    v
              Candidate Pool
                    |
                    v
          Multi-Factor Ranking
                    |
                    v
       Explainable Recommendations
                    |
                    v
       Government Human Review
```

Everything from "Government Human Review" downward (shortlisting,
invitation, response collection, evaluation, final decision) is described
in the milestones below and is **not** part of this immediate priority — it
depends on this matching layer existing first.

## Milestone 7 — Vendor Shortlisting and Engagement (Planned, Not Detailed)

Goal: let an official act on ranked recommendations rather than only view
them.

- View ranked, explained vendors per work package (built on Milestone 6's
  next phase).
- Compare vendors side by side; inspect a vendor's full profile and match
  explanation from within the comparison.
- Build and maintain a shortlist per work package: add, remove, and record
  a reason for the decision (supports FR11.1 — auditability of *why*, not
  only *what*).
- Invite shortlisted vendors. An invitation is the trigger for Milestone 8;
  it is not itself a commitment.
- AI recommends; the official decides. No automatic vendor selection.

Depends on Milestone 6's next phase (work-package-level ranked
recommendations) existing to act on.

## Milestone 8 — Vendor Response and Proposal Collection (Planned, Not Detailed)

Goal: let an invited vendor respond to a specific work package, and let the
official configure and track that response process.

- Vendor side: receive an invitation, view the relevant work package and
  requirements, ask clarification questions where the procurement type
  allows it, submit an RFI response / expression of interest / proposal /
  quotation as appropriate to the workflow, attach supporting documents,
  and track submission status and deadlines.
- Government side: configure what response is required, set a deadline,
  receive and track submissions, request clarification from a vendor.
- This is a materially different vendor action from the "register interest
  in an opportunity" flow already built in Milestone 6 — that is an
  unstructured signal of interest at project level; this is a structured,
  work-package-scoped, deadline-bound response.

## Milestone 9 — Evaluation and AI-Assisted Decision Support (Planned, Not Detailed)

Goal: turn collected vendor responses into a comparable, explainable basis
for a human decision.

- Structured extraction of key information from vendor submissions
  (document intelligence).
- Requirement-by-requirement comparison across responding vendors;
  compliance checking; missing-information detection.
- Deterministic evaluation scoring wherever criteria are objective (budget,
  timeline, stated compliance); AI-assisted analysis where judgment over
  free text is required (technical fit, experience relevance) — same
  deterministic/AI-assisted split already established for requirement and
  work-package review.
- Side-by-side comparison view with explainable rankings.
- Three distinct, non-conflated layers, carried over from the matching
  design: **AI analysis** identifies and summarizes evidence; **deterministic
  evaluation** applies defined scoring criteria; **the human makes the final
  procurement decision.** AI never independently determines eligibility or
  overrides deterministic scoring — the same trust principle established for
  matching in Milestone 6's next phase.

Delivers FR5, FR6, FR7, FR8, and FR9.2 (final decision recording).

## Milestone 10 — Procurement Intelligence and Analytics (Planned, Not Detailed)

Goal: surface patterns across procurement activity once enough of it has
happened to be worth analyzing. Explicitly a later product-intelligence
phase, not a near-term priority.

- **Vendor gap analysis**, arising directly from Milestone 6's matching
  work: detect when a work package has no or very few eligible vendors,
  when required capabilities are absent across the vendor base, or when
  geographic/certification coverage is insufficient — and recommend a
  response (open targeted vendor registration, clarify or split the
  requirement, consider an alternative procurement approach).
- Government-side reporting: vendor availability and distribution by
  sector, work-package demand by category, frequently-missing
  capabilities, average match quality, time spent per workflow stage,
  invitation-to-response conversion, verification throughput.

## Milestone 11 — Advanced Semantic Optimization (Planned, Not Detailed)

Goal: improve matching quality after a reliable hybrid baseline (Milestone
6's next phase) is in production, not before.

- Domain-specific embeddings, procurement vocabulary normalization,
  synonym expansion, industry taxonomies.
- Query expansion; reranking models; hybrid lexical/vector retrieval tuning.
- Learning from human shortlist and selection/rejection decisions —
  explicitly a feedback loop on top of the deterministic baseline, not a
  replacement for it.
- Evaluation datasets for measuring matching quality over time.
- **Multi-package and vendor allocation** — extending single-package
  matching to project-wide allocation: one vendor serving multiple
  packages, capacity limits across concurrent engagements, minimizing
  vendor count vs. preferring specialists, package dependencies. The
  architecture should support both *best vendor per package* and *best
  overall allocation across a project*, but allocation optimization is
  built on top of reliable per-package matching, not before it exists.

---

## Running It Locally

Three processes, from the repository root:

```
cd apps/ai-service && .venv/Scripts/python -m uvicorn app.main:app --port 8000
cd apps/api && npm install && npm run migrate && npm run seed && npm run dev
cd apps/web && npm install && npm run dev
```

`npm run seed` provisions demo accounts across all three roles and a set of
seeded suppliers spanning multiple industries with published procurement
opportunities to match against — see
[product/users-and-roles.md](product/users-and-roles.md) for the account
list.

## Notes

- Sequencing follows the core system flow in
  [product/problem-statement.md](product/problem-statement.md), with one
  deliberate departure: authentication and RBAC were moved ahead of vendor
  work (D43). Vendor representatives need real accounts, so building vendor
  onboarding before authentication would have required throwaway scaffolding.
- Within Milestone 6, vendor onboarding was built before work-package-level
  matching for the same reason matching needs vendors to exist first: there
  is nothing to match against without a populated, verified vendor base.
- Each milestone must leave the project runnable, per
  [engineering/development-workflow.md](engineering/development-workflow.md).
- Milestones beyond the current one are not scheduled and should be
  re-scoped against [product/hackathon-scope.md](product/hackathon-scope.md)
  as the hackathon timeline becomes clearer.

## Related Documents

- [product/hackathon-scope.md](product/hackathon-scope.md)
- [product/requirements.md](product/requirements.md)
- [architecture/architecture.md](architecture/architecture.md)
- [ai/vendor-discovery.md](ai/vendor-discovery.md)
- [ai/rag-and-semantic-search.md](ai/rag-and-semantic-search.md)
- [ai/evaluation-and-ranking.md](ai/evaluation-and-ranking.md)
