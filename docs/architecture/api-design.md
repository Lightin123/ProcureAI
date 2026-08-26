# API Design

**Status:** Planned conventions + current actual status. `GET /health` is
implemented as of Milestone 1; every other endpoint below is still planned.

## Current Status

One endpoint is implemented:

- `GET /health` — implemented in `apps/api`. Returns HTTP 200 with a JSON
  payload confirming the Express backend is operational:
  `{ "status": "ok", "service": "procureai-api", "milestone": "...", "timestamp": "<ISO-8601>" }`.
  Served unversioned at the root path (see D18 in
  [decisions.md](decisions.md)); it requires no authentication.

## Conventions (Planned)

These conventions are intended to apply once real application endpoints are
built. Apart from `GET /health` above, none of this is implemented yet.

- **Style:** REST over HTTP/JSON.
- **Base path:** all application endpoints under a versioned prefix, e.g.
  `/api/v1/...`. Exact prefix **unresolved** — not yet decided.
- **Resource naming:** plural nouns for collections (e.g.
  `/projects`, `/vendors`).
- **Auth:** endpoints other than `/health` will require authentication once
  implemented (see [../engineering/security.md](../engineering/security.md)).
  Not implemented yet.
- **Validation:** all request bodies validated at the API boundary before
  reaching business logic (e.g. via a schema validation library — specific
  library unresolved).
- **Error format:** a consistent JSON error shape (e.g.
  `{ error: { code, message } }`) is intended, but the exact shape is
  **unresolved**.
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
