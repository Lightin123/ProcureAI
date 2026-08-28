# Security

**Status:** Authentication and role-based authorization are **implemented**
as of Milestone 5. Every `/api/v1` endpoint requires an authenticated session;
`GET /health` remains deliberately public (D18) but is a bare liveness probe
that reports nothing about internal infrastructure (D54). This document
describes the implemented architecture, the threats it addresses, and the
limitations it accepts.

## Authentication Architecture

**Opaque server-side sessions stored in PostgreSQL, delivered in an HttpOnly
cookie** (D44). There is no JWT, no client-stored token, and no third-party
identity provider.

| Element | Implementation |
|---|---|
| Token | 32 bytes from `crypto.randomBytes`, base64url-encoded (43 characters) |
| Storage | The SHA-256 hash of the token in `user_sessions.token_hash`; the token itself is never persisted |
| Cookie | `procureai_session`; `HttpOnly`, `SameSite=Strict`, `Path=/`, host-only, `Secure` when `SESSION_COOKIE_SECURE=true` (defaults on under `NODE_ENV=production`) |
| Idle expiry | 60 minutes, slid forward on use but never past the absolute cap; written at most once per minute |
| Absolute expiry | 12 hours, not extendable |
| Revocation | `revoked_at` set on logout and on a fresh login for the same user |
| Validity | `revoked_at IS NULL AND expires_at > now() AND absolute_expires_at > now() AND users.is_active` |

Alternatives considered and rejected (D44): a JWT in a cookie (cannot be
revoked without a denylist that reinstates the database read it was meant to
avoid); a JWT in `localStorage` (readable by injected script); `express-session`
with `connect-pg-simple` (opaque behaviour in the subsystem that most needs to
be auditable, for two extra dependencies); and an external identity provider
(a third-party dependency and network requirement for a system that must
demonstrate offline, and an unsuitable custodian for government identity).

### Passwords

`scrypt` from `node:crypto` with N=16384, r=8, p=1, a 32-byte derived key and a
16-byte random salt per password (D45). Hashes are stored as
`scrypt$N$r$p$salt$key`, so parameters can be raised later without invalidating
existing credentials. Comparison uses `crypto.timingSafeEqual`.

`password_hash` is read by exactly one function —
`findUserCredentialsByEmail` in `src/repositories/users.ts` — which is called
only by the login handler. No response DTO has a field it could occupy, and
there is no `SELECT *` anywhere in the codebase.

### Session lifecycle

- **Login** revokes any live sessions for that user, deletes sessions expired
  more than seven days ago, inserts a new row, and sets a fresh cookie.
- **Logout** sets `revoked_at` server-side before responding, so a copied
  cookie is dead regardless of whether the browser honours the clearing
  header. Logging out without a session succeeds rather than erroring.
- **Expiry, revocation, or a disabled user** produce 401 `SESSION_EXPIRED` and
  clear the cookie. Because `is_active` is part of the lookup predicate,
  disabling an account takes effect on its next request without having to find
  its sessions.
- Sessions live in PostgreSQL, so they survive an API restart.

## Authorization

Three roles, one per user, as the `user_role` enum (D46):
`GOVERNMENT_OFFICIAL`, `ADMIN`, `VENDOR`. Full responsibilities and the
permission matrix are in
[../product/users-and-roles.md](../product/users-and-roles.md).

Authorization is **permission-based, never role-based at the call site**
(D47). Routes declare `requirePermission("...")`; `ROLE_PERMISSIONS` in
`src/auth/permissions.ts` is the single mapping from role to permissions. The
whole authorization model can therefore be audited by reading one table.

**Administrators are oversight-only** (D48): read access across their
organization, but no permission to analyse, decide on requirements, answer
clarifications, or transition a workflow stage. A procurement decision must
remain attributable to the government official who made it.

**Vendors hold no procurement permission at all**, and no
`system:status:read` either. They are not restricted by a check that could be
bypassed — there is no grant to bypass.

Frontend routes and navigation entries are filtered by the same permissions,
but that is a usability measure. Where a screen displays server data, the
endpoint behind it enforces the same permission — the System Status page is
the worked example: gating the page alone would have left its data readable by
anyone (D54).

### Organization scope

`request.user.organizationId` is derived from the session's user row. No
request schema accepts an organization, role, or user id, and `zod` strips
unknown keys, so sending one has no effect. Every project query filters on the
organization in SQL, so a project belonging to another organization is never
loaded. Cross-organization access returns **404, not 403** — 403 would confirm
that a resource with that id exists elsewhere.

### Structural protection

`requireAuth` is mounted on the `/api/v1` prefix rather than on individual
routes (D52), so authentication **fails closed**: any route mounted under that
prefix by a later milestone is authenticated whether or not its author
remembered. `GET /health` is registered before that mount and stays public.

## Threat Model

| Threat | Mitigation | Enforced at |
|---|---|---|
| IDOR / cross-organization access | Every project query filters on the session's `organization_id` in SQL; a foreign project is never loaded. Returns 404, not 403 | `repositories/projects.ts` |
| Client-supplied role spoofing | Role comes from the session's user row; no schema accepts a role field and `zod` strips unknown keys | `middleware/auth.ts` |
| Client-supplied organization spoofing | Same — organization comes only from the session-resolved user row | `middleware/auth.ts` |
| Plaintext password storage | `scrypt` with a per-password salt; plaintext exists only inside the login handler and is never logged or persisted | `auth/password.ts` |
| Password hash exposure | Selected by one repository function used only by login; no `SELECT *`; no DTO field for it | `repositories/users.ts` |
| Session token theft from the database | Only the SHA-256 hash is stored, so a dump yields nothing replayable | `repositories/sessions.ts` |
| Session theft via XSS | `HttpOnly` — script cannot read the cookie. Nothing auth-related is kept in `localStorage` or `sessionStorage` | Cookie attributes |
| Session fixation | No pre-authentication session exists and no caller can propose a token; login always mints a new one and revokes the previous | `routes/auth.ts` |
| Weak logout | Server-side revocation before responding; independent of the browser honouring the clearing header | `repositories/sessions.ts` |
| CSRF | `SameSite=Strict`, plus an `Origin` check on state-changing methods, plus a JSON content-type requirement no cross-site form can meet (D51) | Cookie attributes + `requireSameOrigin` |
| Authentication bypass through an unprotected route | `requireAuth` mounted at the prefix, so protection is structural rather than per-route (D52) | `src/index.ts` |
| Vendor access to government endpoints | The vendor role holds no project, requirement, workflow, or system-diagnostics permission | `auth/permissions.ts` |
| Unauthorized workflow transitions | `workflow:transition` is held only by officials; existing state-machine guards (409 `INVALID_STATE_TRANSITION`) are unchanged, so both actor and source state are enforced | route + repository |
| Credential stuffing / brute force | 5 attempts per email + IP per 15 minutes; `scrypt`'s cost makes offline attack on a stolen hash expensive | `middleware/rateLimit.ts` |
| Account enumeration | Unknown email, wrong password, and disabled account produce an identical status, code, message, and amount of work (a dummy hash is verified when no user matches) | `routes/auth.ts` |
| Privileged action by a disabled account | `is_active` is part of the session lookup predicate | `repositories/sessions.ts` |
| Information disclosure via the public health endpoint | `GET /health` returns only `{ status, service, timestamp }`. Database state, AI-service state, and the third-party provider and model names require authentication and `system:status:read` (D54) | `routes/health.ts`, `routes/system.ts` |
| Secrets in git | Only `SEED_DEMO_PASSWORD` is introduced, in the already-gitignored `.env`; `.env.example` carries an empty placeholder. Opaque sessions need no signing secret |`.gitignore`, `.env.example` |

## Development and Demo Credentials

`npm run seed` provisions four demo accounts across three organizations and
resets their password on every run — see
[../development-roadmap.md](../development-roadmap.md) for the accounts and
the reset procedure.

- The password comes from `SEED_DEMO_PASSWORD` in `apps/api/.env`, which is
  gitignored. `.env.example` carries an empty placeholder, never a working
  value.
- If the variable is unset the script generates a random password, prints it
  once, and stores it nowhere. There is no silent default that could survive
  into a deployment.
- The script **refuses to run when `NODE_ENV=production`** and exits non-zero.
- Seeded passwords must be at least 12 characters.
- The login screen's demo-account panel is guarded by `import.meta.env.DEV`
  and is absent from a production build (verified against the built bundle).

## Input Validation

Unchanged from Milestone 3 and still authoritative: every request body is
validated at the API boundary with `zod` (D25) before reaching business logic,
and malformed input is rejected with a structured `VALIDATION_ERROR` (D24).
Login credentials are validated the same way, but the login form deliberately
gives no password-policy feedback, which would be an information leak.

## Audit Trail

Every state-changing action is attributable to the authenticated user who
performed it. `procurement_projects.created_by`,
`requirement_analysis_runs.triggered_by`, `project_requirements.decided_by`,
`clarification_questions.answered_by`, and `project_stage_history.actor_id`
now carry a real authenticated identity rather than a seeded constant (D50,
D53). `users.last_login_at` records authentication itself.

A general audit log (FR11) still does not exist; whether authentication events
warrant their own table is U31.

## AI-Specific Considerations

Unchanged from Milestone 3:

- **Prompt injection.** A project's problem description is official-supplied
  text placed into an LLM prompt. The system prompt instructs the model to
  treat it strictly as data, and the required output schema constrains what
  can be returned — enforced by structured outputs on Anthropic and by JSON
  mode plus validation and a bounded retry on OpenAI-compatible providers
  (D40). The decisive control remains that nothing AI-generated enters
  confirmed state without human approval.
- **Double validation.** AI output is validated by Pydantic in the AI service
  and re-validated with `zod` in Express before persistence (NFR2).
- **Service exposure.** The AI service binds to `127.0.0.1` only and has no
  authentication of its own; Express is its sole caller and the frontend never
  reaches it. If it is ever bound to a routable interface it will need its own
  authentication first.

## Secrets

The database connection string and `SEED_DEMO_PASSWORD` live in
`apps/api/.env`; the LLM credential (`AI_API_KEY`, or `ANTHROPIC_API_KEY` for
Anthropic) lives in `apps/ai-service/.env`. Both files are excluded by
`.gitignore` and must never be committed or logged.

The OpenAI-compatible settings are namespaced `AI_*` rather than `OPENAI_*`
specifically so an unrelated ambient `OPENAI_API_KEY` on a developer machine
is never picked up and sent to a different provider's endpoint (D39).

## Accepted Limitations

Recorded rather than omitted. None is a defect; each is a scope decision.

- **The login rate limiter is in-process.** It resets on restart and would not
  hold across multiple instances. Correct for a single-process deployment;
  inadequate for real multi-instance deployment.
- **No multi-factor authentication**, no password rotation policy, no
  persistent account lockout, and no self-service password reset (U30).
- **No administrator user-management UI.** `user:manage` and `audit:read` are
  defined and granted to ADMIN but have no endpoints yet.
- **Passwords are held by the application.** A real government deployment
  would federate to an official identity provider rather than store
  credentials at all. This implementation is a demonstrable stand-in.
- **No general audit log** (U31); `project_stage_history` and `last_login_at`
  are what exist.
- **`SameSite=Strict` assumes a same-origin deployment.** In local development
  the frontend reaches the API through the Vite proxy (D17), so every request
  is same-origin. Serving the frontend from a different origin would require
  revisiting D51 and adding CORS.
- **Rate limiting elsewhere.** Only login is rate-limited; other endpoints are
  not.
- **No encryption-at-rest configuration** beyond what the hosted database
  provides.

## Related Documents

- [../product/users-and-roles.md](../product/users-and-roles.md)
- [../architecture/api-design.md](../architecture/api-design.md)
- [../architecture/database.md](../architecture/database.md)
- [../architecture/decisions.md](../architecture/decisions.md)
