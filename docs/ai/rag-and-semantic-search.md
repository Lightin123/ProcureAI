# RAG and Semantic Search

**Status:** Planned. Not implemented. No embedding model, retrieval
pipeline, or pgvector schema exists yet.

## Purpose

Semantic search is planned primarily for **vendor/startup discovery**:
matching structured requirements and work packages against a corpus of
vendor capability data using vector similarity, combined with structured
filtering (sector, size, location, certifications, etc.).

See [vendor-discovery.md](vendor-discovery.md) for the discovery flow this
supports.

## Planned Approach

1. Vendor capability data (descriptions, past work, sector tags) is
   embedded into vectors by the AI service.
2. Vectors are stored in PostgreSQL via the pgvector extension, owned by the
   Express backend.
3. When discovering vendors for a work package, the work package's
   requirement text is embedded and compared against stored vendor vectors
   using similarity search (e.g. cosine similarity).
4. Semantic results are combined with structured filters (deterministic,
   non-AI) to produce the final candidate list — see FR4 in
   [../product/requirements.md](../product/requirements.md).

## Retrieval-Augmented Generation (RAG)

RAG — using retrieved context to ground an LLM's output — is a candidate
technique for tasks such as:

- Grounding evaluation/comparison explanations in the actual retrieved
  vendor data rather than relying on model recall.
- Potentially grounding requirement extraction in prior similar procurement
  projects, if/when historical data exists.

**This is a design intention, not a confirmed implementation plan.** No RAG
pipeline has been designed in detail.

## Explicitly Not Yet Decided

- Embedding model/provider.
- Vector dimensionality.
- pgvector indexing strategy (e.g. IVFFlat vs. HNSW) and index tuning.
- Similarity metric and score thresholds for "relevant" matches.
- Whether RAG is used anywhere beyond vendor discovery in the hackathon
  scope.
- Re-ranking strategy (if any) after initial vector retrieval.

## Related Documents

- [ai-system.md](ai-system.md)
- [vendor-discovery.md](vendor-discovery.md)
- [../architecture/database.md](../architecture/database.md)
