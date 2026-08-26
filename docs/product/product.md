# Product Overview

**Status:** Confirmed direction — pre-implementation.

## What ProcureAI Is

ProcureAI is an AI-assisted decision-support platform for public
procurement. It is intended to help government officials move from an
unstructured problem description to a structured, evaluated, and explainable
set of vendor/startup recommendations.

The planned assistance spans the early procurement lifecycle:

1. Convert an unstructured problem description into structured requirements.
2. Identify missing information and generate clarification questions.
3. Where appropriate, break complex requirements into logical solution components or procurement work packages.
4. Discover suitable startups/vendors using semantic search and structured
   filtering.
5. Collect and process RFI/proposal documents.
6. Evaluate candidates using deterministic rules and AI-assisted analysis.
7. Rank candidates and generate explainable recommendations.
8. Support the official's final human decision.

All of the above is **planned scope**, not yet implemented. See
[hackathon-scope.md](hackathon-scope.md) for what is targeted for the
hackathon build and [development-roadmap.md](../development-roadmap.md) for
sequencing.

## What ProcureAI Is Not

- Not an autonomous procurement system — it must never commit a binding
  procurement decision on its own.
- Not a general-purpose chatbot or LLM wrapper — AI capabilities are meant to
  be embedded into specific workflow steps, not exposed as a generic
  "ask anything" interface.
- Not a vendor marketplace or e-commerce platform.
- Not a replacement for legal/financial procurement compliance processes —
  it is meant to support the official who remains responsible for those.

## Core Product Principles (Confirmed)

1. **Human-in-the-loop.** Every AI-generated artifact (requirements,
   clarifications, work packages, evaluations, rankings) is a suggestion the
   official can review, edit, approve, or reject.
2. **Explainable AI.** Recommendations must come with the reasoning and
   evidence behind them, not just a score.
3. **Deterministic where possible.** Rules-based logic is preferred over AI
   judgment wherever the criteria are objective (e.g. budget compatibility,
   compliance checklist matches).
4. **Validated AI output.** Raw LLM output is never treated as source of
   truth. AI output must be parsed into structured, validated schemas before
   it enters application state.
5. **Audit trail.** Important actions (approvals, edits to AI suggestions,
   status transitions) should be traceable.
6. **Separation of AI suggestion vs. confirmed state.** AI-generated content
   is stored distinctly from official-confirmed content until approved.
7. **Officials remain responsible.** The system supports judgment; it does
   not replace accountability.
8. **Incremental delivery.** The platform is being built as small,
   always-runnable vertical slices.
9. **Constraint-aware recommendations.** Candidate recommendations should
consider the complete set of relevant constraints, such as technical
requirements, budget, deployment timeline, eligibility, compliance,
scalability, and other confirmed project constraints.

## Target Outcome

A government official facing a complex, loosely defined problem should be able to reach a shortlist of well-matched vendors or, where appropriate, a recommended combination of vendors for different solution components.The system should provide a clear and inspectable explanation of why each candidate or proposed solution combination was recommended.

## Related Documents

- [problem-statement.md](problem-statement.md)
- [requirements.md](requirements.md)
- [users-and-roles.md](users-and-roles.md)
- [hackathon-scope.md](hackathon-scope.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
