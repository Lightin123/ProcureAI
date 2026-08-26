# AI Agents Policy

**Status:** Planned policy. No agentic orchestration is implemented.

## Position

Multi-agent architecture must not be introduced merely to claim the project
"uses agents." Every use of agentic reasoning or orchestration must be
justified by a clear responsibility that benefits from it. This document
exists to make that judgment call consistently rather than case-by-case.

That said, this policy does not mean ProcureAI can never use agentic
reasoning. It means agentic reasoning is an escalation — used deliberately,
in a bounded form, for the specific parts of the workflow that genuinely
need it — not a default architecture and not a hype feature.

## A Spectrum, Not a Binary

"Uses AI" and "uses agents" are often treated as the same thing. They
aren't. ProcureAI distinguishes four distinct levels of AI involvement, and
defaults to the simplest one that satisfies a task's requirements:

1. **Single AI function/tool call.** One request to the AI service that
   takes structured input and returns structured, validated output. No
   internal looping, no multi-step planning. Example: generate clarification
   questions from a given set of candidate requirements.

2. **Fixed AI pipeline.** A predetermined sequence of single AI calls (and/
   or deterministic steps), where the sequence and its steps are defined by
   the application, not decided by the model at runtime. Example:
   extract requirements → classify them → detect missing fields, run in
   that fixed order every time.

3. **Bounded agentic workflow.** A single, narrowly-scoped component where
   the *next step* is decided dynamically based on intermediate results,
   iterating toward an explicit goal under hard limits (see
   [Constraints for Any Bounded Agentic Component](#constraints-for-any-bounded-agentic-component)
   below). Still one responsibility, still no autonomous tool set beyond
   what that responsibility needs.

4. **Multi-agent architecture.** Multiple distinct agents (potentially with
   different roles, tools, or models) coordinating with each other,
   possibly with a supervising/orchestrating agent. The heaviest, least
   predictable, hardest-to-audit option.

Each level up trades predictability and auditability for flexibility. The
default posture is: **start at level 1 or 2; justify moving to level 3;
treat level 4 as requiring exceptional justification.**

## Default Architecture: Structured, Single-Purpose AI Operations

ProcureAI defaults to **levels 1 and 2** — single-purpose, structured AI
calls and fixed pipelines (see [ai-system.md](ai-system.md)) for each
discrete task in the workflow: requirement extraction, clarification
generation, work package generation, evaluation support — each implemented
as its own well-defined function/endpoint with validated input and output.

This is the default because most of the procurement workflow (see
[../design/procurement-workflow.md](../design/procurement-workflow.md)) has
a predictable, largely fixed sequence, and because the product's core
commitments — explainability, auditability, and human review at every
important transition (see [../product/product.md](../product/product.md))
— are all easiest to guarantee when each AI operation is simple, isolated,
and inspectable. A fixed pipeline of single-purpose calls is trivially
testable, its behavior is reproducible, and every step is independently
auditable. None of that is true by default of an agentic loop.

## When a Bounded Agentic Workflow May Be Justified

A level-3 bounded agentic workflow is worth considering only where a task
genuinely cannot be reduced to a fixed pipeline — specifically, where the
number and content of steps depends on intermediate results in a way the
application can't predetermine.

**Worked example: iterative requirement clarification.** Turning a vague
problem description into sufficiently complete structured requirements may
not be a one-shot operation. A bounded agentic workflow here would:

1. Analyze the current requirement state (what's been extracted and
   confirmed so far).
2. Determine whether the information is sufficient to proceed.
3. If not, generate targeted clarification questions for the gaps.
4. Incorporate the official's answers into the requirement state.
5. Repeat from step 1 — until an explicit, bounded completion condition is
   reached (e.g. a maximum number of clarification rounds, or a confidence/
   completeness threshold), or the official ends the loop manually.

This is a reasonable candidate for level 3 because the *number of rounds
and the specific questions* genuinely depend on what the official says, and
that can't be fixed in advance the way a linear pipeline can. It is still a
single, narrowly-scoped responsibility ("get requirements to a sufficient
state"), not a general-purpose agent.

Other candidates worth evaluating the same way if they arise:
- Discovery filter selection that genuinely can't be reduced to a fixed
  rule set for a given problem description.
- Any task where "how many steps" is inherently data-dependent, not just
  "the task has multiple steps" (a fixed pipeline already handles the
  latter).

A task does **not** qualify for level 3 just because it involves multiple
AI calls, multiple data sources, or multiple output fields — those are
handled by a fixed pipeline (level 2).

## Constraints for Any Bounded Agentic Component

If a level-3 component is proposed, it must be documented and reviewed
against every constraint below before implementation. A component that
cannot satisfy all of these should be redesigned as a fixed pipeline
instead, not implemented as a looser agent.

- **Explicit goal and responsibility.** One sentence describing exactly
  what the component is trying to achieve — not a general capability.
- **Bounded number of iterations.** A hard maximum loop count, enforced in
  code, not left to the model to decide when to stop.
- **Explicit termination conditions.** Concrete, checkable conditions for
  success, failure, and "give up and hand back to the official" — defined
  before implementation, not discovered at runtime.
- **Limited and explicitly defined tool access.** The component can only
  call the specific functions/endpoints it needs for its stated
  responsibility — no general-purpose or open-ended tool access.
- **Structured state and structured outputs.** Every intermediate and
  final state is a validated, structured object — never raw free-text
  passed between iterations untouched.
- **Logging/auditability of important agent actions.** Each iteration's
  inputs, decision, and output are logged in enough detail to reconstruct
  why the loop did what it did, consistent with
  [../product/requirements.md](../product/requirements.md) auditability
  requirements.
- **No direct modification of confirmed application state.** The
  component may only write to AI-suggestion state; promoting anything to
  confirmed state still requires the normal human approval path (see
  [../architecture/database.md](../architecture/database.md), AI
  Suggestions vs. Confirmed State).
- **No autonomous procurement decisions.** Under no circumstances does a
  bounded agentic component conclude a workflow stage or record a
  procurement decision on its own.
- **Human review before important workflow transitions.** The loop's
  output feeds into the same human-review checkpoint any other AI output
  would (see [../design/procurement-workflow.md](../design/procurement-workflow.md))
  — it does not get to skip that checkpoint because it "iterated more."

## A Bounded Component Is Not a Multi-Agent Architecture

Approving one bounded agentic workflow (level 3) for one well-justified
responsibility does **not** imply adopting a multi-agent framework (level
4), and does not open the door to giving every capability its own agent by
default. Each candidate is evaluated independently against
[When a Bounded Agentic Workflow May Be Justified](#when-a-bounded-agentic-workflow-may-be-justified)
and the constraints above. A level-4 multi-agent architecture — multiple
coordinating agents, an orchestrator delegating across them — would need
its own, separately justified case: a demonstrated need for several
distinct responsibilities to negotiate or hand off to each other
dynamically, which is not currently identified anywhere in the product
scope.

## Current Assessment

No capability in the current product scope has been confirmed to require
even a bounded agentic workflow yet, let alone multi-agent orchestration.
The core system flow (see
[../product/problem-statement.md](../product/problem-statement.md)) is a
largely fixed pipeline of discrete AI-assisted steps interleaved with human
checkpoints, which favors simple, composable AI service endpoints (levels 1
and 2) over agentic orchestration.

**This is a default position, not a permanent ruling.** Iterative
requirement clarification (above) is the most plausible current candidate
for a bounded agentic workflow, but it has not been approved for
implementation — it should be proposed here with its specific design
against the constraints above before being built.

## What to Avoid

- Introducing an agent framework (e.g. LangChain agents, AutoGPT-style
  loops) as infrastructure before a specific task justifies it.
- Treating "this task has several steps" as justification for level 3 —
  most multi-step tasks are level-2 fixed pipelines.
- Letting an agentic component take actions that change confirmed
  application state without a human-review checkpoint (violates the
  human-in-the-loop principle — see
  [../product/product.md](../product/product.md)).
- Open-ended, unbounded agent loops in a system that must remain
  explainable and auditable.
- Escalating a single approved bounded workflow into a general-purpose
  multi-agent framework without a separately justified case.

## Related Documents

- [ai-system.md](ai-system.md)
- [../product/product.md](../product/product.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
- [../architecture/database.md](../architecture/database.md)
- [../architecture/decisions.md](../architecture/decisions.md)
