# API Design

**Status:** Planned conventions + current actual status. Health,
authentication, project, and requirement-analysis endpoints are implemented as
of Milestone 5; work-package vendor matching and shortlisting as of
Milestone 6, part 2; vendor invitation and notification as of Milestone 7;
response configuration and collection as of Milestone 8; and response
evaluation, comparison and the human procurement decision as of Milestone 9.
Every other endpoint group below is still planned.

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
  `{ data: { workPackage, run, recommendations, excluded, shortlist,
  invitations } }`, with `run: null` and empty arrays when the package has
  never been matched.
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
  not `CONFIRMED`, 409 `SUPPLIER_NOT_ASSESSED` if the supplier has not been
  ranked against this package, 409 `SUPPLIER_NOT_ELIGIBLE` if the eligibility
  gate excluded them, and `{ data: { created, shortlist } }` on success. Each
  successful add is written to `work_package_history` as `SHORTLISTED` with
  the acting official and the stated reason (D73).
- `DELETE /api/v1/work-packages/:workPackageId/vendor-matches/shortlist/:vendorProfileId`
  — returns `{ data: { removed: true, shortlist } }`, 404 if the supplier is
  not on this shortlist, or 409 `INVITATION_OPEN` while the supplier still
  holds a live invitation: the invitation must be withdrawn first, so the
  shortlist an invitation was issued from cannot disappear underneath it.
  Audited as `SHORTLIST_REMOVED`.

Milestone 7 adds three invitation endpoints on the same router, resolved
through the same organization-scoped lookup:

- `GET /api/v1/work-packages/:workPackageId/vendor-matches/invitations` —
  every invitation on this package: supplier, status, who issued it and when,
  the deadline, the response and its timestamp, the supplier's note, and the
  withdrawal reason where one applies.
- `POST /api/v1/work-packages/:workPackageId/vendor-matches/invitations` —
  body `{ vendorProfileId, message, responseDeadline }`, both optional and
  neither defaulted. Three preconditions, all server-side: the package is in
  the caller's organization (404 otherwise), the package is `CONFIRMED`
  (409 `WORK_PACKAGE_NOT_CONFIRMED`), and the supplier is on **this**
  package's shortlist (409 `SUPPLIER_NOT_SHORTLISTED`). A supplier already
  holding a live invitation gets 409 `INVITATION_ALREADY_OPEN`. Returns 201
  with `{ data: { invitation, invitations, shortlist } }`, and writes the
  supplier's portal notification in the same request (D74).
- `POST .../vendor-matches/invitations/:invitationId/withdraw` — body
  `{ reason }`. Only an invitation still awaiting a response can be
  withdrawn; one the supplier has accepted returns 409
  `INVITATION_NOT_OPEN`, because retracting it would erase a commitment the
  supplier made. The invitation is not deleted, and the supplier is notified.

An invitation id is checked against **both** the caller's organization and
the work package in the URL, so an id belonging to another department — or to
another package in the same department — is 404, not a successful withdrawal.

There is no vendor-facing route in this group, and none of the three
government permissions below is held by the `VENDOR` role: a supplier cannot
see the ranking they appear in or who they were ranked against.

### Supplier-facing invitations (Milestone 7)

Mounted at `/api/v1/vendor/invitations`, **before** `/api/v1/vendor`, which
would otherwise take the prefix. A deliberately separate router from the
government one (D76): the two sides see different fields, and one handler
serving both is one `if` away from serving a department's internal assessment
to the supplier it assessed.

- `GET /api/v1/vendor/invitations` — every invitation addressed to the
  caller's own supplier profile, newest first, answered and withdrawn ones
  included.
- `GET /api/v1/vendor/invitations/:invitationId` — one invitation: the
  issuing department, the project and its reference, the work package with
  its category, description, scope and deliverables, the deadline, the
  official's instructions, and the supplier's own recorded response. It
  carries **no rank, score, dimension breakdown, eligibility verdict,
  shortlist reason, or any other supplier**. Another supplier's invitation is
  404, never 403.
- `POST /api/v1/vendor/invitations/:invitationId/respond` — body
  `{ decision: "ACCEPTED" | "DECLINED", note }`. A decline without a stated
  reason is a 400: "why" is the part a department can act on. The transition
  is a conditional `UPDATE ... WHERE id = $1 AND vendor_profile_id = $2 AND
  status = 'INVITED'`, so ownership and the state check are one statement and
  a second answer returns 409 `INVITATION_NOT_OPEN` rather than overwriting
  the first (D75). Audited against the work package as
  `INVITATION_ACCEPTED` / `INVITATION_DECLINED`, attributed to the
  **supplier's** user.

The supplier profile is resolved from the session on every one of these. No
route reads a vendor id, an organization id or a profile id from the request;
an invitation id is the only thing the browser supplies, and it is only ever
used as half of a predicate whose other half is the session's own profile.

### Response configuration and workspace (Milestone 8)

Mounted at `/api/v1/work-packages/:workPackageId/responses`. Every route
resolves the work package through the caller's organization before doing
anything else, so cross-department access fails by omission.

- `GET .../responses/schema` — the section catalogue, the four response types,
  the answer types and the compliance positions. Served rather than duplicated
  in the frontend (D58/D79), so a section an official can switch on is exactly
  a section the server validates and the supplier is shown.
- `GET .../responses` — the workspace: the configuration and its questions,
  the confirmed requirements, every response with its vendor, type, status,
  submission moment and deadline, the status counts, and the invitations that
  could still produce a response.
- `PUT .../responses/config` — creates or replaces the configuration. 409
  `WORK_PACKAGE_NOT_CONFIRMED` unless the package is confirmed; 409
  `RESPONSE_ALREADY_SUBMITTED` if a supplier has submitted and the request
  changes the response type, a section mode or a document switch. The deadline
  and the instructions stay editable (D78).
- `POST .../responses/config/open` — `DRAFT -> OPEN`, and notifies every
  supplier with an `ACCEPTED` invitation, in the same request (D74). Second
  call returns 409 `RESPONSE_NOT_DRAFT`.
- `POST .../responses/config/close` — `OPEN -> CLOSED`. Submitted responses
  are untouched.
- `POST .../responses/config/questions` and
  `DELETE .../responses/config/questions/:questionId` — custom questions.
  Both refuse with 409 `RESPONSE_ALREADY_SUBMITTED` once anything has been
  submitted.
- `GET .../responses/:responseId` — the complete submitted response:
  requirement answers, every section value, custom answers, attachments, the
  clarification thread, and the same completeness computation the supplier
  saw. Returns 409 `RESPONSE_NOT_SUBMITTED` while the response is a draft
  (D83), and 404 for a response id belonging to another department or to
  another package in the same department.
- `GET .../responses/:responseId/documents/:documentId/content` — the
  attachment, always `Content-Disposition: attachment` with
  `X-Content-Type-Options: nosniff`, and never resolvable for a draft.
- `POST .../responses/:responseId/review` — `SUBMITTED | RESUBMITTED ->
  UNDER_REVIEW`; 409 `RESPONSE_NOT_REVIEWABLE` otherwise.
- `POST .../responses/:responseId/ready` — `UNDER_REVIEW ->
  READY_FOR_EVALUATION`; 409 `RESPONSE_NOT_UNDER_REVIEW` otherwise. Records
  that the response is complete enough to be assessed; it is not a score, a
  rank or an award.
- `POST .../responses/:responseId/clarifications` — records the question and
  moves the response to `CLARIFICATION_REQUESTED`, reopening it for the
  supplier.
- `POST .../responses/:responseId/clarifications/:clarificationId/answer` —
  answers a question the **supplier** raised. 409
  `CLARIFICATION_NOT_ANSWERABLE` for one the department raised itself or one
  already answered (D82).

### Response evaluation and decision (Milestone 9)

Mounted at `/api/v1/work-packages/:workPackageId/evaluation`. Government-side
only: none of its four permissions (`evaluation:read`, `evaluation:configure`,
`evaluation:manage`, `evaluation:decide`) is held by the `VENDOR` role, so a
supplier reaches none of these routes at all. Every route resolves the work
package through the caller's organization before doing anything else.

The order below is the workflow, and it is the order the trust boundary
requires: **AI analysis (advisory) -> deterministic evaluation -> ranked
recommendations -> human decision.**

- `GET .../evaluation/criteria-schema` — the criterion catalogue: the eight
  criterion types, what each is scored from, which response section it needs,
  whether it takes a threshold, the presets per response type, the compliance
  vocabulary, and the current `scoringVersion`. Served rather than duplicated
  in the frontend, so a criterion an official can configure is exactly a
  criterion the server can score.
- `GET .../evaluation` — the workspace: the response configuration in force,
  the department's own questions, the confirmed requirement count, the
  evaluation criteria and any consistency problems with them, every response
  with its status, eligibility verdict from the last matching run and whether
  an advisory reading exists, the newest run with its results, and every
  decision recorded.
- `PUT .../evaluation/config` — creates or replaces the criteria. 409
  `WORK_PACKAGE_NOT_CONFIRMED` unless the package is confirmed; 409
  `RESPONSE_NOT_CONFIGURED` if nothing has been asked of suppliers; 400
  `VALIDATION_ERROR` for a `questionId` that is not on **this** work package's
  response form. An internally inconsistent set is stored as `DRAFT` with the
  problems returned alongside it and cannot be run; a consistent one is stored
  as `READY`. Saving bumps `criteriaVersion` and is audited.
- `POST .../evaluation/run` — scores every response in `READY_FOR_EVALUATION`
  against the stored criteria and records the run with a frozen copy of them.
  409 `EVALUATION_NOT_CONFIGURED`, `EVALUATION_CRITERIA_INCONSISTENT` (with the
  problems in `details`) or `NO_RESPONSES_READY`. Responses in any other state
  are stored with the reason they were not assessed. A run never overwrites an
  earlier one.
- `GET .../evaluation/runs` and `GET .../evaluation/runs/:runId` — the audit
  trail of scoring: every run, and any one of them exactly as recorded, with
  the criteria it applied and the scores it produced. A run id belonging to
  another work package returns 404.
- `GET .../evaluation/comparison[?runId=]` — the side-by-side comparison, built
  from one stored run so what is compared is exactly what was calculated.
  Carries per supplier the criterion scores, the requirement-by-requirement
  findings, the structured figures, the eligibility verdict **read from the
  Milestone 6 matching run rather than re-derived**, the latest advisory
  reading, and any decision. 409 `NO_EVALUATION_RUN` before the first run.
- `GET .../evaluation/responses/:responseId` — one response's full evaluation:
  the criterion decomposition with each score's basis and evidence, the
  compliance table, the missing information, the calculated strengths and gaps,
  every advisory reading generated for it, and any decision. 409
  `RESPONSE_NOT_SUBMITTED` for a draft (D83); 404 for a response belonging to
  another department or another package.
- `POST .../evaluation/responses/:responseId/ai-analysis` — asks the AI service
  to read the response and records the result in its own append-only table. It
  produces no score, no rank and no recommendation, and changes none. 502
  `AI_OUTPUT_INVALID` if the model returns something that fails validation, 503
  `AI_SERVICE_UNAVAILABLE` if the service cannot be reached — neither of which
  affects any stored score.
- `GET .../evaluation/responses/:responseId/ai-analysis` — every reading
  generated for that response, newest first. Nothing is ever replaced.
- `POST .../evaluation/decisions` — records the decision an official made:
  `{ responseId, decision: SELECTED | REJECTED, reason, evaluationRunId }`. The
  reason is mandatory and must be at least a sentence. The rank and score are
  read server-side out of the cited run, never taken from the body. 409
  `SELECTION_EXISTS` if a supplier is already selected for this package, 409
  `ALREADY_DECIDED` if this response already carries a live decision, 404 for a
  run id belonging to another package. **Nothing else in the API writes this
  table**: no evaluation, ranking or AI call produces a decision.
- `POST .../evaluation/decisions/:decisionId/revoke` — revokes a live decision
  with its own mandatory reason. The original row and reason are untouched; 409
  `DECISION_NOT_ACTIVE` for one already revoked.
- `GET .../evaluation/decisions` — every decision on the package, live and
  revoked.

### Supplier-facing responses (Milestone 8)

Mounted at `/api/v1/vendor/responses`, **before** `/api/v1/vendor`, and a
deliberately separate router from the government one (D76/D85). The supplier
profile is resolved from the session on every request and applied in SQL; a
response id is the only thing the browser supplies.

- `GET /api/v1/vendor/responses` — every response addressed to this supplier.
- `POST /api/v1/vendor/responses` — body `{ invitationId }`. Opens the draft,
  or resumes the one already open against that invitation — idempotent, so a
  supplier pressing the button twice resumes rather than duplicating. Refusals
  are specific: 404 for an invitation that is not this supplier's, 409
  `INVITATION_NOT_ACCEPTED`, 409 `RESPONSE_NOT_CONFIGURED`, 409
  `RESPONSE_NOT_OPEN`.
- `GET /api/v1/vendor/responses/:responseId` — the whole workspace: the terms,
  the section catalogue, the confirmed requirements, the supplier's own draft
  and answers, its attachments, the clarification thread, and the server's
  completeness computation.
- `PATCH /api/v1/vendor/responses/:responseId` — saves part of a draft. Keys
  are looked up in the field catalogue and refused if absent, so no request
  can name a column. 409 `RESPONSE_NOT_EDITABLE` outside `DRAFT` and
  `CLARIFICATION_REQUESTED`; 409 `RESPONSE_CLOSED` where the department has
  closed collection.
- `PUT .../responses/:responseId/requirements/:requirementId` and
  `PUT .../responses/:responseId/questions/:questionId` — one requirement
  answer and one custom answer. Both resolve the target through the response's
  own work package or configuration inside the write, so an id from elsewhere
  matches nothing. A custom answer is checked against the shape its question
  declared.
- `POST .../responses/:responseId/documents`,
  `DELETE .../responses/:responseId/documents/:documentId`,
  `GET .../responses/:responseId/documents/:documentId/content` — attachments.
  Uploads arrive base64-encoded in the JSON body (D59) and go through the one
  storage module; 409 `DOCUMENTS_NOT_ACCEPTED` where the department disallowed
  them.
- `POST .../responses/:responseId/submit` — validates everything mandatory
  server-side from the department's stored configuration and refuses with 400
  `RESPONSE_INCOMPLETE` and the list of missing items. 409
  `RESPONSE_DEADLINE_PASSED` after the stated day, unless the department has
  asked for a clarification. 400 `CLARIFICATION_UNANSWERED` while a
  departmental question is outstanding. `DRAFT -> SUBMITTED` or
  `CLARIFICATION_REQUESTED -> RESUBMITTED`, decided by the statement itself.
- `POST .../responses/:responseId/withdraw` — reason required. Not a delete;
  409 `RESPONSE_NOT_WITHDRAWABLE` once ready for evaluation.
- `POST .../responses/:responseId/clarifications` — asks the department a
  question; 409 `CLARIFICATIONS_NOT_ALLOWED` where the department disallowed
  them, read from the configuration inside the write.
- `POST .../responses/:responseId/clarifications/:clarificationId/answer` —
  answers a question the **department** raised.

### Supplier notifications (extended in Milestone 7)

- `GET /api/v1/vendor/notifications` — the caller's own notifications.
- `GET /api/v1/vendor/notifications/summary` — the unread count, the most
  recent few, and the number of invitations awaiting a response. Separate
  from the dashboard because the header bell is on every page of the supplier
  portal and must not pull the whole workspace to render a number.
- `POST /api/v1/vendor/notifications/read` — marks all read.
- `POST /api/v1/vendor/notifications/:notificationId/read` — marks one read,
  which is what opening a notification does. The owning profile is part of
  the `WHERE` clause rather than checked before it, so another supplier's
  notification updates nothing and returns 404.

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
| `GET .../vendor-matches/invitations` | `vendor:matching:read` |
| `POST .../vendor-matches/invitations` | `vendor:invitation:manage` |
| `POST .../vendor-matches/invitations/:invitationId/withdraw` | `vendor:invitation:manage` |
| `GET /api/v1/vendor/invitations` | `vendor:invitation:read` |
| `GET /api/v1/vendor/invitations/:invitationId` | `vendor:invitation:read` |
| `POST /api/v1/vendor/invitations/:invitationId/respond` | `vendor:invitation:respond` |
| `GET .../responses/schema` | `response:read` |
| `GET .../responses` | `response:read` |
| `GET .../responses/:responseId` | `response:read` |
| `GET .../responses/:responseId/documents/:documentId/content` | `response:read` |
| `PUT .../responses/config` | `response:configure` |
| `POST .../responses/config/open` | `response:configure` |
| `POST .../responses/config/close` | `response:configure` |
| `POST .../responses/config/questions` | `response:configure` |
| `DELETE .../responses/config/questions/:questionId` | `response:configure` |
| `POST .../responses/:responseId/review` | `response:manage` |
| `POST .../responses/:responseId/ready` | `response:manage` |
| `POST .../responses/:responseId/clarifications` | `response:manage` |
| `POST .../responses/:responseId/clarifications/:clarificationId/answer` | `response:manage` |
| `GET /api/v1/vendor/responses` | `vendor:response:read` |
| `GET /api/v1/vendor/responses/:responseId` | `vendor:response:read` |
| `GET /api/v1/vendor/responses/:responseId/documents/:documentId/content` | `vendor:response:read` |
| `POST /api/v1/vendor/responses` | `vendor:response:submit` |
| `PATCH /api/v1/vendor/responses/:responseId` | `vendor:response:submit` |
| `PUT /api/v1/vendor/responses/:responseId/requirements/:requirementId` | `vendor:response:submit` |
| `PUT /api/v1/vendor/responses/:responseId/questions/:questionId` | `vendor:response:submit` |
| `POST /api/v1/vendor/responses/:responseId/documents` | `vendor:response:submit` |
| `DELETE /api/v1/vendor/responses/:responseId/documents/:documentId` | `vendor:response:submit` |
| `POST /api/v1/vendor/responses/:responseId/submit` | `vendor:response:submit` |
| `POST /api/v1/vendor/responses/:responseId/withdraw` | `vendor:response:submit` |
| `POST /api/v1/vendor/responses/:responseId/clarifications` | `vendor:response:submit` |
| `POST /api/v1/vendor/responses/:responseId/clarifications/:clarificationId/answer` | `vendor:response:submit` |
| `GET /api/v1/vendor/notifications/summary` | `vendor:profile:read` |
| `POST /api/v1/vendor/notifications/:notificationId/read` | `vendor:profile:manage` |

`vendor:matching:read` and `response:read` are held by Government Officials
and Administrators; `vendor:shortlist:manage`, `vendor:invitation:manage`,
`response:configure` and `response:manage` by Government
Officials **only** — shortlisting and inviting are procurement acts and
Administrators are oversight-only (D48/D60). `vendor:invitation:read` and
`vendor:invitation:respond`, `vendor:response:read` and
`vendor:response:submit` are held by Vendors **only**, so the side that issued
an invitation cannot answer it or write the response to it, and the side that
answers cannot see how it was selected or how its response is being reviewed.
No role holds both halves.

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
  `WORK_PACKAGE_DELETED` (409), the Milestone 9 codes
  `EVALUATION_NOT_CONFIGURED` (409), `EVALUATION_CRITERIA_INCONSISTENT` (409),
  `NO_RESPONSES_READY` (409), `NO_EVALUATION_RUN` (409), `SELECTION_EXISTS`
  (409), `ALREADY_DECIDED` (409) and `DECISION_NOT_ACTIVE` (409), and the
  authentication codes below.
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
- `Vendors` — vendor discovery, vendor profile access, shortlisting and
  **vendor invitation with the supplier's accept/decline** are implemented
  (above).
- `Audit` — audit log retrieval (admin-scoped). Work-package events are
  already readable through the work-package history endpoint; a
  cross-organization audit surface is not built.

`Submissions` and `Evaluations` are no longer planned groups: they are
implemented above as the response and evaluation routers.

## Backend <-> AI Service Communication (Planned)

- The Express backend calls the FastAPI AI service over HTTP.
- Request/response payloads on the AI service side are validated via
  Pydantic models.
- The AI service is not exposed to the frontend directly (see
  [architecture.md](architecture.md)).
- Implemented as `POST /internal/v1/requirement-analysis`,
  `/internal/v1/work-package-decomposition`,
  `/internal/v1/vendor-capability-insights`,
  `/internal/v1/response-evaluation-insights` and `/internal/v1/embeddings` on
  the AI service. Request and response are Pydantic-validated there, and every
  response is **re-validated with zod** in Express before anything is persisted
  — AI output is never trusted on a single validation (NFR2).
- The response-evaluation call is the one that touches a procurement decision,
  and its schema carries no score, rank, weight or recommendation field on
  either side of the boundary. The deterministic evaluation reads nothing it
  returns.
- Invalid AI output produces 502 `AI_OUTPUT_INVALID`; an unreachable service
  produces 503 `AI_SERVICE_UNAVAILABLE`.
- The AI service binds to `127.0.0.1` only and has no authentication of its
  own; Express is its sole caller.

## Related Documents

- [architecture.md](architecture.md)
- [../engineering/security.md](../engineering/security.md)
- [../development-roadmap.md](../development-roadmap.md)
