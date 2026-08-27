# AI System Overview

**Status:** Partially implemented. Requirement extraction, constraint
identification, missing-information detection, and clarification-question
generation are implemented as of Milestone 3. Every other capability below
remains planned.

The service runs on FastAPI at `127.0.0.1:8000` and is called only by the
Express backend.

## Implemented Capability (Milestone 3)

`POST /internal/v1/requirement-analysis` takes a project title, problem
description, already-recorded requirements, and answered clarifications, and
returns validated `requirements` and `clarification_questions`, each with a
rationale.

Two providers implement the same interface:

- **`anthropic`** — calls Claude through the official `anthropic` Python SDK
  using structured outputs, so the response is schema-constrained rather than
  parsed from free text. The model is configurable via `ANTHROPIC_MODEL`
  (default `claude-sonnet-5`) — see D27 in
  [../architecture/decisions.md](../architecture/decisions.md).
- **`stub`** — deterministic keyword-based provider requiring no API key, so
  the platform stays runnable and demonstrable without credentials (D36).

Selection is automatic: the Anthropic provider is used when
`ANTHROPIC_API_KEY` is present, otherwise the stub. `AI_PROVIDER` overrides
this explicitly.

Milestone 3 uses a **fixed pipeline**, not an agentic loop — the official
controls re-analysis manually (D35, and see [ai-agents.md](ai-agents.md)).

## Role of AI in the Product

AI must perform meaningful, specific tasks inside the procurement workflow.
It is not a generic assistant layered on top of the product — see
[../product/product.md](../product/product.md) for the "What ProcureAI Is
Not" section.

Planned AI capabilities:

- Requirement extraction
- Requirement classification
- Missing-information detection
- Clarification-question generation
- Work-package generation
- Semantic vendor discovery (embeddings via pgvector)
- Document information extraction
- Proposal analysis
- Technical capability analysis
- Candidate comparison
- Recommendation explanation

Each capability corresponds to a specific step in
[../design/procurement-workflow.md](../design/procurement-workflow.md), not
a free-form chat interface.

## Design Principles

1. **Structured input/output.** All AI service endpoints accept and return
   Pydantic-validated schemas. Free-text LLM output is never returned
   directly to the caller without being parsed into a defined schema.
2. **Validated, not trusted.** Output from an LLM is treated as an
   untrusted suggestion until it passes schema validation and, where
   applicable, deterministic sanity checks.
3. **Hybrid with deterministic logic.** Wherever a task has objective,
   rule-based criteria (e.g. "is the proposal within budget"), deterministic
   logic is used instead of or alongside AI judgment. AI is reserved for
   tasks that genuinely require language understanding or semantic
   reasoning.
4. **Stateless AI service.** The AI service does not own persistent
   application state. It receives the data it needs per-request from the
   Express backend and returns results; the backend is responsible for
   persistence.
5. **Explainability by construction.** AI outputs that feed into
   recommendations must include the reasoning/evidence alongside the
   result, not just a bare score or label.

## Where AI Sits Architecturally

See [../architecture/architecture.md](../architecture/architecture.md).
Summary: `apps/web` -> `apps/api` -> `apps/ai-service`. The frontend never
calls the AI service directly; the Express backend mediates every AI
interaction.

## Not Yet Decided

- Specific LLM provider(s) and model(s).
- Prompting strategy / prompt management approach.
- Whether any AI capability requires fine-tuning or if prompting +
  structured output is sufficient for the hackathon scope.
- Latency/cost tradeoffs for AI calls in the workflow.

## Related Documents

- [ai-agents.md](ai-agents.md)
- [rag-and-semantic-search.md](rag-and-semantic-search.md)
- [document-intelligence.md](document-intelligence.md)
- [vendor-discovery.md](vendor-discovery.md)
- [evaluation-and-ranking.md](evaluation-and-ranking.md)
- [../product/product.md](../product/product.md)
