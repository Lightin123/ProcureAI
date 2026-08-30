# Hackathon Scope

**Status:** Planned framing. This document distinguishes what is targeted
for the Smart India Hackathon 2026 demonstration from the broader product
vision, and marks what is currently implemented.

## Currently Implemented

Milestones 1 through 8 — see
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
  shortlist and invitation act is audited against the work package.
- **Milestone 8** — response and proposal collection: the official configures
  what response a confirmed work package requires (expression of interest,
  RFI, proposal or quotation), with a deadline, required and optional
  sections, custom questions, and whether clarifications and documents are
  allowed; opening it notifies every supplier that accepted its invitation.
  The supplier drafts a resumable response, answers each confirmed
  requirement individually, attaches documents, reviews it and submits.
  Submission is validated server-side against the department's own
  configuration and the response becomes immutable. Either side can raise a
  clarification; the official moves the submission through review to *ready
  for evaluation*.
- **Milestone 9** — evaluation and AI-assisted decision support: the official
  configures the weighted criteria a work package is judged on — price,
  timeline, capacity, certifications, experience, technical response,
  requirement compliance, and the department's own questions — with the system
  refusing a set that does not add up or that scores suppliers on information
  nobody was asked for. Running the evaluation scores every ready response by
  arithmetic over the figures suppliers stated, compares them requirement by
  requirement without ever counting silence as compliance, and produces a
  ranking in which every position shows the factors that produced it. The
  official compares suppliers side by side, may ask for an advisory AI reading
  of any response — clearly labelled, quoting the passages it drew on, and
  incapable of moving a score — and then selects or rejects a named supplier
  with a mandatory reason. The decision, its reason, its author, its moment and
  the evaluation it cites are recorded, and every earlier evaluation stays on
  the record unchanged.

All three services (`apps/web`, `apps/api`, `apps/ai-service`) run together.

## Current Development Stage

Milestones 1 through 9 are complete. The next milestones are **Milestone 10 —
procurement intelligence and analytics** and **Milestone 11 — advanced semantic
optimization**, neither of which is started. See
[../development-roadmap.md](../development-roadmap.md).

The core system flow is now complete end to end: a problem description becomes
requirements, requirements become work packages, work packages find suppliers,
suppliers are invited and respond, responses are evaluated, and an official
records a decision. What Milestones 10 and 11 add is intelligence *across*
procurements — patterns, gaps, analytics, learning — rather than any further
step within one.

The roadmap was re-sequenced twice from the original problem-statement
ordering: authentication and RBAC (Milestone 5) were moved ahead of vendor
work (D43), and within Milestone 6, vendor onboarding was built before
work-package-level matching, for the same reason — matching needs vendors
and work packages to exist first. Milestones 7 and 8 followed the same
dependency chain: an invitation needs a shortlist, a shortlist needs a
ranking, a response needs an accepted invitation, and an evaluation needs a
submitted response.

## Explicitly Out of Scope for the Current Stage

Per project instructions, the following must **not** be implemented until
explicitly requested:

- **Document intelligence** — parsing or extracting structure from the
  *contents* of an uploaded attachment. Milestone 9 reads the structured fields
  and written answers a supplier submitted, and passes attachment titles only
  to the AI service.
- Vendor gap analysis, procurement analytics and organization-wide
  intelligence dashboards (Milestone 10).
- Advanced semantic optimization — learned ranking, query expansion, reranking
  models — learning from recorded human decisions, model fine-tuning, and
  automatic allocation of vendors across several work packages (Milestone 11).
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
