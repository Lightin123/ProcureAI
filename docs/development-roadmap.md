# Development Roadmap

**Status:** Milestones 0 and 1 are complete. Milestone 2 onward is planned
sequencing only.

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

## Milestone 2 — Procurement Project Skeleton (Next, Not Detailed)

- Introduce PostgreSQL integration and initial schema for procurement
  projects (see [architecture/database.md](architecture/database.md)).
- Basic CRUD for procurement projects (create, view) without AI or
  evaluation logic yet.
- Likely introduces authentication, since project data becomes
  user-specific — exact sequencing not yet decided.

## Milestone 3 — AI Requirement Analysis (Planned, Not Detailed)

- Scaffold `apps/ai-service` (FastAPI + Pydantic).
- Implement requirement extraction and clarification-question generation,
  called from `apps/api`.
- Structured requirements review/approval UI.

## Milestone 4 — Work Packages and Vendor Discovery (Planned, Not Detailed)

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
