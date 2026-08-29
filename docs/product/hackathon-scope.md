# Hackathon Scope

**Status:** Planned framing. This document distinguishes what is targeted
for the Smart India Hackathon 2026 demonstration from the broader product
vision, and marks what is currently implemented.

## Currently Implemented

Milestones 1 through 7 — see
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
- **Milestone 6** — the vendor ecosystem: public vendor self-registration;
  progressive, schema-driven onboarding across many industries (not
  technology-only); vendor capability profiles with structured data,
  repeatable entities (products/services, experience, credentials), and
  compliance document upload; admin-side verification; a vendor portal
  (dashboard, opportunity discovery, save/interest); government-side
  opportunity publication; and **work-package-level hybrid matching** —
  deterministic eligibility as a hard gate, lexical + pgvector semantic
  retrieval unioned, seven-dimension ranking, and explanations built only
  from stored values. See
  [../ai/vendor-discovery.md](../ai/vendor-discovery.md).
- **Milestone 7** — shortlisting and engagement: an official compares
  ranked suppliers side by side, shortlists them per work package with a
  recorded reason, and invites shortlisted suppliers to respond. The
  supplier is notified in the portal, opens the invitation, sees the work
  package it concerns, and accepts or declines with a reason. Every
  shortlist and invitation act is audited against the work package. The
  structured proposal itself is Milestone 8.

All three services (`apps/web`, `apps/api`, `apps/ai-service`) run together.

## Current Development Stage

Milestones 1 through 7 are complete. The next milestone is **Milestone 8 —
vendor response and proposal collection**: letting an invited supplier who has
accepted submit a structured, deadline-bound response against the work package
it accepted, and letting the official configure and track that process. See
[../development-roadmap.md](../development-roadmap.md).

Nothing in Milestone 7 anticipates that schema. Accepting an invitation
registers intent to respond and no more; the response entity is deliberately
unmodelled until the workflow that uses it is specified — the same reasoning
that kept the shortlist minimal in Milestone 6 (D69).

The roadmap was re-sequenced twice from the original problem-statement
ordering: authentication and RBAC (Milestone 5) were moved ahead of vendor
work (D43), and within Milestone 6, vendor onboarding was built before
work-package-level matching, for the same reason — matching needs vendors
and work packages to exist first. Milestone 7 followed the same dependency:
an invitation needs a shortlist, and a shortlist needs a ranking.

## Explicitly Out of Scope for the Current Stage

Per project instructions, the following must **not** be implemented until
explicitly requested:

- RFI/proposal collection from vendors (Milestone 8) — including the
  response form, deadline configuration, submission tracking and
  clarification requests. Milestone 7 stops at the accepted invitation.
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
- Work-package-level matching with an explainable ranked list, its
  eligibility exclusions inspectable alongside it (built).
- Shortlisting, invitation, the supplier's in-portal notification, and the
  supplier accepting or declining — the human decision loop closing across
  both sides of the platform (built). `npx tsx scripts/engagementDemo.ts`
  puts a seeded work package into the invited state so the supplier half of
  the demonstration has something to open.

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
