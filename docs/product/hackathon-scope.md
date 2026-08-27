# Hackathon Scope

**Status:** Planned framing. This document distinguishes what is targeted
for the Smart India Hackathon 2026 demonstration from the broader product
vision, and marks what is currently implemented.

## Currently Implemented

Milestones 1 through 3:

- **Milestone 1** — React frontend and Express backend communicating over
  REST, with `GET /health`.
- **Milestone 2** — procurement projects persisted in PostgreSQL: create,
  list, and view, starting in the `DRAFT` workflow state.
- **Milestone 3** — AI requirement analysis: an official runs analysis on the
  problem description, reviews suggested requirements and constraints
  (accept / edit / reject with reason), adds requirements manually, answers
  clarification questions, and confirms the requirements. All three
  services now run.

## Current Development Stage

Milestone 3 is complete. Milestone 4 has not been started — see
[../development-roadmap.md](../development-roadmap.md).

## Explicitly Out of Scope for the Current Stage

Per project instructions, the following must **not** be implemented until
explicitly requested, regardless of how central they are to the product
vision:

- Authentication
- Role-based access control
- Vendor functionality
- Work packages / solution components (Milestone 4)
- Workflow transitions beyond the three requirement states
- Semantic search
- RAG (retrieval-augmented generation)
- Document intelligence
- Ranking / optimization logic
- Docker
- CI/CD pipelines
- Deployment configuration

## Likely Hackathon-Demo Scope (Not Yet Confirmed)

For a Smart India Hackathon demonstration, the product vision in
[requirements.md](requirements.md) is almost certainly larger than what can
be fully implemented. A realistic demo slice likely includes at minimum:

- Project creation and problem description input.
- AI requirement extraction and clarification questions (single-pass, not
  necessarily iterative).
- Structured requirements review/approval.
- Work package generation.
- Vendor discovery via semantic search against a seeded vendor dataset.
- A basic evaluation/ranking view with explanations.
- Human decision recording.

**This list is a reasonable inference, not a confirmed decision.** The exact
hackathon-demo cut has not been discussed with the team and should be
revisited in [../development-roadmap.md](../development-roadmap.md) as
milestones are planned.

## Future Ideas (Beyond Hackathon, Unscheduled)

These are directionally consistent with the product vision but have not
been discussed in enough detail to plan:

- Vendor self-service portal (profile management, RFI submission UI).
- Department/organization-level administration and multi-tenant scoping.
- Advanced optimization across multiple work packages (portfolio-level
  vendor selection).
- Notification/communication features between officials and vendors.
- Analytics/reporting across procurement history.

## Unresolved Decisions Affecting Scope

- Whether vendor self-service is in the hackathon build or a future
  extension.
- Whether "Government Administrator" and "Procurement Administrator" are
  separate roles (see
  [users-and-roles.md](users-and-roles.md)).
- Performance/scale targets for the demo (see NFR9 in
  [requirements.md](requirements.md)).
- Deployment target for the hackathon demo, if any (see
  [../engineering/deployment.md](../engineering/deployment.md)).

## Related Documents

- [requirements.md](requirements.md)
- [../development-roadmap.md](../development-roadmap.md)
- [../architecture/decisions.md](../architecture/decisions.md)
