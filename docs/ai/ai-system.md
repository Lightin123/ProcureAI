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
