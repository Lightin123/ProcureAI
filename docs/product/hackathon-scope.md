# Hackathon Scope

**Status:** Planned framing. This document distinguishes what is targeted
for the Smart India Hackathon 2026 demonstration from the broader product
vision, and marks what is currently implemented.

## Currently Implemented

Milestones 1 through 5, and a substantial portion of Milestone 6 — see
[../development-roadmap.md](../development-roadmap.md) for full detail.

- **Milestone 1** — React frontend and Express backend communicating over
  REST, with `GET /health`.
- **Milestone 2** — procurement projects persisted in PostgreSQL: create,
  list, and view, starting in the `DRAFT` workflow state.
- **Milestone 3** — AI requirement analysis: an official runs analysis on
  the problem description, reviews suggested requirements and constraints
  (accept / edit / reject with reason), adds requirements manually,
  answers clarification questions, and confirms the requirements.
- **Milestone 4** — AI work package decomposition from confirmed
  requirements, with full review (accept, edit, merge, split, reorder,
  soft-delete/restore) and confirmation, or a single-package path when no
  decomposition is needed.
- **Milestone 5** — real authentication (opaque server-side sessions) and
  role-based access control across three roles (Government Official,
  Administrator, Vendor), with organization-scoped authorization enforced
  on every request.
- **Milestone 6 (in progress):**
  - *Implemented* — public vendor self-registration; progressive,
    schema-driven vendor onboarding across many industries (not
    technology-only); vendor capability profiles with structured data,
    repeatable entities (products/services, experience, credentials), and
    compliance document upload; admin-side vendor verification; a vendor
    portal (dashboard, opportunity discovery, save/interest); government-
    side opportunity publication; and **deterministic, project-level,
    lexical** vendor-to-opportunity matching.
  - *Not yet implemented* — work-package-level matching, eligibility
    filtering as a distinct gate, pgvector/embeddings, hybrid (lexical +
    semantic) retrieval, vendor ranking per work package, vendor
    shortlisting and invitation. See
    [../ai/vendor-discovery.md](../ai/vendor-discovery.md).

All three services (`apps/web`, `apps/api`, `apps/ai-service`) run together.

## Current Development Stage

Milestone 5 is complete and Milestone 6 is in progress. The immediate
development priority is moving Milestone 6's vendor matching from
project-level lexical matching to **work-package-level hybrid matching**
(deterministic eligibility filtering + lexical + semantic retrieval +
multi-factor ranking + explanation) — see
[../ai/vendor-discovery.md](../ai/vendor-discovery.md) and
[../development-roadmap.md](../development-roadmap.md).

The roadmap was re-sequenced twice from the original problem-statement
ordering: authentication and RBAC (Milestone 5) were moved ahead of vendor
work (D43), and within Milestone 6, vendor onboarding was built before
work-package-level matching, for the same reason — matching needs vendors
and work packages to exist first.

## Explicitly Out of Scope for the Current Stage

Per project instructions, the following must **not** be implemented until
explicitly requested:

- Work-package-level vendor matching, eligibility filtering, pgvector,
  embeddings, and hybrid semantic retrieval (the immediate next priority,
  but not yet started as of this document).
- Vendor shortlisting and invitation workflow (Milestone 7).
- RFI/proposal collection from vendors (Milestone 8).
- Document intelligence and vendor response evaluation (Milestone 9).
- Vendor gap analysis and procurement analytics (Milestone 10).
- Advanced semantic optimization — learned ranking, query expansion,
  reranking models (Milestone 11).
- Docker, CI/CD pipelines, deployment configuration.

## Likely Hackathon-Demo Scope (Not Yet Confirmed)

For a Smart India Hackathon demonstration, the product vision in
[requirements.md](requirements.md) is almost certainly larger than what can
be fully implemented. A realistic demo slice, updated for what already
exists, likely includes at minimum:

- Project creation, AI requirement extraction, and confirmation (built).
- Work package generation and confirmation (built).
- Vendor onboarding and a populated, multi-sector seeded vendor base
  (built).
- Work-package-level matching with an explainable ranked list — the
  current priority; a basic version (even lexical-only, package-scoped) is
  likely more demo-valuable than a project-level-only demo.
- A shortlisting/invitation step, even a minimal one, to show the human
  decision loop closing.

**This list is a reasonable inference, not a confirmed decision.** The
exact hackathon-demo cut should be revisited in
[../development-roadmap.md](../development-roadmap.md) as the hackathon
timeline becomes clearer.

## Future Ideas (Beyond Hackathon, Unscheduled)

- Multi-package vendor allocation (portfolio-level vendor selection across
  a project) — see Milestone 11.
- Department/organization-level administration beyond what Milestone 5
  already provides.
- Notification/communication features between officials and vendors beyond
  the in-app notifications already built.
- Analytics/reporting across procurement history — see Milestone 10.

## Unresolved Decisions Affecting Scope

- Whether an unverified vendor is excluded from matching outright or
  included at a lower ranking ceiling — see
  [../ai/vendor-discovery.md](../ai/vendor-discovery.md).
- Whether "Government Administrator" and "Procurement Administrator" are
  separate roles (resolved as merged for now — see D46 in
  [../architecture/decisions.md](../architecture/decisions.md) and
  [users-and-roles.md](users-and-roles.md)).
- Performance/scale targets for the demo (see NFR9 in
  [requirements.md](requirements.md)).
- Deployment target for the hackathon demo, if any (see
  [../engineering/deployment.md](../engineering/deployment.md)).

## Related Documents

- [requirements.md](requirements.md)
- [../development-roadmap.md](../development-roadmap.md)
- [../ai/vendor-discovery.md](../ai/vendor-discovery.md)
- [../architecture/decisions.md](../architecture/decisions.md)
