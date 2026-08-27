# ProcureAI

**SIH26136 – AI-Assisted Public Procurement Platform**

An AI-assisted platform designed to support government departments in discovering, evaluating, and selecting suitable startups and solution providers for public procurement requirements.

This project is being developed for **Smart India Hackathon 2026**.

> **Project status:** Milestone 2 (Procurement Project Skeleton) complete —
> procurement projects can be created, listed, and viewed, persisted in
> PostgreSQL. See [Current Status](#current-status) below.

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

**Milestone 2 — Procurement Project Skeleton: complete.**

An official can create a procurement project with a free-form problem
description, view the project register, and open a project's detail page.
Projects are persisted in PostgreSQL and created in the `DRAFT` workflow
state.

- `apps/web` — React + TypeScript + Vite. Government-portal-style Projects
  register, project detail, create form, and System Status pages.
- `apps/api` — Express + TypeScript. `GET /health` plus
  `/api/v1/projects` (list, detail, create), backed by PostgreSQL via `pg`.
- `apps/ai-service` — not yet started (Milestone 3).

No authentication, RBAC, AI functionality, vendor discovery, or workflow
transitions are implemented yet. See
[docs/development-roadmap.md](docs/development-roadmap.md) for sequencing and
[docs/product/hackathon-scope.md](docs/product/hackathon-scope.md) for what
is explicitly out of scope until requested.

---

## Running Locally

Requires Node.js (developed against v22), npm, and a PostgreSQL database.
The development database is hosted rather than installed locally. `apps/web`
and `apps/api` are independent projects, each installed and run separately.

**1. Configure the database.** Copy `apps/api/.env.example` to
`apps/api/.env` and set `DATABASE_URL` to your PostgreSQL connection string.
`.env` is gitignored and must never be committed.

**2. Start the backend**, applying migrations and seed data first:

```bash
cd apps/api
npm install
npm run migrate      # create tables
npm run seed         # create the development department and official
npm run dev          # http://localhost:4000
```

**3. Start the frontend** in a second terminal:

```bash
cd apps/web
npm install
npm run dev          # http://localhost:5173
```

Open http://localhost:5173 — you land on the Procurement Projects register.
The System Status page reports backend and database connectivity. In local
development the frontend reaches the API through the Vite dev-server proxy,
which forwards `/health` and `/api` to port 4000.

Verify the backend directly:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/v1/projects
```

The API starts even without `DATABASE_URL` — `/health` then reports
`"database": "unavailable"` and `/api/v1` endpoints return HTTP 503, so the
portal stays runnable and reports the problem honestly.

Scripts: `npm run dev`, `npm run build`, `npm run typecheck` in both
projects; `npm run migrate` and `npm run seed` in `apps/api`.

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