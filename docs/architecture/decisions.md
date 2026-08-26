# Decisions Log

**Status:** Living document. Records confirmed project decisions and
currently unresolved/open questions. Update this file whenever a new
architectural, product, or process decision is made.

## Confirmed Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Frontend: React + TypeScript + Vite | Standard, well-understood stack |
| D2 | Backend: Node.js + Express + TypeScript | Simplicity, shared language with frontend |
| D3 | AI service: Python + FastAPI + Pydantic | Best AI/ML ecosystem, built-in validation |
| D4 | Database: PostgreSQL + pgvector | Single database for relational + vector data, avoids extra vector DB |
| D5 | No Docker for this project | Local development only, keep setup simple |
| D6 | No Turborepo / Nx | Two apps don't need monorepo build orchestration |
| D7 | `apps/web` and `apps/api` are independent projects | Simplicity over shared tooling |
| D8 | System has three primary application components (web / api / ai-service); no additional independently deployed application services without a clear technical reason | Avoid unjustified architectural complexity |
| D14 | Architecture includes background/async job processing and file/object storage as conceptual infrastructure the Express backend depends on, not new application services | Support long-running operations (document processing, OCR, embeddings, evaluation) without blocking a single HTTP request, and avoid assuming PostgreSQL stores large file content — see [architecture.md](architecture.md) |
| D9 | AI output must be structured, validated, and never trusted as source of truth | Core product principle — see [../product/product.md](../product/product.md) |
| D10 | Human-in-the-loop required at every AI-driven workflow stage | Core product principle; system must not make binding decisions |
| D11 | First implementation milestone is Frontend -> Backend -> `GET /health` | Establish the simplest possible end-to-end vertical slice before any domain logic |
| D12 | Documentation in `docs/` is the source of truth for detailed specs; `CLAUDE.md` stays concise and links to it | Avoid duplicating/drifting specs across files |
| D13 | Docs organized into subdirectories (`product/`, `architecture/`, `ai/`, `design/`, `engineering/`) rather than a flat `docs/` directory | Keep growing documentation navigable |

## Open / Unresolved Decisions

| # | Question | Notes |
|---|---|---|
| U1 | ORM choice for `apps/api` (e.g. Prisma) vs. raw SQL | Explicitly deferred until PostgreSQL integration is requested |
| U2 | Detailed database schema | Deferred until PostgreSQL integration is requested |
| U3 | Authentication mechanism (session vs. JWT, provider) | Deferred until auth is requested |
| U4 | Whether "Government Administrator" and "Procurement Administrator" are distinct roles | See [../product/users-and-roles.md](../product/users-and-roles.md) |
| U5 | Whether vendor self-service is in hackathon scope or a future extension | See [../product/hackathon-scope.md](../product/hackathon-scope.md) |
| U6 | Specific LLM provider(s)/model(s) for the AI service | Not yet discussed |
| U7 | API base path / versioning prefix | See [api-design.md](api-design.md) |
| U8 | Error response shape convention | See [api-design.md](api-design.md) |
| U9 | File/object storage provider for uploaded documents (local filesystem now; object storage e.g. S3-compatible later) | Component is named in [architecture.md](architecture.md); specific technology not yet chosen |
| U10 | Testing frameworks per component | See [../engineering/testing-strategy.md](../engineering/testing-strategy.md) |
| U11 | CI/CD tooling and pipeline | Explicitly out of scope for now |
| U12 | Deployment target (if any) for hackathon demo | See [../engineering/deployment.md](../engineering/deployment.md) |
| U13 | Performance/scale targets | See NFR9 in [../product/requirements.md](../product/requirements.md) |
| U14 | Embedding model, vector dimensionality, and pgvector indexing strategy | See [../ai/rag-and-semantic-search.md](../ai/rag-and-semantic-search.md) |
| U15 | Package manager for JS/TS projects (assumed npm, not confirmed) | See [technology-stack.md](technology-stack.md) |
| U16 | Background/async job processing mechanism (in-process, task queue library e.g. BullMQ, broker e.g. Redis, or other) | Component is named in [architecture.md](architecture.md); specific technology not yet chosen |
| U17 | Frontend job-status delivery mechanism (polling, SSE, WebSockets, or other) | See "Asynchronous Request Flow" in [architecture.md](architecture.md) |
| U18 | Organization/department scoping model (strict hierarchy vs. flat, single-org-per-user vs. multi-org membership) | See [database.md](database.md) |
| U19 | Relationship between Organization Memberships and the global role model | See [database.md](database.md) and [../product/users-and-roles.md](../product/users-and-roles.md) |
| U20 | Mechanism for AI-suggestion-to-confirmed-state traceability per data area (status-based, separate-entity, or version-based) | See "AI Suggestions vs. Confirmed State" in [database.md](database.md) |
| U21 | Retention and comparison UX for multiple Evaluation / Recommendation Runs | See [database.md](database.md) and [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md) |

## How to Use This Log

When a decision is made during development (in conversation, in a PR
review, or by explicit instruction), add it to the Confirmed Decisions table
and remove the corresponding row from Open/Unresolved if applicable. Do not
delete resolved decisions — they form the project's history.

## Related Documents

- [architecture.md](architecture.md)
- [technology-stack.md](technology-stack.md)
- [../product/hackathon-scope.md](../product/hackathon-scope.md)
