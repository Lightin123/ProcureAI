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

Milestones 1, 2, and 3 are complete. Full status:
[docs/product/hackathon-scope.md](docs/product/hackathon-scope.md) and
[docs/development-roadmap.md](docs/development-roadmap.md).

Implemented: React portal + Express API + PostgreSQL + FastAPI AI service.
Officials can create projects, run AI requirement analysis, review and edit
suggestions, answer clarifications, and confirm requirements. Next up is
Milestone 4 (work packages and vendor discovery) — not started.

**Do not implement** until explicitly requested:
- Authentication and RBAC (the acting official is a seeded server-side
  constant — see D21)
- Vendor functionality, semantic search, pgvector
- Work packages / solution components
- Workflow transitions beyond the three requirement states
- Background job infrastructure (analysis is synchronous — see D30)
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
