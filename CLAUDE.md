# ProcureAI — SIH26136 Procurement Platform

AI-assisted government procurement planning and vendor discovery platform,
built for Smart India Hackathon 2026. Full specifications live in `docs/` —
that directory is the source of truth. This file holds only the essential,
durable coding instructions. **Do not duplicate detailed specs here; update
the relevant file in `docs/` instead and link to it.**

Start here: [README.md](README.md) has the full documentation index.

## Project Essentials

- Problem statement: [docs/product/problem-statement.md](docs/product/problem-statement.md)
- Product vision & principles: [docs/product/product.md](docs/product/product.md)
- The system is a **decision-support** platform. AI never makes a binding
  procurement decision; a human official always does.

## Technology Stack

See [docs/architecture/technology-stack.md](docs/architecture/technology-stack.md).

- Frontend: React + TypeScript + Vite (`apps/web`)
- Backend: Node.js + Express.js + TypeScript (`apps/api`)
- AI Service: Python + FastAPI + Pydantic (`apps/ai-service`)
- Database: PostgreSQL + pgvector
- Local development, no Docker, no monorepo tooling (no Turborepo/Nx)

## Architecture Rules

Full detail: [docs/architecture/architecture.md](docs/architecture/architecture.md).

- `apps/web` -> `apps/api` -> (`PostgreSQL` and `apps/ai-service`). The
  frontend never calls the AI service or database directly.
- `apps/web` and `apps/api` are independent projects, not a shared build
  pipeline.
- Do not introduce microservices or additional services without a clear
  technical reason.
- Do not introduce multi-agent AI architecture unless a specific capability
  justifies it — see [docs/ai/ai-agents.md](docs/ai/ai-agents.md).
- AI output must always be structured and validated (Pydantic on the AI
  service side). Never treat raw LLM output as source of truth.

## Current Development Stage

Milestones 1 through 8 are complete, including work-package-level hybrid
matching, vendor engagement and structured response collection. **Milestone 9
(evaluation and AI-assisted decision support) is complete.**
Full status: [docs/product/hackathon-scope.md](docs/product/hackathon-scope.md)
and [docs/development-roadmap.md](docs/development-roadmap.md).

Implemented: React portal + Express API + PostgreSQL with pgvector + FastAPI
AI service. Officials sign in, create projects, run AI requirement analysis,
review and edit suggestions, answer clarifications, confirm requirements,
generate and review AI work packages, and confirm them. Vendors self-register,
complete a progressive onboarding, get verified by an administrator, and
discover published opportunities matched against their profile. For a
**confirmed work package**, an official runs supplier matching and receives a
ranked, explainable list of eligible suppliers, can inspect who was excluded
and on what ground, compare suppliers side by side, shortlist them with a
recorded reason, and invite the shortlisted ones. The supplier is notified in
its own portal, opens the invitation, and accepts or declines. The official
then configures what response the work package requires, opens it to the
suppliers that accepted, and tracks what comes back; the supplier drafts that
response over several sittings, answers each confirmed requirement, attaches
documents, reviews and submits it. Either side can raise a clarification, and
the official moves a submitted response through review to
`READY_FOR_EVALUATION`. From there the official configures weighted evaluation
criteria, runs a deterministic evaluation over the ready responses, reads an
explainable ranking with the basis and evidence behind every score, compares
suppliers side by side and requirement by requirement, optionally asks for an
advisory AI reading of each response, and records a selection or a rejection
with a mandatory reason — the only act in the system that chooses a supplier.

**Work-package vendor matching (`apps/api/src/matching/`).** Five stages, in
separate modules, which must not be merged (D63):

    confirmed work package
      -> normalization        (normalization.ts)
      -> hybrid retrieval     (retrieval.ts)    — lexical + semantic, unioned
      -> candidate pool                         — deduplicated
      -> eligibility gate     (eligibility.ts)  — hard filter, never a score
      -> multi-factor ranking (ranking.ts)      — eligible only, 7 dimensions
      -> explanations                           — from stored data only

The gate sits between retrieval and ranking. It is applied to the candidate
pool rather than to the whole registry because it needs each supplier's full
record, and loading that for every supplier in order to discard most of them
is the scan retrieval exists to avoid. What must never change is that nothing
failing the gate reaches the ranking.

Rules when touching this area:

- Eligibility is a gate, not a weight. A supplier failing a mandatory
  requirement is excluded, never merely ranked lower.
- An absent constraint is not a satisfied one. Never emit a passed check for
  a dimension the work package does not actually constrain.
- Ranking is arithmetic over stored fields. No LLM decides a score or a rank.
- Every explanation line must quote a value read from the database. Never
  assert a capability, credential, engagement or location a supplier has not
  recorded.
- Semantic retrieval is additive. It is never the sole mechanism, and never a
  filter applied on top of the lexical half.
- Embeddings regenerate on a source digest at match time, not on profile write
  (D67), and also when the embedding model changes. pgvector is optional;
  without it the system degrades to lexical-only retrieval (D64).
- What gets embedded is the **semantic document**, not the full capability
  document (D71): capability prose only, no addresses or registration numbers
  on the vendor side, no compliance/budget/timeline clauses on the package
  side. Those are structured data the gate and the ranking read directly.
- The default model is `BAAI/bge-small-en-v1.5`, a real sentence encoder run
  locally on CPU (D70), at **384 dimensions**. The deterministic concept model
  in `apps/ai-service/app/embeddings/concepts.py` is the offline fallback only.
- Similarity thresholds are **per model** (`src/matching/calibration.ts`, D72).
  Cosine is not comparable across models — never hardcode a threshold in
  retrieval or ranking; add a calibrated row instead.

**Vendor engagement (`work_package_invitations`, Milestone 7).** The
shortlist from Milestone 6 is the seam the invitation is built on, and it was
not changed:

    ranked, eligible suppliers
      -> shortlist        (work_package_shortlist)  — per work package, reason required
      -> invitation       (work_package_invitations)
      -> notification     (vendor_notifications)    — same request, no job (D74)
      -> ACCEPTED | DECLINED | WITHDRAWN            — Milestone 8 follows an acceptance

Rules when touching this area:

- Eligibility is enforced **transitively**, through the shortlist. Do not add
  a second eligibility check on the invitation path — a duplicated rule is a
  rule that can drift from the gate.
- Only a supplier on **that work package's** shortlist can be invited, and the
  shortlist row is resolved server-side. Never accept a shortlist id, a
  vendor id or an organization id from a request body as evidence of anything.
- The supplier's view of an invitation is a **different query in a different
  router** (D76). It must never carry a rank, a score, a dimension breakdown,
  an eligibility verdict, a shortlist reason, or any other supplier. Do not
  merge the two sides into one handler with a role flag.
- Every vendor-facing lookup takes `vendorProfileId` from the session and
  applies it in the `WHERE` clause. There is no "find by id" a vendor route
  may call without it.
- State transitions are conditional `UPDATE`s (`WHERE ... AND status =
  'INVITED'`), not read-then-write. This is what makes them single-shot and
  ownership-safe in one statement.
- Shortlist and invitation acts are audited in `work_package_history` (D73),
  not in a parallel table. A supplier's answer is attributed to the
  supplier's own user.
- There is no `EXPIRED` invitation state and no background job. A passed
  deadline is derived at read time (D30, D75).
- A PostgreSQL `date` is converted with `toIsoDay()` from
  `repositories/dates.ts`, never with `toISOString().slice(0, 10)`, which
  shifts the day backwards at IST (D77).

**Vendor responses (`work_package_responses`, Milestone 8).** The accepted
invitation from Milestone 7 is the seam the response is built on, and it was
not changed:

    accepted invitation
      -> response configuration   (work_package_response_configs)  — one per package
      -> custom questions         (work_package_response_questions)
      -> vendor draft             (work_package_responses)         — resumable
      -> requirement answers      (..._requirement_answers)        — one per requirement
      -> question answers         (..._question_answers)
      -> documents                (..._documents)                  — reuses documentStorage
      -> clarifications           (..._clarifications)             — both directions
      -> DRAFT -> SUBMITTED -> UNDER_REVIEW -> READY_FOR_EVALUATION

Rules when touching this area:

- What is being asked for is **one configuration per work package**, not per
  supplier, and it freezes once any supplier has submitted (D78). The deadline
  and the instructions stay editable; the response type and the section modes
  do not.
- The section catalogue lives in `src/responses/schema.ts` and is **served**
  to the frontend (D79). Never write a second copy of it in `apps/web`, and
  never add a section without adding its column.
- Completeness is computed by one function, `responses/completeness.ts`, used
  by both the progress indicator and the submission gate (D80). A submission
  check that does not go through it will drift from what the supplier is shown.
- Every state transition is a conditional `UPDATE` carrying the ownership
  predicate and the permitted source states (D81). Editability is exactly
  `DRAFT` and `CLARIFICATION_REQUESTED`; do not add a handler-level check
  instead. There is no `EXPIRED` state and no background job — a passed
  deadline is derived at read time and enforced at submission.
- A department **cannot read an unsubmitted draft** (D83). Do not relax this
  to "show the official what has been typed so far".
- Clarifications are one table for both directions; `raised_by_side` decides
  who may answer, in SQL (D82). Neither the question nor the answer is
  editable.
- Response attachments are their own table but the bytes go through
  `vendor/documentStorage.ts` (D84). Do not add a second upload path.
- Every vendor-facing lookup takes `vendorProfileId` from the session and
  applies it in the `WHERE` clause. The two sides are different queries in
  different routers (D76, D85) — do not merge them behind a role flag.
- Nothing in this milestone scores, ranks or recommends a response.
  `READY_FOR_EVALUATION` is where Milestone 8 stops.

**Evaluation and decision (`apps/api/src/evaluation/`, Milestone 9).** The
`READY_FOR_EVALUATION` response from Milestone 8 is the seam the evaluation is
built on, and it was not changed:

    responses in READY_FOR_EVALUATION
      -> criteria            (criteria.ts)   — configured, weights sum to 100
      -> thresholds          (signals.ts)    — configured, else from requirements
      -> compliance          (compliance.ts) — one verdict per requirement
      -> scoring             (scoring.ts)    — deterministic, reproducible
      -> ranking             (ranking.ts)    — ordering plus its reasons
      -> run + snapshot                      — never overwritten
      -> human decision                      — reason mandatory

Rules when touching this area:

- The order **AI analysis -> deterministic evaluation -> ranked
  recommendations -> human decision** is the whole trust model. Nothing in
  `src/evaluation/` may import the AI client or read
  `work_package_response_ai_analyses`; nothing may write
  `work_package_response_decisions` except the route an official invokes.
- A score is arithmetic over stored values. No LLM produces, adjusts or
  influences a score, a rank or an ordering. The AI request and response
  schemas carry no score, rank, weight or recommendation field, and the
  analyses table has no score column (D89) — do not add one.
- **Missing information is never compliance** (D88). A stated `MEETS` with no
  substantiating text is `INSUFFICIENT_INFORMATION`, and the supplier's own
  stated position stays visible beside the derived verdict. An absence never
  produces `NON_COMPLIANT`.
- A criterion may only be scored from a response section the department
  actually asked for. `validateCriteria` enforces it on save and again before
  every run; do not add a handler-level check instead.
- Every criterion score carries the sentence explaining how it was reached and
  the evidence lines it was read from, quoted from stored values. Never assert
  a figure, credential or engagement a supplier did not record.
- Scoring must stay reproducible: nothing reads the clock or a random source,
  and the relative criteria are computed over the set of responses stored with
  the run.
- **Runs accumulate; they are never overwritten** (D87). Each carries its own
  `criteria_snapshot`, so changing the criteria cannot alter a score a
  decision already cites.
- **Decisions are immutable.** A correction is a revocation with its own
  reason plus a new decision, never an `UPDATE`. The rank and score stored
  with a decision are read server-side from the cited run, never from the
  request body (D90).
- Eligibility is **read** from the Milestone 6 matching run, never re-derived
  (D92). Do not add a second gate here.
- Every government-facing lookup takes the organization from the session and
  applies it in SQL. No vendor role holds any `evaluation:*` permission, and
  there is no vendor-facing evaluation route — do not add one.

**Authentication and RBAC are implemented (Milestone 5).** When touching the
API, the rules are:

- Identity comes from the session, via `getCurrentUser(request)` in
  `src/auth/currentUser.ts`. Never from a header, body, or query parameter.
  `repositories/currentOfficial.ts` and D21's seeded identity are gone.
- `requireAuth` is mounted on the `/api/v1` prefix in `src/index.ts`, so any
  new route under it is authenticated automatically. **Mount new routers below
  that line.**
- Every route declares `requirePermission("...")`. Do not write
  `if (role === "ADMIN")` in a route — add the permission to
  `ROLE_PERMISSIONS` in `src/auth/permissions.ts` instead.
- Organization scoping stays in SQL, taking the organization from
  `request.user`. Cross-organization access returns 404, not 403.
- Never return a password hash, and never add a `SELECT *`.

See [docs/engineering/security.md](docs/engineering/security.md) and
[docs/product/users-and-roles.md](docs/product/users-and-roles.md).

**Do not implement** until explicitly requested:
- Document intelligence — parsing or extracting structure from the *contents*
  of an uploaded attachment. Milestone 9 reads the structured fields and the
  written answers a supplier submitted, and passes attachment **titles** only
  to the AI service, which is told not to assume anything about their contents.
- Vendor gap analysis, procurement analytics, organization-wide intelligence
  dashboards — Milestone 10
- Advanced semantic optimization (learned ranking, query expansion,
  reranking), learning from recorded human decisions, model fine-tuning, and
  automatic allocation of vendors across several work packages — Milestone 11.
  Milestone 9 records selections and rejections and deliberately learns
  nothing from them.
- Workflow transitions beyond `WORK_PACKAGES_CONFIRMED`
- Background job infrastructure (analysis is synchronous — see D30)
- Administrator user-management UI or password reset (U30)
- Docker, CI/CD, or deployment configuration

## Development Workflow

Full process: [docs/engineering/development-workflow.md](docs/engineering/development-workflow.md).

Before implementing a significant feature:
1. Inspect the existing project structure and relevant `docs/` file.
2. Propose a concise implementation plan.
3. Wait for approval when appropriate.
4. Make focused changes only — do not modify unrelated files.
5. Update `docs/` if the change affects architecture, requirements,
   database, API, AI pipeline, or UI design.
6. Run relevant checks after implementation.

## Git Rules

Full detail: [docs/engineering/git-workflow.md](docs/engineering/git-workflow.md).

- Never push directly to `main`.
- Use feature branches: `feat/<name>`, `fix/<name>`, `chore/<name>`,
  `docs/<name>`, `refactor/<name>`, `test/<name>`.
- Changes reach `main` through Pull Requests. Keep commits focused; do not
  mix unrelated features in one PR.

## Code Style

- TypeScript for frontend and backend; avoid `any` unless unavoidable.
- Python for the AI service.
- Validate all external input at API boundaries.
- Prefer descriptive names and readable code over clever abstractions.
- Do not add unnecessary comments.

## UI Design

Full detail: [docs/design/ui-design.md](docs/design/ui-design.md).

The UI must look like a professional Indian government portal — structured,
authoritative, accessible. It must not look like a generic SaaS dashboard,
a chatbot product, or a flashy startup landing page. AI appears as
structured, reviewable recommendations integrated into the workflow, not as
a chat-first interface.
