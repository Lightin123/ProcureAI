# RAG and Semantic Search

**Status:** Planned. This is the **immediate next implementation priority**
after the vendor onboarding and opportunity-matching work in Milestone 6
(see [../development-roadmap.md](../development-roadmap.md)), but no
embedding model, retrieval pipeline, or pgvector schema exists yet. The
`pgvector` PostgreSQL extension is not enabled in any migration.

## Purpose

Semantic search is planned primarily for **work-package-to-vendor
matching**: matching a confirmed work package's normalized requirements
against a corpus of vendor capability data using vector similarity,
combined with deterministic structured filtering. See
[vendor-discovery.md](vendor-discovery.md) for the discovery flow this
supports, and [evaluation-and-ranking.md](evaluation-and-ranking.md) for
how the resulting candidates are ranked.

## Relationship to What Already Exists

Semantic search is additive to, not a replacement for, the deterministic
lexical matching already implemented (`apps/api/src/vendor/matching.ts`).
The target architecture is **hybrid retrieval**: lexical and semantic
search run as parallel candidate sources, and their results are combined
before ranking — not a wholesale replacement of the lexical layer once
embeddings exist. See [Hybrid, Not Semantic-Alone](#hybrid-not-semantic-alone-why)
below for why.

The vendor capability document already built during onboarding (a
natural-language document derived from structured answers plus the
vendor's own free text, rebuilt on every profile write — see
[vendor-discovery.md](vendor-discovery.md)) is the artifact this phase
embeds. No change to the vendor profile data model is needed to start this
work; the missing piece is the embedding + storage + retrieval pipeline
itself.

## Target Hybrid Matching Architecture

```
CONFIRMED WORK PACKAGE
        |
        v
Requirement Normalization
        |
        v
Structured Eligibility Filtering
        |
        v
Hybrid Candidate Retrieval
   +---------------+----------------+
   |                                |
   v                                v
Lexical Search                Semantic Search
   |                                |
   +---------------+----------------+
                    |
                    v
              Candidate Pool
                    |
                    v
          Multi-Factor Ranking
                    |
                    v
       Explainable Recommendations
                    |
                    v
       Government Human Review
                    |
                    v
             Vendor Shortlist
                    |
                    v
             Vendor Invitation
                    |
                    v
              Vendor Response
                    |
                    v
     Proposal / Response Evaluation
                    |
                    v
      AI-Assisted Decision Support
                    |
                    v
           Human Final Decision
```

Everything from **Government Human Review** downward is workflow, not
retrieval, and is described in
[../development-roadmap.md](../development-roadmap.md) Milestones 7–9; it
is included here only to show where semantic search's output feeds. The
retrieval-specific stages:

- **Requirement Normalization** and **Structured Eligibility Filtering**
  happen before either search branch runs — see
  [vendor-discovery.md](vendor-discovery.md#eligibility-filtering-planned)
  for the eligibility gate's criteria. Filtering first means semantic
  search only ever ranks vendors who could actually take the work, rather
  than surfacing a topically-similar but ineligible vendor and relying on
  ranking to bury them.
- **Lexical Search** is the matching already implemented today, applied
  going forward to the (smaller, pre-filtered) eligible candidate set
  instead of every vendor.
- **Semantic Search** is the new capability this document plans: embed the
  normalized work package, retrieve vendors by vector similarity over
  stored capability embeddings.
- **Candidate Pool** is the union of both branches, so a vendor found only
  by one method is not silently dropped.
- **Multi-Factor Ranking** combines lexical score, semantic similarity, and
  the other relevance signals — see
  [evaluation-and-ranking.md](evaluation-and-ranking.md).

## Planned Approach

1. Vendor capability documents (already derived during onboarding) are
   embedded into vectors by the AI service.
2. Vectors are stored in PostgreSQL via the pgvector extension, owned
   exclusively by the Express backend, consistent with the rest of the
   data model (see [../architecture/database.md](../architecture/database.md)).
3. When matching vendors to a confirmed work package, the work package's
   normalized requirement text is embedded and compared against stored
   vendor vectors using similarity search (e.g. cosine similarity).
4. Semantic results are combined with the lexical search and the
   deterministic eligibility filter — never AI-driven — to produce the
   final candidate pool, per FR4 in
   [../product/requirements.md](../product/requirements.md).

## Hybrid, Not Semantic-Alone — Why

- Semantic search alone risks surfacing vendors that are topically similar
  but fail hard constraints (wrong jurisdiction, missing mandatory
  certification) — this is why eligibility filtering runs *before*
  retrieval, not as a post-hoc filter on semantic results.
- Lexical search alone (the current implementation) risks missing vendors
  whose capabilities are described differently than the work package's
  wording — the specific gap semantic search closes.
- Running both and combining results keeps matching interpretable: an
  official can see whether a candidate matched lexically, semantically, or
  both, rather than trusting a single embedding-derived number.

## Retrieval-Augmented Generation (RAG)

RAG — using retrieved context to ground an LLM's output — is a candidate
technique for:

- Grounding match explanations in the actual retrieved vendor data rather
  than relying on model recall (the "AI-Assisted Explanation" stage in
  [vendor-discovery.md](vendor-discovery.md) — explanation only, never
  eligibility or ranking).
- Grounding proposal/response evaluation (Milestone 9) in the actual
  submitted documents.
- Potentially grounding requirement extraction in prior similar
  procurement projects, if/when historical data exists.

**This remains a design intention, not a confirmed implementation plan.**
No RAG pipeline has been designed in detail.

## Explicitly Not Yet Decided

- Embedding model/provider.
- Vector dimensionality.
- pgvector indexing strategy (e.g. IVFFlat vs. HNSW) and index tuning.
- Similarity metric and score thresholds for "relevant" matches.
- Exact formula for combining lexical score, semantic similarity, and the
  other relevance-ranking signals into one ranked list — see
  [evaluation-and-ranking.md](evaluation-and-ranking.md).
- Whether RAG is used anywhere beyond match explanation and proposal
  evaluation in the near term.
- Re-ranking strategy (if any) after initial hybrid retrieval.
- Whether embeddings are recomputed synchronously on every profile write
  (consistent with the current synchronous-analysis pattern, D30) or on a
  schedule/trigger — an embedding call is a new class of external AI
  dependency on the write path that the current profile-save flow does not
  have.

## Related Documents

- [ai-system.md](ai-system.md)
- [vendor-discovery.md](vendor-discovery.md)
- [evaluation-and-ranking.md](evaluation-and-ranking.md)
- [../architecture/database.md](../architecture/database.md)
- [../development-roadmap.md](../development-roadmap.md)
