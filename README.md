# ProcureAI

**SIH26136 – AI-Assisted Public Procurement Platform**

An AI-assisted platform designed to support government departments in discovering, evaluating, and selecting suitable startups and solution providers for public procurement requirements.

This project is being developed for **Smart India Hackathon 2026**.

> **Project status:** Foundation stage. No application code has been
> scaffolded yet — see [Current Status](#current-status) below.

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

The project is at the **foundation stage**. `apps/web`, `apps/api`, and
`apps/ai-service` are currently empty placeholder directories — no
application code exists yet.

The first implementation milestone is:

```text
React Frontend
        │
        ▼
Express Backend
        │
        ▼
GET /health
        │
        ▼
Frontend displays backend connection status
```

See [docs/development-roadmap.md](docs/development-roadmap.md) for
sequencing and [docs/product/hackathon-scope.md](docs/product/hackathon-scope.md)
for what is explicitly out of scope until requested.

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