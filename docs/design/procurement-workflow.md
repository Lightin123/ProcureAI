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

# 1. High-Level Procurement Workflow

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