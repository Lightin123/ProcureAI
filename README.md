# ProcureAI

**SIH26136 – AI-Assisted Public Procurement Platform**

An AI-assisted platform designed to support government departments in discovering, evaluating, and selecting suitable startups and solution providers for public procurement requirements.

This project is being developed for **Smart India Hackathon 2026**.

> **Project status:** Milestone 9 (Evaluation and AI-Assisted Decision Support)
> complete — the core procurement flow now runs end to end. For a confirmed
> work package an official gets a ranked, explainable list of eligible
> suppliers, shortlists and invites them, configures what response the package
> requires, and collects structured submissions. They then configure weighted
> evaluation criteria, run a deterministic evaluation, read a ranking in which
> every position shows the factors that produced it, compare suppliers side by
> side and requirement by requirement, optionally ask for a clearly-labelled
> advisory AI reading of a response, and record a selection or rejection with a
> mandatory reason. **No AI produces a score, a rank or a decision.**
> See [Current Status](#current-status) below.

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

**Milestones 1–9 are complete.**

An official signs in, creates a procurement project, runs AI analysis on its
problem description, reviews the suggested requirements and constraints,
answers clarification questions, and confirms the requirements — moving the
project `DRAFT → REQUIREMENTS_ANALYSIS → REQUIREMENTS_CONFIRMED`. They then
decompose the confirmed requirements into work packages, review and confirm
those, and for any confirmed package run supplier matching. Every action is
recorded against the authenticated user who performed it.

Suppliers self-register, complete a progressive capability onboarding, are
verified by an administrator, see published opportunities matched against
their own profile, and receive and answer invitations to specific work
packages.

- `apps/web` — React + TypeScript + Vite. Sign-in, projects register, project
  detail, create form, requirements review, work packages, supplier matching
  with comparison, shortlisting and invitation tracking, the response
  workspace and the full response reader, the vendor portal with its
  notification bell, invitation pages and the response editor, the supplier
  registry, and System Status. Routes and navigation are permission-aware.
- `apps/api` — Express + TypeScript. Authentication, projects, requirement
  analysis, work packages, vendor profiles, work-package supplier matching,
  supplier shortlisting and invitation, and structured response collection,
  backed by PostgreSQL (with pgvector) via `pg`.
- `apps/ai-service` — Python + FastAPI + Pydantic. Structured requirement
  analysis, work-package decomposition and capability insights across three
  interchangeable providers (OpenAI-compatible — currently Groq — Anthropic,
  and a deterministic stub that needs no API key), plus an embedding service
  configured separately. Embeddings default to `BAAI/bge-small-en-v1.5`, a real
  sentence encoder running locally on CPU — no API key, ~90 MB downloaded once,
  then offline. A deterministic concept-space model is the offline fallback.

**Work-package supplier matching.** For a confirmed work package the backend
normalises what is being procured, applies a deterministic eligibility filter
as a hard gate (mandatory certifications, credential validity, delivery region,
contract value, profile assessability), retrieves candidates by both keyword
overlap and pgvector semantic similarity, unions and deduplicates them, and
ranks the eligible ones on seven weighted dimensions. Nothing is decided by a
model: every score is arithmetic over stored supplier data, and every line of
every explanation quotes a value the supplier actually recorded. Suppliers who
fail a mandatory requirement are excluded rather than ranked lower, and the
exclusions and their grounds are shown to the official alongside the ranking.

Every AI suggestion is reviewable — nothing enters the confirmed record
without an explicit decision by the official.

**Shortlisting, invitation and response.** An official shortlists an eligible
supplier against one work package, stating why; the reason, the official and
the rank and score at that moment are all recorded. A shortlisted supplier can
then be invited to respond, with optional instructions and a response date. The
supplier is notified in its own portal — a bell in the header carries the
unread count — opens the invitation, sees the work package it concerns, and
accepts or declines with a stated reason. The department tracks who answered
and how. Every one of these acts is written to the work package's audit
history, with a supplier's answer attributed to the supplier's own account.

The two sides are kept apart deliberately: a supplier never sees the ranking
it appeared in, the scores, the eligibility verdict, the department's
shortlist reason, or any other supplier — those are different queries in a
different router, not the same response with fields hidden. An invitation is
not an award: accepting registers an intent to respond, and the structured
response follows it.

**Structured responses.** For a confirmed work package the official configures
what is being asked for — an expression of interest, an RFI response, a
proposal or a quotation — with a deadline, instructions, which sections are
required or optional, whether clarifications and documents are allowed, and
any custom questions. Opening it notifies every supplier that accepted its
invitation. The supplier drafts the response over as many sittings as it
needs, answering each confirmed requirement individually with a stated
position, filling in the technical, execution, timeline, capacity, experience,
compliance and commercial sections the department asked for, attaching
supporting documents, and watching a progress indicator that is the server's
own completeness computation rather than a count in the browser. A review
screen shows exactly what will be sent and what is still outstanding before
the supplier submits.

Once submitted, the response cannot be modified: every write route carries the
editable-state predicate in its `WHERE` clause. The department reads the whole
submission — requirement answers, sections, custom answers, attachments —
opens a review, and can request a clarification, which reopens the response
for the supplier to amend and resubmit. A supplier can ask its own questions
where the department allowed them. The complete exchange is kept with its
actors and timestamps, and every lifecycle event is written to the work
package's audit history. A department cannot read a draft the supplier has
not submitted.

**Evaluation and the human decision.** For a work package with responses marked
*ready for evaluation*, an official configures the weighted criteria it is
judged on — price, delivery timeline, capacity, certifications and compliance,
relevant experience, technical response, requirement compliance, and the
department's own questions. The system refuses a set whose weights do not add
up to 100, or that would score suppliers on information nobody was asked to
provide.

Running the evaluation scores every ready response by **arithmetic over the
figures the suppliers themselves stated** and the records on their capability
profiles. Every score carries the sentence explaining how it was reached and
the values it was read from. Responses are compared requirement by requirement
against four verdicts — compliant, partially compliant, non-compliant,
insufficient information — and **silence is never counted as compliance**: a
supplier that ticked "meets" and wrote nothing is reported as insufficient
information, with its own stated position still visible beside the verdict.

The ranking follows from the scores and nothing else, and every position shows
its strongest and weakest factors, its compliance gaps, its missing information
and its supporting evidence. A side-by-side comparison lays the suppliers out
across eligibility, price, timeline, capacity, certifications, each criterion
and its weighted contribution.

An official may ask for an **advisory AI reading** of any response: a summary,
strengths, weaknesses, points needing human attention, and the passage each
observation was drawn from. It is advisory structurally, not by label — the AI
schemas carry no score, rank or recommendation field, the readings are stored
in their own table with no score column, and nothing in the scoring pipeline
can read them.

The decision is the official's alone. They select or reject a named supplier
with a mandatory reason, and the system records the decision, the reason, the
acting user, the moment, the work package, the response and the evaluation
snapshot it cites. Nothing computes a decision, at most one supplier may be
selected per work package, and a correction is recorded as a revocation
alongside the original rather than replacing it.

**Authentication and access control.** Sessions are opaque tokens stored in
PostgreSQL and delivered in an `HttpOnly; SameSite=Strict` cookie; passwords
are hashed with `scrypt`. Three roles exist — Government Official,
Administrator (read-only oversight), and Vendor. Every `/api/v1` endpoint
requires a session and declares the permission it needs, and every query is
scoped to the user's own organization, so one department cannot reach
another's projects by changing a URL. The frontend hides controls a role
cannot use, but the backend is the boundary that actually enforces it. See
[docs/engineering/security.md](docs/engineering/security.md).

Not implemented: document intelligence over attachment contents, vendor gap
analysis and procurement analytics (Milestone 10), and advanced semantic
optimization, learning from recorded decisions and multi-package vendor
allocation (Milestone 11). See
[docs/development-roadmap.md](docs/development-roadmap.md) for sequencing
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
npm run seed         # demo organizations, accounts and the supplier registry
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

**Embeddings are configured separately and need no key.** Semantic vendor
matching defaults to `BAAI/bge-small-en-v1.5`, a sentence encoder that runs
locally on CPU; `pip install -r requirements.txt` brings in `fastembed`, and
the model itself (~90 MB) is downloaded on the first embedding call and cached,
after which it works offline. If that download cannot happen, the service falls
back to a deterministic concept-space model and logs that it did — semantic
matching still works, but generalises only over a built-in procurement
vocabulary. Hosted embeddings are opt-in via `EMBEDDING_API_KEY`. The embedding
model and its dimensionality are reported by `GET /health`.

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

Tests, in `apps/api`: `npm test` runs the matching unit suite and needs no
database or AI service. `npm run test:integration` runs two suites against
real data — the matching pipeline, and the shortlist/invitation/notification
flow over HTTP. Run `npm run migrate && npm run seed` first, have
`apps/ai-service` running, and have the API itself running (`npm run dev`) for
the engagement suite. Both skip rather than fail when their dependencies are
absent.

The engagement suite is mostly about requests that must be **refused**:
cross-organization access, cross-supplier access, an ineligible supplier, a
non-shortlisted supplier, an unconfirmed package, a duplicate invitation, a
second response, withdrawing an accepted invitation, and an administrator
attempting a procurement act. It cleans up after itself, leaving the seeded
demonstration data as it found it.

Two development scripts, neither part of the application:

- `npx tsx scripts/matchDemo.ts` prints the ranking every confirmed package in
  the seeded demonstration project produces — the quickest way to see the
  eligibility gate and hybrid retrieval working.
- `npx tsx scripts/engagementDemo.ts` puts one seeded work package (WP-04 by
  default) into the shortlisted-and-invited state, so the supplier half of a
  demonstration — the notification bell, the invitation, accept or decline —
  has something to open. Idempotent, and it goes through the same repository
  functions the API does, so the rows it leaves are the rows an official's
  clicks would have produced.

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