# Vendor / Startup Discovery

**Status:** Planned. Not implemented.

## Purpose

Given a procurement work package's structured requirements, discover
candidate startups/vendors likely to be a good fit — combining AI-driven
semantic matching with deterministic structured filtering, per FR4 in
[../product/requirements.md](../product/requirements.md).

## Planned Flow

1. A work package's requirement text is embedded (see
   [rag-and-semantic-search.md](rag-and-semantic-search.md)).
2. Semantic search over vendor capability embeddings returns candidates
   ranked by similarity.
3. Structured filters (sector, size, location, certifications, budget
   range, etc.) are applied — deterministically, not via AI — to narrow or
   validate the semantic results.
4. The combined candidate list is presented to the official for review; the
   official can adjust filters or manually add/remove candidates (FR4.3).

## Why Semantic Search + Structured Filtering (Not Either Alone)

- Semantic search alone risks surfacing vendors that are topically similar
  but fail hard constraints (e.g. wrong jurisdiction, missing mandatory
  certification).
- Structured filtering alone (keyword/category matching) risks missing
  vendors whose capabilities are described differently than the
  requirement's wording, which is exactly the gap semantic search is meant
  to close.
- Combining both keeps the discovery step interpretable: the official can
  see which candidates matched semantically vs. which passed which filters.

## Explicitly Not Yet Decided

- Source of vendor data for the hackathon demo (seeded/sample dataset vs.
  real registry data) — likely a seeded dataset, but unconfirmed.
- Ranking formula for combining semantic similarity score with filter
  matches.
- Whether vendors can self-register (see vendor representative role in
  [../product/users-and-roles.md](../product/users-and-roles.md)) in the
  hackathon build, or whether vendor data is admin-seeded only.

## Related Documents

- [rag-and-semantic-search.md](rag-and-semantic-search.md)
- [evaluation-and-ranking.md](evaluation-and-ranking.md)
- [../product/requirements.md](../product/requirements.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
