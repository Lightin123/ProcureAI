# API Design

**Status:** Planned conventions + current actual status. `GET /health` and
the procurement project endpoints are implemented as of Milestone 2; every
other endpoint group below is still planned.

## Current Status

Implemented endpoints:

- `GET /health` — returns HTTP 200 with a JSON payload confirming the
  Express backend is operational, including a `database` field reporting
  connectivity (`connected` / `unavailable`). Served unversioned at the root
  path (see D18 in [decisions.md](decisions.md)); requires no authentication.
- `GET /api/v1/projects` — lists procurement projects for the acting
  official's organization, newest first. Returns `{ "data": [...] }`.
- `GET /api/v1/projects/:id` — returns a single project as `{ "data": {...} }`,
  or 404 if it does not exist or belongs to another organization.
- `POST /api/v1/projects` — creates a project from `{ title, problemDescription }`.
  Returns 201 with the created project; 400 with per-field details when
  validation fails. New projects are created in the `DRAFT` workflow state.

All `/api/v1` endpoints currently act as the seeded official (D21) — there
is no authentication yet. They return 503 `DATABASE_NOT_CONFIGURED` when
`DATABASE_URL` is unset, so the service still starts and `/health` still
reports honestly.

## Conventions (Planned)

These conventions apply to application endpoints. Those marked implemented
above already follow them; the remainder are planned.

- **Style:** REST over HTTP/JSON.
- **Base path:** all application endpoints under `/api/v1` (D23). `/health`
  is deliberately excluded and stays unversioned (D18).
- **Resource naming:** plural nouns for collections (e.g.
  `/projects`, `/vendors`).
- **Auth:** endpoints other than `/health` will require authentication once
  implemented (see [../engineering/security.md](../engineering/security.md)).
  Not implemented yet.
- **Success envelope:** successful responses wrap the payload in
  `{ "data": ... }`.
- **Validation:** all request bodies validated at the API boundary with
  `zod` (D25) before reaching business logic.
- **Error format:** `{ error: { code, message, details? } }` (D24).
  `details` is an array of `{ field, message }` for validation failures.
  Codes in use: `VALIDATION_ERROR`, `NOT_FOUND`, `DATABASE_NOT_CONFIGURED`,
  `SEED_DATA_MISSING`, `INTERNAL_ERROR`.
- **Status codes:** standard HTTP status codes used semantically (2xx
  success, 4xx client error, 5xx server error).

## Planned Endpoint Groups (Not Implemented)

Grouped by the functional areas in
[../product/requirements.md](../product/requirements.md). Exact routes,
methods, and payloads are not yet designed.

- `Auth` — login/session endpoints.
- `Projects` — procurement project CRUD and stage transitions.
- `Requirements` — structured requirement CRUD, approval actions.
- `Clarifications` — clarification question/answer endpoints.
- `Work Packages` — work package CRUD.
- `Vendors` — vendor discovery, vendor profile access.
- `Submissions` — RFI/proposal submission endpoints.
- `Evaluations` — evaluation and ranking retrieval.
- `Audit` — audit log retrieval (admin-scoped).

## Backend <-> AI Service Communication (Planned)

- The Express backend calls the FastAPI AI service over HTTP.
- Request/response payloads on the AI service side are validated via
  Pydantic models.
- The AI service is not exposed to the frontend directly (see
  [architecture.md](architecture.md)).
- Internal API contract between `apps/api` and `apps/ai-service` is
  **unresolved** — to be designed alongside the first AI feature.

## Related Documents

- [architecture.md](architecture.md)
- [../engineering/security.md](../engineering/security.md)
- [../development-roadmap.md](../development-roadmap.md)
