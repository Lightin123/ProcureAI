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

## Database

- PostgreSQL
- pgvector extension (for embeddings-based semantic search)

Rationale: a single relational database serves both structured procurement
data and vector similarity search, avoiding a separate vector database.

**Unresolved:** whether an ORM/query builder will be used in `apps/api`
(e.g. Prisma) and the specifics of the migration approach. Explicitly not to
be decided/implemented until PostgreSQL integration is requested. See
[database.md](database.md) and [decisions.md](decisions.md).

## Development Environment

- Local development only.
- No Docker for this project.

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

- Specific LLM provider(s) and model(s) used by the AI service.
- Package manager choice for JS/TS projects (npm assumed by default; not
  explicitly confirmed).
- Testing frameworks per component (see
  [../engineering/testing-strategy.md](../engineering/testing-strategy.md)).
- Linting/formatting tooling.
- CI/CD tooling (see [../engineering/deployment.md](../engineering/deployment.md)).

## Related Documents

- [architecture.md](architecture.md)
- [database.md](database.md)
- [decisions.md](decisions.md)
