# Testing Strategy

**Status:** Partly implemented. `apps/api` has unit and integration suites on
Node's built-in test runner; `apps/web` and `apps/ai-service` have none yet.

## Principles (Confirmed)

- Test after implementing the smallest useful version of a feature, per
  [development-workflow.md](development-workflow.md) step 7.
- Testing should support the "keep the project runnable after each
  milestone" rule — see [../product/product.md](../product/product.md).

## Planned Approach by Layer

- **`apps/web`** — component/unit tests for UI logic; framework not yet
  chosen. Not implemented.
- **`apps/api`** — unit tests for business logic, integration tests for API
  endpoints including validation and auth/RBAC behaviour. **Implemented**, on
  Node's built-in runner — see below.
- **`apps/ai-service`** — unit tests for structured output validation
  (Pydantic schema conformance) and any deterministic logic; framework not
  yet chosen (likely `pytest`, not yet confirmed).
- **Cross-service** — integration tests covering the Express-backend-to-
  AI-service contract, once that contract exists.

## Implemented (`apps/api`)

No framework was added: `node:test` with `tsx` covers both layers, which keeps
the dependency count where D20 and D6 left it.

- `npm test` — unit suites (`tests/*.unit.test.ts`). Pure functions only, no
  database and no HTTP: the matching pipeline's normalization, eligibility and
  ranking stages; Milestone 8's response catalogue, answer validators and
  completeness computation; and Milestone 9's criterion catalogue, consistency
  rules, compliance derivation, threshold extraction, scoring formulas,
  weighting and ranking. These are the parts that must be right before any
  request reaches them — the completeness rule is read by both the supplier's
  progress indicator and the submission gate (D80), so an error there is an
  error in both at once, and a scoring rule that is wrong is wrong in the
  ranking, in the comparison and in the record a procurement decision cites,
  all at once.

  The Milestone 9 unit suite asserts the two properties the evaluation is built
  to hold and that nothing else can check: that identical input produces
  identical output (reproducibility), and that missing information is never
  scored as compliance.
- `npm run test:integration` — end-to-end suites (`tests/*.integration.test.ts`)
  over HTTP against a running API and a seeded database. They verify what a
  unit test cannot: that the session decides who the caller is, that the
  permission table decides what they may do, and that an id in a URL or a body
  is never sufficient on its own. Most assertions are about a request that must
  be refused. The suites skip rather than fail when the API is not running, so
  `npm test` still works without a local server.

Integration files run **one at a time** (`--test-concurrency=1`). They share
the seeded demo accounts, and signing in revokes that user's previous session,
so two files running in parallel invalidate each other's cookies. Serialising
them is also what makes their fixture cleanup meaningful, since they mutate the
same seeded work packages.

Each suite clears the state it will assert on before it runs and removes what
it created afterwards, so it can be re-run against the same seed without a
reseed.

Two checks sit outside the test runner because what they verify is data rather
than behaviour:

- `npm run check:vendors` runs the real onboarding-completion computation and
  the API's own profile patch schema over the demonstration supplier catalogue
  without a database, and fails if any supplier would land below 100%
  completion or carries a value outside the taxonomy. It is fast enough to run
  on every edit to the catalogue, which is the point: a gap is found in a
  second rather than halfway through a seed run against a hosted server.
- `npx tsx scripts/verifyVendorRegistry.ts` reads the seeded database back and
  fails if any supplier is short of registered, complete, documented and
  administrator-verified. It asserts on what was written rather than on what
  was meant to be written, so a partially completed seed cannot pass unnoticed.

## Explicitly Not Yet Decided

- Test framework per component (e.g. Vitest/Jest for `apps/web`, Jest/
  Vitest + Supertest for `apps/api`, pytest for `apps/ai-service`) —
  reasonable defaults, not confirmed.
- Coverage expectations/targets.
- Whether CI runs tests automatically (see [deployment.md](deployment.md) —
  CI/CD is explicitly out of scope for now).
- End-to-end testing approach, if any.

## Current Status

`apps/api` carries 62 unit tests and 130 integration tests across the matching
pipeline (Milestone 6), engagement (Milestone 7) and responses (Milestone 8).
`apps/web` is verified by `npm run build`, which typechecks the whole project
before building; there are no component tests yet. `apps/ai-service` has no
tests, and its structured output is validated at runtime by Pydantic on the
service side and by zod on the API side.

## Related Documents

- [development-workflow.md](development-workflow.md)
- [deployment.md](deployment.md)
- [../architecture/technology-stack.md](../architecture/technology-stack.md)
