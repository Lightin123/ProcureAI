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

## Milestone 4 — Work Packages and Vendor Discovery (Next, Not Detailed)

- Work package generation.
- Vendor data model and semantic search via pgvector.
- Vendor discovery UI (structured filtering + semantic results).

## Milestone 5 — Evaluation and Recommendations (Planned, Not Detailed)

- RFI/proposal collection and document intelligence.
- Evaluation scoring (deterministic + AI-assisted).
- Ranking and explainable recommendations.
- Final human decision recording and audit trail.

## Notes

- This roadmap is a reasonable default sequencing based on the core system
  flow in [product/problem-statement.md](product/problem-statement.md); it
  has not been reviewed/approved milestone-by-milestone beyond Milestone 1.
- Each milestone must leave the project runnable, per
  [engineering/development-workflow.md](engineering/development-workflow.md).
- Milestones beyond Milestone 1 are not scheduled and should be re-scoped
  against [product/hackathon-scope.md](product/hackathon-scope.md) as the
  hackathon timeline becomes clearer.

## Related Documents

- [product/hackathon-scope.md](product/hackathon-scope.md)
- [product/requirements.md](product/requirements.md)
- [architecture/architecture.md](architecture/architecture.md)
