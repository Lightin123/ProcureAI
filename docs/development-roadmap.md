# Development Roadmap

**Status:** Milestones 0 through 6 are complete. Milestone 6 (Vendor
Ecosystem) delivered vendor onboarding, profiles, verification, the vendor
portal, opportunity-level matching, and — in its second half — work-package-
level hybrid matching with deterministic eligibility, pgvector semantic
retrieval, multi-factor ranking, explainable recommendations, side-by-side
comparison, and a minimal shortlist seam. Milestones 7 onward are planned
sequencing only.

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

## Milestone 6 — Vendor Ecosystem (Complete)

Goal, in full: take a vendor from public registration through a verified,
matchable capability profile, and match that profile against government
procurement work packages. Delivered in two halves — **vendor onboarding and
opportunity-level matching**, then **work-package-level hybrid matching**.
Both are built.

### Completed — first half (vendor onboarding and the vendor portal)

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
      artifact the second half's embeddings consume (see
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

Migration `005_vendor_profiles.sql`. This half delivered a vendor-facing
precursor to FR4 rather than FR4 itself: FR4 is specified at work-package
granularity with semantic search, and this matching is project-level and
lexical. It remains in place — it is what a *vendor* sees in their portal.

### Completed — second half (work package to vendor matching)

The first half answered *"which published opportunities look relevant to this
vendor"* — project-level, lexical, and the same answer regardless of which
work package within a project a vendor is actually suited to. This half
answers the question the product exists to answer: *"for this specific
confirmed work package, which eligible vendors are the best fit, ranked and
explained."*

```
CONFIRMED WORK PACKAGE
        |
        v
Requirement Normalization            normalization.ts
        |
        v
Hybrid Candidate Retrieval           retrieval.ts
   +---------------+----------------+
   v                                v
Lexical Search                Semantic Search (pgvector / HNSW)
   |                                |
   +---------------+----------------+
                    v
        Deduplicated Candidate Pool
                    |
                    v
     Deterministic Eligibility Gate  eligibility.ts    (hard gate, not a score)
                    |
                    v
          Multi-Factor Ranking       ranking.ts        (deterministic, 7 dims)
                    |
                    v
       Explainable Recommendations
                    |
                    v
       Government Human Review       the official decides
```

- [x] **Work-package-level matching.** A project's packages are matched
      independently and produce different rankings — verified in the seeded
      demonstration project, where four confirmed packages in one project
      each recommend a different supplier.
- [x] **Deterministic eligibility as a distinct pre-ranking gate** (D63):
      profile assessability, verification state, mandatory certifications,
      credential validity, delivery region, and contract-value ceiling. Each
      check reports the requirement it enforces and the evidence it was
      judged on. A dimension the package does not constrain produces no
      check at all. A supplier who fails is excluded, never merely ranked
      lower.
- [x] **pgvector integration** (migrations `006_work_package_matching.sql`
      and `007_semantic_embeddings.sql`), with vendor capability embeddings
      and work-package embeddings stored in 384-dimension vector columns
      behind an HNSW cosine index (D65). pgvector is optional: without it,
      matching degrades to lexical-only with a visible warning (D64).
- [x] **Embedding service boundary** in the AI service
      (`POST /internal/v1/embeddings`), configured independently of the
      analysis provider (D66). The default is `BAAI/bge-small-en-v1.5`, a real
      sentence encoder running locally on CPU with no API key (D70); the
      deterministic concept model is the offline fallback, and hosted
      embeddings are opt-in.
- [x] **Semantic documents** (D71): what gets embedded is the
      capability-bearing prose alone, on both sides. Measured on the seeded
      registry, this moved the intended supplier from top-1 on three of four
      packages to top-1 on all four, and widened the gap between an intended
      match and an unrelated one.
- [x] **Per-model similarity calibration** (D72): retrieval threshold and
      score scale are measured per embedding model, because cosine is not
      comparable between them.
- [x] **Semantic candidate retrieval** over stored embeddings, with a
      minimum similarity threshold so "found semantically" means genuinely
      close rather than merely closest.
- [x] **Hybrid retrieval**: lexical and semantic run independently and are
      unioned and deduplicated; each candidate records which halves found it,
      so a supplier a keyword search could not have surfaced is visible as
      such in the portal.
- [x] **Multi-factor ranking** with seven individually-inspectable
      dimensions — capability fit (25), semantic relevance (20), relevant
      experience (18), capacity and delivery (12), geographic fit (10),
      compliance and credentials (9), verification and credibility (6).
      Fully deterministic; no model decides a score or a position.
- [x] **Explainable recommendations**: per-dimension scores with their
      reasoning, matched and missing capability terms, relevant past
      projects, credentials, strengths, gaps, and a written summary — every
      line derived from a stored value, never authored by a model.
- [x] **Government matching UI** at
      `projects/:id/work-packages/:workPackageId/suppliers`, reached from a
      "Find Suitable Vendors" action shown only on confirmed packages.
      Includes the ranked list, an inspectable excluded-suppliers section,
      a supplier detail view scoped to the package, and side-by-side
      comparison of up to four suppliers.
- [x] **Provenance**: every run stores its strategy, normalization,
      eligibility and ranking versions, its weights, its embedding model, and
      its per-supplier results — including the suppliers it excluded and why
      (D68).
- [x] **Shortlist seam** for Milestone 7 (D69): a minimal
      `work_package_shortlist` table with add/remove endpoints, the rank and
      score read server-side from the stored run rather than accepted from
      the browser. Invitation and everything downstream was not built here —
      it is Milestone 7, which builds on this table unchanged.

Migration `006_work_package_matching.sql`. Delivers FR4.1, FR4.2 and FR4.3.

Not built in this milestone, and deliberately deferred: vendor invitation and
the engagement workflow around the shortlist (**built in Milestone 7**), and
vendor gap analysis (Milestone 10).

## Milestone 7 — Vendor Shortlisting and Engagement (Complete)

Goal: let an official act on ranked recommendations rather than only view
them, and let the supplier answer.

    confirmed work package
      -> ranked, eligible suppliers      (Milestone 6)
      -> compare, inspect
      -> shortlist, with a recorded reason
      -> invitation
      -> supplier notification
      -> supplier accepts or declines
      -> Milestone 8's structured response

- [x] **Recommendation review** — already delivered by Milestone 6's second
      half and unchanged here: the ranked list, all seven dimensions with
      their reasoning, lexical/semantic retrieval evidence, the eligibility
      result with its individual checks, matched and missing capability
      terms, verification state, relevant experience, credentials, capacity
      and geographic coverage.
- [x] **Side-by-side comparison** of up to four suppliers, extended in this
      milestone with capability coverage, relevant experience, credentials,
      geographic coverage, profile completion, per-supplier matched and
      missing capability terms, and the exclusion ground for any supplier
      the gate refused.
- [x] **Work-package shortlist**, built on Milestone 6's seam (D69): add
      with a mandatory recorded reason, remove, and view — per work package
      and never per project, so shortlisting a supplier for WP-02 says
      nothing about WP-01. An ineligible supplier is refused by the API, not
      merely by a disabled button.
- [x] **Shortlist auditability** (D73): every add and remove is written to
      `work_package_history` with the acting official, the action, the
      reason and the timestamp, alongside the decisions that produced the
      package itself.
- [x] **Invitation** of a shortlisted supplier, carrying the work package,
      the issuing department and official, an optional response deadline,
      optional written instructions, and a status. Three preconditions are
      enforced server-side: the package is in the caller's organization, the
      package is `CONFIRMED`, and the supplier is on *this* package's
      shortlist. Eligibility is enforced transitively through the shortlist
      rather than re-checked, so there is one definition of the gate.
- [x] **Invitation lifecycle** (D75): `INVITED -> ACCEPTED | DECLINED |
      WITHDRAWN`, enforced by a conditional `UPDATE`, with a partial unique
      index permitting one live invitation per supplier per package. No
      `EXPIRED` state — expiry would need a background job, which this
      system does not have (D30); a passed deadline is derived at read time.
- [x] **Supplier notification** (D74), written into the existing
      `vendor_notifications` table in the same request that creates the
      invitation. A bell in the portal header carries the unread count and
      the recent list; opening a notification marks that one read and
      navigates to the invitation it is about.
- [x] **Supplier invitation portal** at `/vendor/invitations` and
      `/vendor/invitations/:id`: the department, the project, the work
      package with its scope and deliverables, the deadline, the official's
      instructions, and accept/decline. Declining requires a stated reason.
- [x] **Government invitation tracking** on the matching page: every
      invitation on the package, its status, who issued it and when, the
      deadline, the response and its timestamp, and the supplier's note.
- [x] **Strict separation of the two sides** (D76): the supplier's view is a
      different query in a different router, and carries no rank, score,
      dimension breakdown, eligibility verdict, shortlist reason or any
      other supplier.
- [x] **RBAC**: `vendor:invitation:manage` for `GOVERNMENT_OFFICIAL`;
      `vendor:invitation:read` and `vendor:invitation:respond` for `VENDOR`.
      `ADMIN` gains neither — oversight reads a ranking but takes no
      procurement decision (D48, D60, D69).

Migration `008_vendor_engagement.sql`. Delivers FR4.4 and supports FR11.1's
requirement that *why* a decision was taken is auditable, not only *what*.

Verified by `apps/api/tests/engagement.integration.test.ts` — 41 tests over
HTTP covering the whole flow and, mostly, the requests that must be refused:
cross-organization access, cross-supplier access, an ineligible supplier, a
non-shortlisted supplier, an unconfirmed package, a duplicate invitation, a
second response, a withdrawal of an accepted invitation, and an
administrator attempting a procurement act.

`npx tsx scripts/engagementDemo.ts` puts one seeded work package into the
shortlisted-and-invited state so the supplier side of a demonstration has
something to open.

Not built, and deliberately left to Milestone 8: the structured response
itself. Accepting an invitation registers intent to respond; it is not a
proposal, a quotation or a commitment to supply.

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
  matching in Milestone 6's second half.

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
6's second half) is in production, not before.

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
