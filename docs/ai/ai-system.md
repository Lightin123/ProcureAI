# AI System Overview

**Status:** Partially implemented. Requirement extraction (Milestone 3),
work-package decomposition (Milestone 4), vendor response reading
(Milestone 9), and vendor capability-insight
generation (Milestone 6) are implemented, each behind the same three-
provider selection described below. Semantic vendor matching, document
information extraction, proposal analysis, and candidate comparison remain
planned — see [vendor-discovery.md](vendor-discovery.md),
[rag-and-semantic-search.md](rag-and-semantic-search.md), and
[evaluation-and-ranking.md](evaluation-and-ranking.md) for what exists
versus what is next.

The service runs on FastAPI at `127.0.0.1:8000` and is called only by the
Express backend.

## Implemented Capabilities

`POST /internal/v1/requirement-analysis` (Milestone 3) takes a project
title, problem description, already-recorded requirements, and answered
clarifications, and returns validated `requirements` and
`clarification_questions`, each with a rationale.

`POST /internal/v1/work-package-decomposition` (Milestone 4) takes
confirmed requirements and returns suggested work packages — title,
description, scope, deliverables, dependencies, complexity, priority, and
an AI reasoning field — following the same provenance pattern as
requirement analysis (D55).

`POST /internal/v1/vendor-capability-insights` (Milestone 6) takes a
vendor's capability document and returns a positioning summary, strengths,
gaps, and suggested opportunity areas — advisory only; nothing in vendor
matching, verification, or eligibility reads this output back.

`POST /internal/v1/response-evaluation-insights` (Milestone 9) takes one
submitted vendor response and returns a summary, a reading of technical fit and
experience relevance, strengths, weaknesses, points requiring human attention,
and the section and verbatim quote each observation was drawn from. Advisory
**structurally**, not by label (D89): the request and response schemas carry no
score, rank, weight or recommendation field, the result is stored in its own
append-only table with no score column, and nothing in the deterministic
evaluation pipeline imports the AI client or reads that table. This is also the
first endpoint whose input is written by somebody with an interest in how it is
assessed, so the prompt instructs the model to ignore any instruction inside
the response and to record the attempt as a point for human attention — and the
structural separation means a successful injection can mislead one advisory
paragraph without moving a score, a rank or a decision.

All four endpoints are implemented behind the same three providers:

- **`anthropic`** — calls Claude through the official `anthropic` Python SDK
  using structured outputs, so the response is schema-constrained rather than
  parsed from free text. The model is configurable via `ANTHROPIC_MODEL`
  (default `claude-sonnet-5`) — see D27 in
  [../architecture/decisions.md](../architecture/decisions.md).
- **`openai_compatible`** — any OpenAI-compatible chat-completions endpoint,
  targeted purely by configuration (`AI_BASE_URL`, `AI_MODEL`): Groq, xAI/Grok,
  OpenRouter, Together, or a local Ollama (D38). **This is the provider the
  project currently runs on**, against Groq with `openai/gpt-oss-120b` (D41). Because these endpoints honour
  JSON schemas less strictly, output is requested in JSON mode, validated with
  Pydantic, and retried a bounded number of times; output that never validates
  is rejected (D40).
- **`stub`** — deterministic keyword-based provider requiring no API key, so
  the platform stays runnable and demonstrable without credentials (D36).

Selection is automatic, in order: `AI_API_KEY` present → `openai_compatible`;
else `ANTHROPIC_API_KEY` present → `anthropic`; else `stub`. `AI_PROVIDER`
overrides explicitly. The OpenAI-compatible settings are namespaced `AI_*`
rather than `OPENAI_*` so an unrelated ambient `OPENAI_API_KEY` is never
picked up by mistake (D39).

### Free-tier operating limits

Groq's free tier caps throughput at **8,000 tokens per minute**, counted as
prompt plus reserved `max_tokens`. Two consequences are baked into the
defaults:

- `AI_MAX_TOKENS` defaults to 3,000, not 8,000. A higher value makes a single
  request exceed the per-minute budget and the provider rejects it with
  HTTP 413.
- The prompt states the output shape compactly rather than embedding the
  generated JSON Schema, which cut it by roughly half (D42).

Exceeding the cap surfaces as an actionable message telling the official to
lower `AI_MAX_TOKENS` or wait, not a raw HTTP status. Rate limits,
authentication failures, and unavailable models are handled the same way.

Model IDs on Groq change; list what a key can reach with
`GET {AI_BASE_URL}/models` rather than assuming a remembered name is current.

Milestone 3 uses a **fixed pipeline**, not an agentic loop — the official
controls re-analysis manually (D35, and see [ai-agents.md](ai-agents.md)).

## Role of AI in the Product

AI must perform meaningful, specific tasks inside the procurement workflow.
It is not a generic assistant layered on top of the product — see
[../product/product.md](../product/product.md) for the "What ProcureAI Is
Not" section.

AI capabilities, implemented vs. planned:

- Requirement extraction — implemented (Milestone 3)
- Requirement classification — implemented (Milestone 3)
- Missing-information detection — implemented (Milestone 3)
- Clarification-question generation — implemented (Milestone 3)
- Work-package generation — implemented (Milestone 4)
- Vendor capability positioning/gap insight — implemented (Milestone 6),
  advisory only
- Semantic vendor discovery (embeddings via pgvector) — implemented
  (Milestone 6, part 2) — see
  [rag-and-semantic-search.md](rag-and-semantic-search.md)
- Candidate comparison and recommendation explanation for **suppliers** —
  implemented (Milestone 6, part 2), with no model involved at all: the
  explanations are assembled from stored values and quoted with them
- Proposal analysis — implemented (Milestone 9), advisory only
- Response evaluation, comparison and ranking — implemented (Milestone 9) and
  **fully deterministic**; the AI reading sits beside the numbers, never inside
  them
- Document information extraction from attachment *contents* — planned, not
  started; see [document-intelligence.md](document-intelligence.md)

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

- Prompting strategy / prompt management approach beyond the single versioned
  prompt (`requirement-analysis-v1`) used today.
- Whether any AI capability requires fine-tuning or if prompting + structured
  output is sufficient for the hackathon scope.
- Latency/cost tradeoffs for AI calls in the workflow (NFR9 sets no targets).
- Whether the analysis prompt and output quality need tuning against real
  procurement descriptions on each provider (U25).

The provider and model themselves are **decided and configurable** — see D27,
D38 and D41 in [../architecture/decisions.md](../architecture/decisions.md).

## Related Documents

- [ai-agents.md](ai-agents.md)
- [rag-and-semantic-search.md](rag-and-semantic-search.md)
- [document-intelligence.md](document-intelligence.md)
- [vendor-discovery.md](vendor-discovery.md)
- [evaluation-and-ranking.md](evaluation-and-ranking.md)
- [../product/product.md](../product/product.md)
