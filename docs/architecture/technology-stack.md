# Technology Stack

**Status:** Confirmed choices for the components below. Version pinning and
supporting libraries (test frameworks, linters, etc.) are unresolved and
will be decided as each slice is implemented.

## Frontend — `apps/web`

- React
- TypeScript
- Vite

Rationale: standard, well-understood stack for building an interactive
government-portal-style UI without unnecessary framework overhead.

## Backend — `apps/api`

- Node.js
- Express.js
- TypeScript

Rationale: keeps frontend and backend in the same language, simple and
widely understood for REST API development; avoids introducing a second
backend framework paradigm.

## AI Service — `apps/ai-service`

- Python
- FastAPI
- Pydantic

Rationale: Python has the strongest ecosystem for AI/ML/NLP work; FastAPI
gives typed, validated request/response models via Pydantic, which directly
supports the "AI output must be structured and validated" principle.

The LLM is reached through one of three interchangeable providers, selected by
configuration rather than code (see
[../ai/ai-system.md](../ai/ai-system.md)):

- `openai_compatible` via the `openai` SDK — **what the project currently runs
  on**, pointed at Groq (D38, D41).
- `anthropic` via the `anthropic` SDK, using structured outputs (D27).
- `stub` — deterministic, no credentials, so the platform runs without a key
  (D36).

The provider and model are configuration, so changing service does not change
provider code.

## Database

- PostgreSQL
- pgvector extension (for embeddings-based semantic search)

Rationale: a single relational database serves both structured procurement
data and vector similarity search, avoiding a separate vector database.

Data access uses `pg` (node-postgres) with hand-written SQL — no ORM (D20).
Schema changes are plain `.sql` files applied in order by a small runner
(`npm run migrate`) and tracked in a `schema_migrations` table.

The development database is **hosted** PostgreSQL rather than a local
install (D19). This keeps D5 (no Docker) intact but means development
depends on an external service and requires TLS; the connection string lives
in `apps/api/.env`, which is never committed. See [database.md](database.md)
and [decisions.md](decisions.md).

## Development Environment

- Application code runs locally; no Docker.
- The PostgreSQL development database is hosted externally (D19), so an
  internet connection is required for database-backed features. Everything
  else — the web portal and the API process — runs entirely on the
  developer's machine.

## Explicitly Excluded

- Turborepo
- Nx
- Docker (for now)
- Additional independently deployed application services beyond the three
  primary components (web / api / ai-service) without a clear technical
  reason
- Any technology adopted primarily to look impressive rather than solve a
  concrete need

## Unresolved / Not Yet Decided

- Testing frameworks per component (see
  [../engineering/testing-strategy.md](../engineering/testing-strategy.md)).
- Linting/formatting tooling.
- CI/CD tooling (see [../engineering/deployment.md](../engineering/deployment.md)).

## Related Documents

- [architecture.md](architecture.md)
- [database.md](database.md)
- [decisions.md](decisions.md)
