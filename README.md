# ProcureAI

**SIH26136 – AI-Assisted Public Procurement Platform**

An AI-assisted platform designed to support government departments in discovering, evaluating, and selecting suitable startups and solution providers for public procurement requirements.

This project is being developed for **Smart India Hackathon 2026**.

> **Project status:** Milestone 5 (Authentication and RBAC) complete — real
> users sign in, and every API endpoint is protected by an authenticated
> session, a permission check, and organization scoping. See
> [Current Status](#current-status) below.

## Problem Statement

**Problem Statement ID:** SIH26136  
**Title:** Startup-Friendly Public Procurement Mechanism  
**Theme:** Smart Automation  
**Type:** Software

---

## Overview

Government departments often face complex problems but may not initially know:

- What type of solution or technology is required
- How to convert a broad problem into structured requirements
- Which startups or solution providers are suitable
- How to discover relevant vendors efficiently
- How to compare technical solutions
- How to evaluate proposals against multiple constraints
- Which combination of vendors or solutions provides the best overall outcome

This platform aims to assist government officials throughout the early procurement planning and solution discovery process.

The system is designed as an **AI-assisted decision-support platform**, not as an autonomous procurement system.

The final decision always remains with the responsible government official.

---

## Core Workflow

```text
Government Official
        │
        ▼
Create Procurement Project
        │
        ▼
Describe Problem / Requirement
        │
        ▼
AI Requirement Analysis
        │
        ├── Extract requirements
        ├── Identify constraints
        └── Detect missing information
        │
        ▼
Clarification and Human Review
        │
        ▼
Structured Requirements
        │
        ▼
Work Package Generation
        │
        ▼
Startup / Vendor Discovery
        │
        ├── Semantic Search
        └── Structured Filtering
        │
        ▼
Candidate Evaluation
        │
        ├── Technical Fit
        ├── Budget Compatibility
        ├── Timeline
        ├── Experience
        ├── Compliance
        └── Semantic Match
        │
        ▼
Ranking and Optimization
        │
        ▼
Explainable Recommendations
        │
        ▼
Human Decision
```

---

## Technology Stack

- **Frontend:** React, TypeScript, Vite (`apps/web`)
- **Backend:** Node.js, Express.js, TypeScript (`apps/api`)
- **AI Service:** Python, FastAPI, Pydantic (`apps/ai-service`)
- **Database:** PostgreSQL + pgvector

Local development only — no Docker, no monorepo build tooling. See
[docs/architecture/technology-stack.md](docs/architecture/technology-stack.md)
for details and rationale.

---

## Current Status

**Milestones 1–3 and 5 are complete.** Milestone 4 (work packages) is being
built on a separate branch.

An official signs in, creates a procurement project, runs AI analysis on its
problem description, reviews the suggested requirements and constraints,
answers clarification questions, and confirms the requirements — moving the
project `DRAFT → REQUIREMENTS_ANALYSIS → REQUIREMENTS_CONFIRMED`. Every action
is recorded against the authenticated user who performed it.

- `apps/web` — React + TypeScript + Vite. Sign-in screen, projects register,
  project detail, create form, requirements review screen, vendor landing
  page, and System Status. Routes and navigation are permission-aware.
- `apps/api` — Express + TypeScript. Authentication, health, projects, and
  requirement analysis endpoints, backed by PostgreSQL via `pg`.
- `apps/ai-service` — Python + FastAPI + Pydantic. Structured requirement
  analysis with three interchangeable providers selected by configuration:
  OpenAI-compatible (currently Groq), Anthropic, and a deterministic stub
  that needs no API key.

Every AI suggestion is reviewable — nothing enters the confirmed record
without an explicit decision by the official.

**Authentication and access control.** Sessions are opaque tokens stored in
PostgreSQL and delivered in an `HttpOnly; SameSite=Strict` cookie; passwords
are hashed with `scrypt`. Three roles exist — Government Official,
Administrator (read-only oversight), and Vendor. Every `/api/v1` endpoint
requires a session and declares the permission it needs, and every query is
scoped to the user's own organization, so one department cannot reach
another's projects by changing a URL. The frontend hides controls a role
cannot use, but the backend is the boundary that actually enforces it. See
[docs/engineering/security.md](docs/engineering/security.md).

Vendor discovery, work packages, and semantic search are not implemented yet.
See [docs/development-roadmap.md](docs/development-roadmap.md) for sequencing
and [docs/product/hackathon-scope.md](docs/product/hackathon-scope.md) for
what is explicitly out of scope until requested.

---

## Running Locally

Requires Node.js (developed against v22), npm, and a PostgreSQL database.
The development database is hosted rather than installed locally. `apps/web`
and `apps/api` are independent projects, each installed and run separately.

**1. Configure the database and demo password.** Copy
`apps/api/.env.example` to `apps/api/.env`, set `DATABASE_URL` to your
PostgreSQL connection string, and set `SEED_DEMO_PASSWORD` to a value of at
least 12 characters. `.env` is gitignored and must never be committed. If you
leave `SEED_DEMO_PASSWORD` unset, the seed script generates a password and
prints it once.

**2. Start the backend**, applying migrations and seed data first:

```bash
cd apps/api
npm install
npm run migrate      # create tables
npm run seed         # create demo organizations and user accounts
npm run dev          # http://localhost:4000
```

**3. Start the AI service** in a second terminal. It runs the deterministic
stub provider unless an LLM API key is configured — no key is needed to run or
demonstrate the platform:

```bash
cd apps/ai-service
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

To use a real model, copy `apps/ai-service/.env.example` to `.env` and set
one of:

- **Groq** (what this project runs on) — set `AI_API_KEY` to a `gsk_` key
  from [console.groq.com](https://console.groq.com/keys). `AI_BASE_URL` and
  `AI_MODEL` already default to Groq and `openai/gpt-oss-120b`. On the free
  tier keep `AI_MAX_TOKENS` at 3000 — the tier allows 8,000 tokens per
  minute, and a larger value makes one request exceed it.
- **xAI / OpenRouter / Ollama** — same `AI_API_KEY`, with `AI_BASE_URL` and
  `AI_MODEL` pointed at that service.
- **Anthropic** — `ANTHROPIC_API_KEY`; the model is set by `ANTHROPIC_MODEL`
  (default `claude-sonnet-5`).

The provider is chosen automatically from whichever key is present, and
`AI_PROVIDER` overrides it. The AI service's own `GET /health` reports the
active provider, as does the portal's System Status screen (and
`GET /api/v1/system/status`, which requires a signed-in official or
administrator).

**4. Start the frontend** in a third terminal:

```bash
cd apps/web
npm install
npm run dev          # http://localhost:5173
```

Open http://localhost:5173 — you are taken to the sign-in screen. Sign in as
`official@procureai.local` with your `SEED_DEMO_PASSWORD`, and you land on the
Procurement Projects register. In local development the frontend reaches the
API through the Vite dev-server proxy, which forwards `/health` and `/api` to
port 4000.

### Demo accounts

All four share the one password from `SEED_DEMO_PASSWORD`. In development the
sign-in screen lists them and fills the email field on click; that panel is
absent from production builds.

| Account | Role | Department | What it shows |
|---|---|---|---|
| `official@procureai.local` | Government Official | Infrastructure Development | The full procurement workflow |
| `admin@procureai.local` | Administrator | Infrastructure Development | Read-only oversight — can view projects but not decide or confirm |
| `official.health@procureai.local` | Government Official | Health and Family Welfare | A second department; cannot see Infrastructure projects at all |
| `vendor@procureai.local` | Vendor Representative | Demo Vendor Solutions | A signed-in vendor, with no access to procurement data |

**To reset the passwords**, set `SEED_DEMO_PASSWORD` and run `npm run seed`
again in `apps/api`. The script is idempotent — it updates the existing
accounts rather than creating duplicates — and refuses to run when
`NODE_ENV=production`.

Verify the services directly:

```bash
curl http://localhost:4000/health          # public liveness probe only
curl http://localhost:4000/api/v1/projects # 401 without a session cookie

# Sign in, keep the cookie, and use it:
curl -c cookies.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"official@procureai.local","password":"YOUR_SEED_DEMO_PASSWORD"}'
curl -b cookies.txt http://localhost:4000/api/v1/auth/me
curl -b cookies.txt http://localhost:4000/api/v1/projects
curl -b cookies.txt http://localhost:4000/api/v1/system/status  # database + AI service state

curl http://127.0.0.1:8000/health          # AI service, reports active provider
```

The API starts even without `DATABASE_URL` — `/api/v1/system/status` then
reports `"database": "unavailable"` and other `/api/v1` endpoints return HTTP
503, so the portal stays runnable and reports the problem honestly. Likewise,
if the AI service is down, the status endpoint reports it and analysis returns
HTTP 503 with the attempt recorded as a failed run. `GET /health` stays a bare
liveness probe and is the only endpoint that needs no session.

Scripts: `npm run dev`, `npm run build`, `npm run typecheck` in both
projects; `npm run migrate` and `npm run seed` in `apps/api`.

---

## Milestone 4 Integration (After Merge)

Milestone 4 (work packages) is being built on a separate branch against the
pre-authentication codebase. When the two branches merge, its routes need
these changes — nothing else:

1. **Identity.** Replace `await getCurrentOfficial()` with
   `getCurrentUser(request)` from `src/auth/currentUser.js` at each call site,
   and drop the `await` — it is now synchronous. The returned object has the
   same `id` and `organizationId` fields, so nothing downstream changes.
   `src/repositories/currentOfficial.ts` no longer exists.
2. **Permissions.** Add `requirePermission("workpackage:read")` or
   `requirePermission("workpackage:manage")` to each route. Both permissions
   already exist in `ROLE_PERMISSIONS` and are granted to Government
   Officials, so nothing needs defining at merge time. If work packages
   introduce their own stage transitions, use the existing
   `workflow:transition` rather than adding a permission, unless the semantics
   genuinely differ.
3. **Mounting order — the one that matters.** In `src/index.ts`, the
   work-packages router must be mounted **below** the
   `app.use("/api/v1", requireAuth)` line. Both branches edit this file, so
   the merge will conflict here; resolving it by placing the new mount above
   that line would silently leave work-package routes public.
4. **Migrations.** Milestone 5 took `004_authentication.sql` and left `003`
   free, so both apply cleanly in filename order with no schema overlap —
   Milestone 5 touches only `users`, `organizations`, and a new table.
5. **Frontend.** Move the work-packages route inside the `RequireAuth` and
   `RequirePermission` wrappers in `apps/web/src/App.tsx`, and gate its action
   buttons with `useHasPermission()`.

---

## Documentation

Detailed project decisions, requirements, and specifications live in
`docs/` and are the source of truth for this project — see
[CLAUDE.md](CLAUDE.md) for how documentation and implementation should stay
in sync.

**Product**
- [docs/product/product.md](docs/product/product.md) — vision and product principles
- [docs/product/problem-statement.md](docs/product/problem-statement.md) — SIH26136 problem statement
- [docs/product/requirements.md](docs/product/requirements.md) — functional & non-functional requirements
- [docs/product/users-and-roles.md](docs/product/users-and-roles.md) — roles and RBAC
- [docs/product/hackathon-scope.md](docs/product/hackathon-scope.md) — hackathon vs. long-term scope

**Architecture**
- [docs/architecture/architecture.md](docs/architecture/architecture.md) — system architecture
- [docs/architecture/technology-stack.md](docs/architecture/technology-stack.md) — stack and rationale
- [docs/architecture/database.md](docs/architecture/database.md) — data design (planned)
- [docs/architecture/api-design.md](docs/architecture/api-design.md) — API conventions
- [docs/architecture/decisions.md](docs/architecture/decisions.md) — decision log

**AI**
- [docs/ai/ai-system.md](docs/ai/ai-system.md) — AI service overview
- [docs/ai/ai-agents.md](docs/ai/ai-agents.md) — agentic-architecture policy
- [docs/ai/rag-and-semantic-search.md](docs/ai/rag-and-semantic-search.md)
- [docs/ai/document-intelligence.md](docs/ai/document-intelligence.md)
- [docs/ai/vendor-discovery.md](docs/ai/vendor-discovery.md)
- [docs/ai/evaluation-and-ranking.md](docs/ai/evaluation-and-ranking.md)

**Design**
- [docs/design/procurement-workflow.md](docs/design/procurement-workflow.md)
- [docs/design/ui-design.md](docs/design/ui-design.md) — government-portal design philosophy

**Engineering**
- [docs/engineering/security.md](docs/engineering/security.md)
- [docs/engineering/development-workflow.md](docs/engineering/development-workflow.md)
- [docs/engineering/git-workflow.md](docs/engineering/git-workflow.md)
- [docs/engineering/testing-strategy.md](docs/engineering/testing-strategy.md)
- [docs/engineering/deployment.md](docs/engineering/deployment.md)

**Reference**
- [docs/development-roadmap.md](docs/development-roadmap.md)
- [docs/glossary.md](docs/glossary.md)