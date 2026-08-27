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
| D15 | npm is the package manager for `apps/web` and `apps/api` | Already the documented assumption; available in the local environment. Resolves U15 |
| D16 | Local development ports: Express API on `4000`, Vite dev server on `5173` | Vite's default for the frontend; a distinct, unused port for the API. API port is overridable via the `PORT` environment variable |
| D17 | In local development the frontend reaches the backend through the Vite dev-server proxy rather than CORS middleware | Keeps requests same-origin in dev, so no CORS dependency or configuration is needed yet. Revisit when the frontend is served from somewhere other than the Vite dev server |
| D18 | `GET /health` is served unversioned at the root, not under a versioned prefix | Matches the endpoint documented in [api-design.md](api-design.md) and standard health-check convention; deliberately does not pre-empt the still-open versioning decision (U7) |
| D19 | Development database is **hosted PostgreSQL**, not a local install | No local PostgreSQL is required, which keeps D5 (no Docker) intact. Introduces an external service dependency and requires TLS — see [technology-stack.md](technology-stack.md) |
| D20 | Data access uses `pg` (node-postgres) with hand-written SQL and plain `.sql` migrations; no ORM. Resolves **U1** | Fewest dependencies, no codegen, transparent SQL, and unconstrained pgvector use in Milestone 4. Migrations are tracked in a `schema_migrations` table by a small runner (`npm run migrate`) |
| D21 | Until authentication exists, the acting official is resolved **server-side** from a seeded user constant | Gives `created_by` / `organization_id` real values from the first schema, so adding auth later is wiring rather than migration. Deliberately not a client-supplied identity header, which would be spoofable |
| D22 | Procurement projects use a fixed 9-state workflow enum (`DRAFT` … `CANCELLED`) | Defined once in [../design/procurement-workflow.md](../design/procurement-workflow.md) so later milestones extend behaviour rather than widening the state model. Only `DRAFT` is reachable in Milestone 2 |
| D23 | API application endpoints are served under `/api/v1`. Resolves **U7** | First real endpoints (`/api/v1/projects`) needed a prefix; `/health` remains unversioned per D18 |
| D24 | Error responses use `{ error: { code, message, details? } }`. Resolves **U8** | Matches the shape already sketched in [api-design.md](api-design.md); `details` carries per-field validation messages |
| D25 | Request validation at the API boundary uses `zod` | Directly serves NFR3 and the CLAUDE.md rule that all external input is validated; hand-written guards do not scale past a couple of endpoints |
| D26 | Frontend routing uses `react-router-dom` | Milestone 2 introduces multiple URL-addressable screens, and [../design/ui-design.md](../design/ui-design.md) mandates breadcrumbs and a stable page hierarchy |
| D27 | LLM provider is Anthropic; the model is **configured**, not hardcoded (`ANTHROPIC_MODEL`, default `claude-sonnet-5`). Resolves **U6** | Keeps the provider architecture stable while the model can change. Called through the official `anthropic` Python SDK using structured outputs, so responses are schema-validated rather than parsed from free text |
| D28 | AI suggestion traceability uses a single `project_requirements` table with provenance columns (`source`, `status`, `analysis_run_id`, `original_text`, `rejection_reason`). Resolves **U20** for requirements | Bidirectional traceability without the synchronisation burden of separate suggestion and confirmed tables. Applies to requirements only; other data areas decide independently |
| D29 | Requirement taxonomy: `kind` = REQUIREMENT \| CONSTRAINT; `category` = FUNCTIONAL, NON_FUNCTIONAL, BUDGET, TIMELINE, COMPLIANCE, OTHER | `kind` maps to FR2.1 vs FR2.2; the categories cover the constraint examples named in [../product/requirements.md](../product/requirements.md) |
| D30 | Requirement analysis runs **synchronously** with a 60s timeout; no background jobs or queues in Milestone 3. **U16/U17 remain open** | A single analysis call is not the long-running workload the async path in [architecture.md](architecture.md) is reserved for. Revisit if real analyses approach the timeout |
| D31 | Every AI-driven analysis is recorded as a `requirement_analysis_runs` row | Mirrors the Evaluation/Recommendation Runs pattern: re-running never silently overwrites prior output, and failures are recorded rather than lost |
| D32 | `project_stage_history` records every workflow transition from the first one | Milestone 3 introduces the first transitions; retrofitting history later would permanently lose the earliest entries. Serves FR11.1 and NFR4 |
| D33 | Confirmation requires at least one ACCEPTED requirement; unanswered clarifications warn but do not block | The official may reasonably judge open questions unnecessary; a hard block would override their judgement, which conflicts with the human-in-the-loop principle |
| D34 | Explicit reopen is allowed from `REQUIREMENTS_CONFIRMED` back to `REQUIREMENTS_ANALYSIS`. Partially resolves **U22** | Supports the iterative workflow (Workflow Principle 2). Only this pair is defined; other backward transitions stay unresolved |
| D35 | Milestone 3 uses a **fixed AI pipeline**, not an agentic loop | The workflow already makes "Re-run analysis" a human action, so the official is the loop controller. No level-3 agentic component was needed — see [../ai/ai-agents.md](../ai/ai-agents.md) |
| D36 | A deterministic **stub provider** ships alongside the Anthropic provider and is selected automatically when no API key is configured | Keeps the platform runnable and demonstrable without credentials (NFR7), and makes the review workflow testable without incurring API cost |
| D37 | Python tooling is `venv` + `requirements.txt`; the AI service listens on port 8000 and binds to `127.0.0.1` only | No new packaging tooling (no Poetry/uv). Loopback binding enforces the rule that Express is the AI service's only caller |

## Open / Unresolved Decisions

| # | Question | Notes |
|---|---|---|
| U2 | Detailed database schema | Deferred until PostgreSQL integration is requested |
| U3 | Authentication mechanism (session vs. JWT, provider) | Deferred until auth is requested |
| U4 | Whether "Government Administrator" and "Procurement Administrator" are distinct roles | See [../product/users-and-roles.md](../product/users-and-roles.md) |
| U5 | Whether vendor self-service is in hackathon scope or a future extension | See [../product/hackathon-scope.md](../product/hackathon-scope.md) |
| U9 | File/object storage provider for uploaded documents (local filesystem now; object storage e.g. S3-compatible later) | Component is named in [architecture.md](architecture.md); specific technology not yet chosen |
| U10 | Testing frameworks per component | Still open. Milestone 2 was verified by typecheck, build, SSR route smoke tests, and manual API checks — no test framework adopted yet. See [../engineering/testing-strategy.md](../engineering/testing-strategy.md) |
| U11 | CI/CD tooling and pipeline | Explicitly out of scope for now |
| U12 | Deployment target (if any) for hackathon demo | See [../engineering/deployment.md](../engineering/deployment.md) |
| U13 | Performance/scale targets | See NFR9 in [../product/requirements.md](../product/requirements.md) |
| U14 | Embedding model, vector dimensionality, and pgvector indexing strategy | See [../ai/rag-and-semantic-search.md](../ai/rag-and-semantic-search.md) |
| U16 | Background/async job processing mechanism | Still open. Milestone 3 runs analysis synchronously (D30); revisit when a genuinely long-running workload arrives |
| U17 | Frontend job-status delivery mechanism | Still open, and not needed while analysis is synchronous (D30) |
| U18 | Organization/department scoping model (strict hierarchy vs. flat, single-org-per-user vs. multi-org membership) | See [database.md](database.md) |
| U19 | Relationship between Organization Memberships and the global role model | See [database.md](database.md) and [../product/users-and-roles.md](../product/users-and-roles.md) |
| U20 | Mechanism for AI-suggestion-to-confirmed-state traceability in data areas **other than requirements** | Requirements resolved by D28 (status + provenance columns). Work packages, document extractions, and evaluations still decide independently — see [database.md](database.md) |
| U21 | Retention and comparison UX for multiple Evaluation / Recommendation Runs | See [database.md](database.md) and [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md) |
| U22 | Permitted backward workflow transitions **other than** confirmed-to-analysis | `REQUIREMENTS_CONFIRMED -> REQUIREMENTS_ANALYSIS` is defined by D34; later pairs are defined by the milestone that introduces them |
| U23 | Work-package-level workflow states | Separate from project states; to be defined with work packages in Milestone 4 |
| U24 | Reference-number allocation strategy under concurrency | Milestone 2 uses `PRJ-<year>-<sequence>` derived from `MAX(split_part(...))`. Correct sequentially, but two simultaneous inserts can collide on the unique constraint. Adequate for single-user development; replace with a sequence or retry-on-conflict before multi-user use |
| U25 | Whether the Anthropic provider's prompt and output quality need tuning against real procurement descriptions | The provider is implemented and structurally verified, but has not been exercised against the live Anthropic API — no API key was configured during Milestone 3 |
| U26 | Whether editing a MANUAL requirement should be tracked distinctly | `edited` currently means "diverged from the AI's original wording", so it stays false for manually authored items. Adequate today; revisit if manual edit history is needed |

## How to Use This Log

When a decision is made during development (in conversation, in a PR
review, or by explicit instruction), add it to the Confirmed Decisions table
and remove the corresponding row from Open/Unresolved if applicable. Do not
delete resolved decisions — they form the project's history.

## Related Documents

- [architecture.md](architecture.md)
- [technology-stack.md](technology-stack.md)
- [../product/hackathon-scope.md](../product/hackathon-scope.md)
