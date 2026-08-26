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

No authentication, authorization, input validation middleware, or audit
logging exists in the codebase. The only planned endpoint for the current
milestone (`GET /health`) is intentionally public and requires no auth.

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
