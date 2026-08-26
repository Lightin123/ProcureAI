# API Design

**Status:** Planned conventions + current actual status. Only a `/health`
endpoint is planned for the current milestone; nothing is implemented yet.

## Current Status

No API endpoints are implemented. The first planned endpoint is:

- `GET /health` — returns a simple status payload confirming the Express
  backend is reachable. This is the target for the current milestone (see
  [../development-roadmap.md](../development-roadmap.md)).

## Conventions (Planned)

These conventions are intended to apply once real endpoints are built. None
of this is implemented yet.

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
