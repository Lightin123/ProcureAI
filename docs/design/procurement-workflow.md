# Procurement Workflow

**Status:** Planned design. This document defines the conceptual workflow of
ProcureAI and its human review points. It is not an implementation of a state
machine, database schema, or API.

The workflow elaborates the product direction defined in
[../product/problem-statement.md](../product/problem-statement.md) and the
functional requirements in [../product/requirements.md](../product/requirements.md).

---

## Workflow Principles

The ProcureAI workflow follows several core principles:

1. **Human-in-the-loop.** AI-generated outputs are suggestions. A responsible
   government official can review, edit, approve, reject, or regenerate them.

2. **Iterative, not strictly linear.** New information discovered later in the
   workflow may require revisiting earlier requirements, work packages, or
   discovery criteria.

3. **Upstream changes affect downstream results.** Meaningful changes to
   confirmed requirements or work packages may make previously generated
   discovery results, evaluations, rankings, or recommendations outdated.

4. **AI operations and workflow states are distinct.** AI operations perform
   work such as analyzing requirements or evaluating vendors. Workflow states
   represent where a project or work package currently is in its review and
   decision lifecycle.

5. **Work packages can progress independently.** Once a project is divided into
   confirmed work packages, each package may move through discovery,
   submissions, evaluation, and recommendation at a different pace.

6. **The final decision is always human.** ProcureAI may analyze, rank, and
   recommend, but it must never autonomously make a binding procurement
   decision.

7. **Important actions should be auditable.** Significant approvals, edits,
   rejections, overrides, and workflow changes should be traceable.

---

## High-Level Procurement Workflow

At a high level, the procurement workflow begins as a project-level refinement
process.

```text
Government Official
        |
        v
Create Procurement Project
        |
        v
Describe Problem / Requirement
        |
        v
AI Requirement Analysis
        |
        +-- Extract candidate requirements
        +-- Identify constraints
        +-- Identify missing information
        +-- Generate clarification questions
        |
        v
Clarification and Requirement Review
        |
        +-- Approve
        +-- Edit
        +-- Reject suggestions
        +-- Add requirements manually
        +-- Answer clarifications
        +-- Re-run analysis
        |
        v
Structured Requirements Confirmed
        |
        v
Work Package Generation
        |
        v
Work Package Review
        |
        +-- Approve
        +-- Edit
        +-- Merge
        +-- Split
        +-- Remove
        +-- Add manually
        +-- Regenerate
        |
        v
Work Packages Confirmed
        |
        v
Work Package Processing
        |
        +----------------------------------+
        |                                  |
        v                                  v
Work Package A                       Work Package B
        |                                  |
        v                                  v
Vendor Discovery                     Vendor Discovery
        |                                  |
        v                                  v
RFI / Proposal Collection            RFI / Proposal Collection
        |                                  |
        v                                  v
Document Intelligence                Document Intelligence
        |                                  |
        v                                  v
Evaluation                           Evaluation
        |                                  |
        v                                  v
Recommendation                       Recommendation
        |                                  |
        +---------------+------------------+
                        |
                        v
                 Project Final Review
                        |
                        v
                 Human Decision
                        |
                        v
                Decision Recorded
                        |
                        v
              Handoff / Completion
```

---

## Project Workflow States

A procurement project always sits in exactly one of the states below. These
are the project-level states referenced by FR1.3 in
[../product/requirements.md](../product/requirements.md) and by the
Procurement Projects entity in
[../architecture/database.md](../architecture/database.md).

| State | Meaning | Introduced in |
|---|---|---|
| `DRAFT` | Created; the problem description is being written. No analysis has run. | Milestone 2 |
| `REQUIREMENTS_ANALYSIS` | AI requirement analysis and clarification are in progress. | Milestone 3 |
| `REQUIREMENTS_CONFIRMED` | The official has approved the structured requirements. | Milestone 3 |
| `WORK_PACKAGES_CONFIRMED` | Decomposition is approved, or deliberately skipped under FR3.3. | Milestone 4 |
| `IN_DISCOVERY` | Vendor discovery and RFI/proposal collection are under way. | Milestone 6 |
| `UNDER_EVALUATION` | Submitted candidates are being evaluated and ranked. | Milestone 7 |
| `AWAITING_DECISION` | Explainable recommendations are ready for human review. | Milestone 7 |
| `DECISION_RECORDED` | The official has recorded the procurement decision (FR9.2). | Milestone 7 |
| `CANCELLED` | The project was terminated without a procurement decision. | — |

### Rules

- A project is created in `DRAFT`.
- **No state advances automatically.** Every transition requires an explicit
  action by an authorised official, consistent with Workflow Principle 6 and
  FR9.3 — the system must never auto-advance toward a binding decision.
- `DECISION_RECORDED` is terminal for the procurement decision itself;
  `CANCELLED` is terminal without one.
- Because the workflow is iterative rather than strictly linear (Workflow
  Principle 2), a project may return to an earlier state when new
  information invalidates confirmed work. The exact set of permitted
  backward transitions is **unresolved** and will be defined when the
  milestone that introduces the transition is implemented.

### Current Implementation Status

As of Milestone 3, three states are reachable: `DRAFT`,
`REQUIREMENTS_ANALYSIS`, and `REQUIREMENTS_CONFIRMED`. Transitions:

- `DRAFT -> REQUIREMENTS_ANALYSIS` when the official runs AI analysis.
- `REQUIREMENTS_ANALYSIS -> REQUIREMENTS_CONFIRMED` when the official
  confirms, which requires at least one accepted requirement (D33).
- `REQUIREMENTS_CONFIRMED -> REQUIREMENTS_ANALYSIS` via an explicit reopen
  action (D34).

Every transition is triggered by an explicit official action and is recorded
in `project_stage_history` (D32). States from `WORK_PACKAGES_CONFIRMED`
onward remain unreachable. The full enumeration is defined
here — and in the database — so that later milestones extend behaviour
rather than repeatedly widening the state model.

Work-package-level states are a separate concern (Workflow Principle 5) and
are **not yet defined**; they will be specified when work packages are
implemented in Milestone 4.

## Vendor Engagement Lifecycle (Implemented, Milestone 7)

This is a **work-package-level** lifecycle and is deliberately separate from
the project states above. It introduces **no new project state**: a project
sits in `WORK_PACKAGES_CONFIRMED` throughout, and `IN_DISCOVERY` onwards stay
unreachable. Engaging suppliers for one confirmed work package is not a
statement about the project as a whole, and a project whose five packages are
at five different stages of engagement is the normal case, not an anomaly
(Workflow Principle 5).

```
CONFIRMED work package
        |
        v
  ranked, eligible suppliers          (Milestone 6 — a read, no state)
        |
        v
  SHORTLISTED  --------------------->  removed from the shortlist
   (per work package, with a
    recorded reason and actor)
        |
        v
    INVITED  ------------------------>  WITHDRAWN   (the department cancels,
        |                                            supplier notified)
        +-------------------->  ACCEPTED  -->  Milestone 8's structured response
        |
        +-------------------->  DECLINED  (reason required)
```

### Rules

- **Nothing advances automatically.** Shortlisting, inviting, withdrawing,
  accepting and declining are each an explicit act by an identified person,
  consistent with Workflow Principle 6.
- A supplier can only be shortlisted against a **`CONFIRMED`** work package,
  and only if the eligibility gate passed them. The shortlist belongs to one
  work package: shortlisting for WP-02 says nothing about WP-01.
- A supplier can only be invited if they are on **that package's** shortlist.
  Eligibility is therefore enforced transitively, through one definition of
  the gate rather than a second copy that could drift from it.
- **One live invitation** per supplier per work package. A withdrawn or
  declined invitation does not block a fresh one, and the fresh one is a new,
  separately audited record rather than a mutation of the answered one (D75).
- A supplier's answer is **single-shot**. Once accepted or declined it cannot
  be changed, and an accepted invitation cannot be withdrawn by the
  department — retracting it would erase a commitment the supplier made.
- There is **no expiry state**. A passed `response_deadline` is derived when
  the invitation is read, because manufacturing an `EXPIRED` state would
  require a background job the system does not have (D30).
- `ACCEPTED` means the supplier has registered an intent to respond. It is
  not a proposal, a quotation, a commitment to supply, or an award.

### What each side sees

The department sees every invitation on its own work package with the full
response record. The supplier sees only invitations addressed to it, and
sees the work package, the deadline and the official's instructions — never
the ranking, the scores, the eligibility verdict, the shortlist reason, or
any other supplier (D76). The two views are different queries in different
routers precisely so that this separation cannot erode by accident.

### Notification

Issuing or withdrawing an invitation writes a notification to the supplier's
own notification list in the same request (D74). The supplier portal's header
carries the unread count; opening a notification marks that one read and
navigates to the invitation. There is no email, SMS or push channel — in-portal
only.

## Related Documents

- [../product/problem-statement.md](../product/problem-statement.md)
- [../product/requirements.md](../product/requirements.md)
- [../architecture/database.md](../architecture/database.md)
- [ui-design.md](ui-design.md)
- [../development-roadmap.md](../development-roadmap.md)
