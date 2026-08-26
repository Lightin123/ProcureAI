# Testing Strategy

**Status:** Planned intent only. No tests, test frameworks, or test
configuration exist yet.

## Principles (Confirmed)

- Test after implementing the smallest useful version of a feature, per
  [development-workflow.md](development-workflow.md) step 7.
- Testing should support the "keep the project runnable after each
  milestone" rule — see [../product/product.md](../product/product.md).

## Planned Approach by Layer (Not Yet Implemented)

- **`apps/web`** — component/unit tests for UI logic; framework not yet
  chosen.
- **`apps/api`** — unit tests for business logic, integration tests for API
  endpoints (including validation and, once implemented, auth/RBAC
  behavior); framework not yet chosen.
- **`apps/ai-service`** — unit tests for structured output validation
  (Pydantic schema conformance) and any deterministic logic; framework not
  yet chosen (likely `pytest`, not yet confirmed).
- **Cross-service** — integration tests covering the Express-backend-to-
  AI-service contract, once that contract exists.

## Explicitly Not Yet Decided

- Test framework per component (e.g. Vitest/Jest for `apps/web`, Jest/
  Vitest + Supertest for `apps/api`, pytest for `apps/ai-service`) —
  reasonable defaults, not confirmed.
- Coverage expectations/targets.
- Whether CI runs tests automatically (see [deployment.md](deployment.md) —
  CI/CD is explicitly out of scope for now).
- End-to-end testing approach, if any.

## Current Status

No test infrastructure exists. The first milestone (health check) should
include, at minimum, a manual verification step (confirm the frontend
displays a successful response from the backend) — automated testing setup
can follow once a framework is chosen.

## Related Documents

- [development-workflow.md](development-workflow.md)
- [deployment.md](deployment.md)
- [../architecture/technology-stack.md](../architecture/technology-stack.md)
