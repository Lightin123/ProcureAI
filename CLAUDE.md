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

Milestones 1 through 5 are complete. Milestone 6 (vendor ecosystem) is in
progress: vendor registration, onboarding, capability profiles,
verification, the vendor portal, and project-level deterministic matching
are implemented. Work-package-level hybrid (lexical + semantic) matching is
the current development priority and is not yet built. Full status:
[docs/product/hackathon-scope.md](docs/product/hackathon-scope.md) and
[docs/development-roadmap.md](docs/development-roadmap.md).

Implemented: React portal + Express API + PostgreSQL + FastAPI AI service.
Officials sign in, create projects, run AI requirement analysis, review and
edit suggestions, answer clarifications, confirm requirements, generate and
review AI work packages, and confirm them. Vendors self-register, complete
a progressive onboarding, get verified by an administrator, and discover
published opportunities matched against their profile.

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
- Work-package-level vendor matching, eligibility filtering, pgvector,
  embeddings, hybrid semantic retrieval — Milestone 6, current priority.
  See [docs/ai/vendor-discovery.md](docs/ai/vendor-discovery.md).
- Vendor shortlisting and invitation — Milestone 7
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
