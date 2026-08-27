# Development Roadmap

**Status:** Milestones 0 through 3 are complete. Milestone 4 onward is
planned sequencing only.

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

Success condition met: the React frontend successfully communicates with
the Express backend. The frontend reaches the API through the Vite dev
proxy in local development (see D17 in
[architecture/decisions.md](architecture/decisions.md)).

Running it locally — two terminals, from the repository root:

```
cd apps/api && npm install && npm run dev     # http://localhost:4000
cd apps/web && npm install && npm run dev     # http://localhost:5173
```

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

**Authentication was deliberately not introduced.** Ownership is modelled
(`created_by`, `organization_id`) and the acting official is resolved
server-side from a seeded constant (D21), so authentication becomes a
wiring change later rather than a schema migration.

Running it locally, after setting `DATABASE_URL` in `apps/api/.env`:

```
cd apps/api && npm install && npm run migrate && npm run seed && npm run dev
cd apps/web && npm install && npm run dev
```

## Milestone 3 — AI Requirement Analysis (Complete)

```
Run AI analysis -> review suggestions -> answer clarifications -> confirm requirements
```

- [x] Scaffold `apps/ai-service` (FastAPI + Pydantic, venv + requirements.txt).
- [x] Requirement extraction, constraint identification, missing-information
      detection, and clarification-question generation, called from `apps/api`.
- [x] Anthropic provider (model configurable, default `claude-sonnet-5`) plus
      a deterministic stub provider so the platform runs without an API key.
- [x] Structured requirements review UI: accept, edit, reject-with-reason,
      add manually, answer clarifications, confirm, reopen.
- [x] `project_stage_history` records every workflow transition.

Delivers FR2.1–FR2.6. Analysis runs synchronously (D30); no background job
infrastructure was introduced.

Running it locally adds a third process:

```
cd apps/ai-service && .venv/Scripts/python -m uvicorn app.main:app --port 8000
cd apps/api && npm run migrate && npm run dev
cd apps/web && npm run dev
```

## Milestone 4 — Work Packages (Next, Not Detailed)

Goal: turn confirmed structured requirements into reviewable work packages.

- Generate work packages from confirmed requirements (FR3.1).
- Review, edit, accept, reject, add and remove work packages (FR3.2).
- Allow a project to proceed without decomposition where a single solution
  is appropriate (FR3.3).
- Preserve AI provenance and human decisions, consistent with NFR8 and the
  pattern established for requirements in D28.
- Introduce work-package-level workflow states (resolves U23) and the
  transitions that reach `WORK_PACKAGES_CONFIRMED`.

Continues to use the seeded acting official (D21). No authentication, no
vendor functionality, no pgvector.

## Milestone 5 — Authentication and RBAC (Planned, Not Detailed)

Goal: replace the seeded development identity with real authenticated users
and enforce authorization.

- Authentication with login, logout and session handling (resolves U3).
- Real authenticated user identity replacing the server-side constant of D21.
- Role-based access control covering at least Government Official,
  Administrator and Vendor (FR10.1), informed by
  [product/users-and-roles.md](product/users-and-roles.md) and U4.
- Organization-aware authorization, preserving the existing
  `organization_id` scoping already enforced in every query (FR10.2).
- Route and API protection, with permission checks in the backend as the
  authoritative boundary.
- Role-aware frontend navigation and access.

Milestones 1–4 are not redesigned; the acting-official resolver is a single
server-side seam, so this milestone swaps its implementation rather than
migrating data.

## Milestone 6 — Vendor Discovery and Matching (Planned, Not Detailed)

- Vendor data model and vendor profile data.
- Vendor onboarding as appropriate, now feasible because vendor
  representatives can hold real accounts after Milestone 5 (bears on U5).
- Structured vendor filtering.
- Semantic search using pgvector where justified (bears on U14).
- Vendor discovery UI and matching vendors to work packages.
- AI-assisted vendor relevance features that fit the existing architecture.

## Milestone 7 — Evaluation and Recommendations (Planned, Not Detailed)

- RFI/proposal collection and document intelligence.
- Evaluation scoring (deterministic + AI-assisted).
- Ranking and explainable recommendations.
- Final human decision recording and audit trail.

## Notes

- Sequencing follows the core system flow in
  [product/problem-statement.md](product/problem-statement.md), with one
  deliberate departure: authentication and RBAC were moved ahead of vendor
  work (D43). Vendor representatives need real accounts, so building vendor
  onboarding before authentication would have required throwaway scaffolding.
- Each milestone must leave the project runnable, per
  [engineering/development-workflow.md](engineering/development-workflow.md).
- Milestones beyond Milestone 1 are not scheduled and should be re-scoped
  against [product/hackathon-scope.md](product/hackathon-scope.md) as the
  hackathon timeline becomes clearer.

## Related Documents

- [product/hackathon-scope.md](product/hackathon-scope.md)
- [product/requirements.md](product/requirements.md)
- [architecture/architecture.md](architecture/architecture.md)
