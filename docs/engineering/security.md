# Security

**Status:** Planned design intent only. Authentication and authorization are
explicitly **not implemented** and not to be implemented until requested
(see [../product/hackathon-scope.md](../product/hackathon-scope.md)).

## Planned Security Measures

- **Authentication.** Required for all endpoints except `/health`, once
  implemented. Mechanism (session-based vs. JWT, provider) is unresolved —
  see U3 in [../architecture/decisions.md](../architecture/decisions.md).
- **Authorization / RBAC.** Access to procurement projects and
  administrative actions restricted by role — see
  [../product/users-and-roles.md](../product/users-and-roles.md).
- **Input validation.** All external input validated at the API boundary
  before reaching business logic (NFR3 in
  [../product/requirements.md](../product/requirements.md)).
- **Audit trail.** Key state-changing actions (approvals, edits to AI
  suggestions, stage transitions, final decisions) recorded with actor and
  timestamp (FR11, NFR4).
- **Data separation.** AI-suggested content kept distinct from
  official-confirmed content until approved, limiting the blast radius of
  bad AI output on application state (NFR8).

## Current Status

No authentication, authorization, or audit logging exists in the codebase.
All endpoints are currently public.

Input validation **is** now implemented: every request body is validated at
the API boundary with `zod` (D25) before reaching business logic, and
malformed input is rejected with a structured `VALIDATION_ERROR` response
(D24).

Until authentication exists, the acting official is resolved **server-side**
from a seeded user constant (D21) — deliberately not from a client-supplied
header, which would be trivially spoofable. Project queries are already
scoped by `organization_id`, so the authorization boundary has a place to
attach when auth arrives.

The database connection string lives in `apps/api/.env`, and the LLM
credential — `AI_API_KEY` for an OpenAI-compatible provider such as Groq, or
`ANTHROPIC_API_KEY` for Anthropic — in `apps/ai-service/.env`. Both files are
excluded by `.gitignore` and must never be committed or logged.

The OpenAI-compatible settings are namespaced `AI_*` rather than `OPENAI_*`
specifically so that an unrelated ambient `OPENAI_API_KEY` on a developer
machine is never picked up and sent to a different provider's endpoint (D39).

**AI-specific considerations introduced in Milestone 3:**

- **Prompt injection.** A project's problem description is official-supplied
  text that is placed into an LLM prompt. The system prompt instructs the
  model to treat it strictly as data and ignore embedded instructions, and the
  required output schema constrains what the model can return — enforced by
  structured outputs on Anthropic, and by JSON mode plus validation and a
  bounded retry on OpenAI-compatible providers (D40). The decisive control
  remains the product rule that nothing AI-generated enters confirmed state
  without human approval.
- **Double validation.** AI output is validated by Pydantic in the AI service
  and re-validated with zod in Express before persistence (NFR2).
- **Service exposure.** The AI service binds to `127.0.0.1` only and has no
  authentication of its own; Express is its sole caller, and the frontend
  never reaches it. If it is ever bound to a routable interface, it will need
  its own authentication first.

## Explicitly Out of Scope For Now

- Authentication implementation
- Authorization/RBAC implementation
- Session/token management
- Secrets management strategy
- Rate limiting
- Encryption-at-rest configuration

These will be designed in detail when authentication is explicitly
requested, per [../../CLAUDE.md](../../CLAUDE.md).

## Not Yet Decided

- Authentication provider/mechanism (custom vs. third-party, e.g.
  session cookies vs. JWT vs. an auth provider).
- Password/credential policy (if applicable) vs. SSO/government identity
  integration.
- Secrets management approach for API keys (e.g. LLM provider keys).
- Data retention policy for audit logs.

## Related Documents

- [../product/users-and-roles.md](../product/users-and-roles.md)
- [../architecture/api-design.md](../architecture/api-design.md)
- [../architecture/decisions.md](../architecture/decisions.md)
