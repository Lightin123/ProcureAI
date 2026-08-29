# API Design

**Status:** Planned conventions + current actual status. Health,
authentication, project, and requirement-analysis endpoints are implemented as
of Milestone 5, and work-package vendor matching and shortlisting as of
Milestone 6, part 2; every other endpoint group below is still planned.

## Current Status

Implemented endpoints:

- `GET /health` — public **liveness probe**. Returns HTTP 200 with
  `{ status, service, timestamp }` and nothing else. Served unversioned at the
  root path (see D18 in [decisions.md](decisions.md)); **the only endpoint that
  requires no authentication.** It deliberately reports nothing about internal
  infrastructure — those diagnostics moved behind authentication in D54.
- `GET /api/v1/system/status` — authenticated infrastructure diagnostics,
  requiring `system:status:read` (Government Officials and Administrators, not
  Vendors). Returns `{ service, milestone, database, aiService, aiProvider,
  aiModel, checkedAt }`. A successful response also proves the API is
  reachable, so the portal's System Status page needs no separate liveness
  call.

Authentication endpoints (Milestone 5):

- `POST /api/v1/auth/login` — accepts `{ email, password }`. On success
  returns 200 with `{ data: { user } }` and sets the `procureai_session`
  cookie (`HttpOnly`, `SameSite=Strict`). Returns 401 `INVALID_CREDENTIALS`
  for an unknown email, a wrong password, or a disabled account — identically
  in all three cases, so the endpoint does not reveal whether an address
  exists. Returns 429 `TOO_MANY_ATTEMPTS` after 5 failures per email + IP
  within 15 minutes.
- `POST /api/v1/auth/logout` — revokes the session server-side and clears the
  cookie. Idempotent: returns 200 `{ data: { loggedOut: true } }` even with no
  session.
- `GET /api/v1/auth/me` — returns the authenticated user, including a
  backend-computed `permissions` array the frontend uses for rendering only.
  Returns 401 `UNAUTHENTICATED` with no cookie, or 401 `SESSION_EXPIRED` when
  a cookie is presented but its session is expired, revoked, or belongs to a
  disabled user.

The user payload is:

```json
{
  "id": "uuid",
  "fullName": "A. Sharma",
  "email": "official@procureai.local",
  "role": "GOVERNMENT_OFFICIAL",
  "roleLabel": "Government Official",
  "organizationId": "uuid",
  "organizationName": "Department of Infrastructure Development",
  "organizationKind": "GOVERNMENT",
  "permissions": ["project:create", "project:read", "..."]
}
```

It never contains a password hash; no response DTO has a field for one.

Project endpoints (all organization-scoped to the authenticated user):

- `GET /api/v1/projects` — lists procurement projects for the authenticated
  user's organization, newest first. Returns `{ "data": [...] }`.
- `GET /api/v1/projects/:id` — returns a single project as `{ "data": {...} }`,
  or 404 if it does not exist or belongs to another organization.
- `POST /api/v1/projects` — creates a project from `{ title, problemDescription }`.
  Returns 201 with the created project; 400 with per-field details when
  validation fails. New projects are created in the `DRAFT` workflow state.

Requirement analysis endpoints (all nested under a project, all
organization-scoped):

- `GET /api/v1/projects/:id/requirements` — returns requirements,
  clarification questions, analysis-run history, and stage history.
- `POST /api/v1/projects/:id/requirements/analysis` — runs AI analysis
  synchronously (60s timeout, D30). Persists suggestions, records the run,
  and moves a `DRAFT` project to `REQUIREMENTS_ANALYSIS`. Returns 409 if the
  project is past that stage; 503 `AI_SERVICE_UNAVAILABLE` if the AI service
  cannot be reached, with the run recorded as `FAILED`.
- `POST /api/v1/projects/:id/requirements` — adds a requirement manually
  (recorded as `MANUAL`, immediately `ACCEPTED`).
- `PATCH /api/v1/projects/:id/requirements/:requirementId` — accepts, edits,
  or rejects. Rejection **requires** a reason; editing preserves the AI's
  original wording in `original_text`.
- `POST /api/v1/projects/:id/requirements/clarifications/:questionId/answer`
- `POST /api/v1/projects/:id/requirements/confirm` — requires at least one
  accepted requirement (409 `NO_ACCEPTED_REQUIREMENTS`); returns the count of
  still-unanswered clarifications as a warning (D33).
- `POST /api/v1/projects/:id/requirements/reopen` — returns a confirmed
  project to `REQUIREMENTS_ANALYSIS` (D34).

Work-package vendor matching endpoints (Milestone 6, part 2; all nested
under a work package, all organization-scoped). The router is mounted at
`/api/v1/work-packages/:workPackageId/vendor-matches` **above** the direct
work-packages router, so the more specific path wins. All five resolve the
work package through SQL joined on
`procurement_projects.organization_id`, taking the organization from the
session:

- `GET /api/v1/work-packages/:workPackageId/vendor-matches` — returns the
  **last stored run without recomputing anything**. Revisiting a package is a
  read: no retrieval, no embedding work, no new run row. Responds
  `{ data: { workPackage, run, recommendations, excluded, shortlist } }`,
  with `run: null` and empty arrays when the package has never been matched.
- `POST /api/v1/work-packages/:workPackageId/vendor-matches` — runs the
  pipeline ("Find Suitable Vendors", and the same route recalculates when
  supplier or requirement data has moved on). Same response shape plus
  `matchingRequirements: { mandatoryCertifications, requiredRegions,
  estimatedValueCeilingInr, capabilityTerms }`, so an official can see which
  constraints the run gated on. Returns 409 `WORK_PACKAGE_NOT_CONFIRMED` when
  the package is not `CONFIRMED`, and 409 `WORK_PACKAGE_DELETED` when it has
  been soft-deleted. `excluded` carries suppliers the eligibility gate ruled
  out, with their ground for exclusion, rather than dropping them (D68).
- `GET /api/v1/work-packages/:workPackageId/vendor-matches/:vendorProfileId`
  — one supplier in the context of this package:
  `{ data: { vendor, offerings, experience, credentials, capacity,
  assessment } }`, where `assessment` is that supplier's row from the last
  stored run, or `null`. It deliberately **excludes contact details and the
  supplier's private onboarding answers** — an official deciding needs the
  evidence bearing on this package, not the whole profile.
- `POST /api/v1/work-packages/:workPackageId/vendor-matches/shortlist` —
  body `{ vendorProfileId, reason }`. The rank and score recorded against the
  entry are read server-side from the stored run and are never accepted from
  the body, so a shortlist record cannot assert a score the system did not
  produce (D69). Returns 409 `WORK_PACKAGE_NOT_CONFIRMED` if the package is
  not `CONFIRMED`, and `{ data: { created, shortlist } }` on success.
- `DELETE /api/v1/work-packages/:workPackageId/vendor-matches/shortlist/:vendorProfileId`
  — returns `{ data: { removed: true, shortlist } }`, or 404 if the supplier
  is not on this shortlist.

There is no vendor-facing route in this group, and neither permission below
is held by the `VENDOR` role: a supplier cannot see the ranking they appear
in or who they were ranked against.

**Every `/api/v1` endpoint requires an authenticated session.**
`requireAuth` is mounted on the `/api/v1` prefix rather than per route (D52),
so protection is structural: a route added by a later milestone is
authenticated whether or not its author remembered. Each route additionally
declares a permission via `requirePermission(...)` (D47), and the acting user
is resolved from the session with `getCurrentUser(request)` (D53) — the
seeded-official resolver of D21 is gone.

Endpoints return 503 `DATABASE_NOT_CONFIGURED` when `DATABASE_URL` is unset,
so the service still starts, `/health` still answers, and
`/api/v1/system/status` reports the database as unavailable rather than the
portal failing opaquely.

Permissions required by the implemented endpoints:

| Endpoint | Permission |
|---|---|
| `GET /api/v1/projects` | `project:read` |
| `GET /api/v1/projects/:id` | `project:read` |
| `POST /api/v1/projects` | `project:create` |
| `GET .../requirements` | `requirements:read` |
| `POST .../requirements/analysis` | `requirements:analyze` |
| `POST .../requirements` | `requirements:decide` |
| `PATCH .../requirements/:requirementId` | `requirements:decide` |
| `POST .../requirements/clarifications/:questionId/answer` | `clarification:answer` |
| `POST .../requirements/confirm` | `workflow:transition` |
| `POST .../requirements/reopen` | `workflow:transition` |
| `GET /api/v1/system/status` | `system:status:read` |
| `GET .../vendor-matches` | `vendor:matching:read` |
| `POST .../vendor-matches` | `vendor:matching:read` |
| `GET .../vendor-matches/:vendorProfileId` | `vendor:matching:read` |
| `POST .../vendor-matches/shortlist` | `vendor:shortlist:manage` |
| `DELETE .../vendor-matches/shortlist/:vendorProfileId` | `vendor:shortlist:manage` |

`vendor:matching:read` is held by Government Officials and Administrators;
`vendor:shortlist:manage` by Government Officials **only** — shortlisting is
a procurement act and Administrators are oversight-only (D48/D60). Vendors
hold neither.

Organization scoping is unchanged and remains authoritative: the organization
comes from the session, never from the request, and a project — or a work
package reached through one — belonging to another organization returns
**404**, not 403. For the matching routes this is structural rather than
per-handler: every one of them resolves the work package through the
organization-scoped lookup before doing anything else, so cross-organization
access fails by omission rather than by each handler remembering to check.

## Conventions (Planned)

These conventions apply to application endpoints. Those marked implemented
above already follow them; the remainder are planned.

- **Style:** REST over HTTP/JSON.
- **Base path:** all application endpoints under `/api/v1` (D23). `/health`
  is deliberately excluded and stays unversioned (D18).
- **Resource naming:** plural nouns for collections (e.g.
  `/projects`, `/vendors`).
- **Auth:** every endpoint other than `/health` requires an authenticated
  session cookie, and each declares the permission it needs (see
  [../engineering/security.md](../engineering/security.md)).
- **Success envelope:** successful responses wrap the payload in
  `{ "data": ... }`.
- **Validation:** all request bodies validated at the API boundary with
  `zod` (D25) before reaching business logic.
- **Error format:** `{ error: { code, message, details? } }` (D24).
  `details` is an array of `{ field, message }` for validation failures.
  Codes in use: `VALIDATION_ERROR`, `NOT_FOUND`, `DATABASE_NOT_CONFIGURED`,
  `INTERNAL_ERROR`, `AI_SERVICE_UNAVAILABLE`, `AI_SERVICE_ERROR`,
  `AI_OUTPUT_INVALID`, `INVALID_STATE_TRANSITION`,
  `NO_ACCEPTED_REQUIREMENTS`, `WORK_PACKAGE_NOT_CONFIRMED` (409),
  `WORK_PACKAGE_DELETED` (409), and the authentication codes below.
  (`SEED_DATA_MISSING` was removed in Milestone 5 along with the seeded
  identity resolver.)

  | Code | HTTP | Meaning |
  |---|---|---|
  | `UNAUTHENTICATED` | 401 | No session cookie was presented |
  | `SESSION_EXPIRED` | 401 | A cookie was presented but its session is expired, revoked, or belongs to a disabled user |
  | `INVALID_CREDENTIALS` | 401 | Login failed; identical for unknown email, wrong password, and disabled account |
  | `FORBIDDEN` | 403 | Authenticated, but the role lacks the required permission |
  | `TOO_MANY_ATTEMPTS` | 429 | Login rate limit tripped |
  | `INVALID_ORIGIN` | 403 | A state-changing request declared a disallowed `Origin` |

  A `FORBIDDEN` message deliberately does not name the missing permission,
  which would let a caller map the authorization model; the requirement is
  logged server-side instead.
- **Status codes:** standard HTTP status codes used semantically (2xx
  success, 4xx client error, 5xx server error).

## Planned Endpoint Groups (Not Implemented)

Grouped by the functional areas in
[../product/requirements.md](../product/requirements.md). Exact routes,
methods, and payloads are not yet designed.

- `Projects` — procurement project CRUD and stage transitions.
- `Requirements` — structured requirement CRUD, approval actions.
- `Clarifications` — clarification question/answer endpoints.
- `Work Packages` — work package CRUD.
- `Vendors` — vendor discovery and vendor profile access are **implemented**
  for work-package matching (above); vendor invitation is not.
- `Submissions` — RFI/proposal submission endpoints.
- `Evaluations` — evaluation and ranking retrieval.
- `Audit` — audit log retrieval (admin-scoped).

## Backend <-> AI Service Communication (Planned)

- The Express backend calls the FastAPI AI service over HTTP.
- Request/response payloads on the AI service side are validated via
  Pydantic models.
- The AI service is not exposed to the frontend directly (see
  [architecture.md](architecture.md)).
- Implemented as `POST /internal/v1/requirement-analysis` on the AI service.
  Request and response are Pydantic-validated there, and the response is
  **re-validated with zod** in Express before anything is persisted — AI
  output is never trusted on a single validation (NFR2).
- Invalid AI output produces 502 `AI_OUTPUT_INVALID`; an unreachable service
  produces 503 `AI_SERVICE_UNAVAILABLE`.
- The AI service binds to `127.0.0.1` only and has no authentication of its
  own; Express is its sole caller.

## Related Documents

- [architecture.md](architecture.md)
- [../engineering/security.md](../engineering/security.md)
- [../development-roadmap.md](../development-roadmap.md)
