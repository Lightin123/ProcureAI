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

Milestones 1 through 5 are complete. **Milestone 6 (vendor ecosystem) is
complete**, including work-package-level hybrid matching. Full status:
[docs/product/hackathon-scope.md](docs/product/hackathon-scope.md) and
[docs/development-roadmap.md](docs/development-roadmap.md).

Implemented: React portal + Express API + PostgreSQL with pgvector + FastAPI
AI service. Officials sign in, create projects, run AI requirement analysis,
review and edit suggestions, answer clarifications, confirm requirements,
generate and review AI work packages, and confirm them. Vendors self-register,
complete a progressive onboarding, get verified by an administrator, and
discover published opportunities matched against their profile. For a
**confirmed work package**, an official runs supplier matching and receives a
ranked, explainable list of eligible suppliers, can inspect who was excluded
and on what ground, compare suppliers side by side, and shortlist them.

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
- Vendor invitation and the engagement workflow around the shortlist —
  Milestone 7. The shortlist itself exists only as a minimal seam (D69):
  a table, add/remove endpoints, and a list in the matching page. Do not
  build invitation, response tracking or evaluation on top of it.
- RFI/proposal collection, document intelligence, response evaluation —
  Milestones 8–9
- Vendor gap analysis, procurement analytics — Milestone 10
- Advanced semantic optimization (learned ranking, query expansion,
  reranking) — Milestone 11
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
