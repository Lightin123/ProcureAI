# RAG and Semantic Search

**Status:** Semantic search is **implemented**. The `pgvector` extension,
the embedding service, capability-vector storage, and the semantic half of
hybrid retrieval are all built and in use — see
[../development-roadmap.md](../development-roadmap.md) Milestone 6. RAG in
the generative sense (retrieved context grounding an LLM's output) is
**still not implemented anywhere**, and the matching pipeline deliberately
does not use it — see [RAG](#retrieval-augmented-generation-rag) below.

pgvector is **optional**, not assumed: migration `006` attempts
`CREATE EXTENSION vector` inside an exception guard and creates the vector
tables only where the extension exists. `semanticStorageAvailable()`
detects its absence at runtime and the system degrades to lexical-only
retrieval with a visible warning in the UI (decision **D64**). Migration
`007`, which narrows those columns to the current model's 384 dimensions,
is guarded the same way and no-ops where the extension is absent.

## Purpose

Semantic search serves **work-package-to-vendor matching**: matching a
confirmed work package's normalized requirements against a corpus of
vendor capability data using vector similarity, combined with
deterministic structured filtering. See
[vendor-discovery.md](vendor-discovery.md) for the discovery flow this
supports, and [evaluation-and-ranking.md](evaluation-and-ranking.md) for
how the resulting candidates are ranked.

## Relationship to What Already Exists

Semantic search is additive to, not a replacement for, the deterministic
lexical matching (`apps/api/src/vendor/matching.ts` at opportunity level,
and the lexical half of `apps/api/src/matching/retrieval.ts` at package
level). The architecture is **hybrid retrieval**: lexical and semantic
search run as parallel candidate sources and their results are unioned
before ranking. See
[Hybrid, Not Semantic-Alone](#hybrid-not-semantic-alone--why) below for why.

The vendor capability document built during onboarding (a
natural-language document derived from structured answers plus the
vendor's own free text, rebuilt on every profile write — see
[vendor-discovery.md](vendor-discovery.md)) is unchanged: it is what an
official and an LLM read, and it is still the source of the keyword set
the lexical half matches on. What gets **embedded** is narrower — a
*semantic document* derived from the same profile, described in
[The Semantic Document](#the-semantic-document) below (decision **D71**).
That is the one change the vendor data model needed: a
`vendor_profiles.semantic_document` column, added by migration `007`.

## Hybrid Matching Architecture

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
- - - - - - - - - - | - - - - - - - - - -  implemented above this line
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

Everything from **Vendor Invitation** downward is unbuilt workflow,
described in [../development-roadmap.md](../development-roadmap.md)
Milestones 7–9; it is shown here only to place where retrieval's output
feeds. The retrieval-specific stages, as built:

- **Requirement Normalization** and **Structured Eligibility Filtering**
  run before either search branch — see
  [vendor-discovery.md](vendor-discovery.md#eligibility-filtering) for the
  eligibility gate's checks. Filtering first means retrieval only ever
  ranks suppliers who could actually take the work.
- **Lexical Search** is a GIN-indexed array overlap on
  `vendor_profiles.capability_keywords`, requiring at least 2 overlapping
  strong terms, top 60.
- **Semantic Search** embeds the work package's *semantic document* and
  retrieves suppliers by pgvector cosine similarity over stored capability
  embeddings, top 60. The minimum similarity is **per embedding model**
  (decision **D72**) — 0.65 for the current default encoder — because
  cosine is not comparable across models.
- **Candidate Pool** is the union of both branches, deduplicated. Each
  candidate carries `retrievalSources` recording which half or halves
  found it, so a supplier found by only one method is neither dropped nor
  indistinguishable from one found by both.
- **Multi-Factor Ranking** combines capability overlap, semantic
  similarity, and five further signals — see
  [evaluation-and-ranking.md](evaluation-and-ranking.md).

Both halves draw on normalized terms with weight >= 0.45, capped at 40
terms.

## The Semantic Document

**What is embedded is not the full document** (decision **D71**). A
sentence encoder reads a fixed window and averages over what it finds, so
every sentence in the input competes for the same vector. A capability
document opens with a legal name, an entity type, registration numbers, an
address and a contact block; a work package's requirement set contains
compliance, budget and timeline clauses. Those fields are near-identical
across suppliers and across packages, and including them pulls every
vector towards one point.

So each side has a second, narrower rendering built alongside the full one:

- **Vendor** — `vendor_profiles.semantic_document`, built by
  `buildSemanticDocument` in `apps/api/src/vendor/capabilityDocument.ts`
  and returned as `semanticDocument` from `buildCapabilityDocument`. It
  carries the headline, capability summary, problem solved, value
  proposition, differentiators, core capabilities, expertise areas,
  problem domains, sectors served, sub-domains, industries, each offering
  (name, description, categories, tags), each past engagement (title,
  sector, description, outcome), and the industry-specific dynamic
  answers. It omits the legal name, entity type, registration numbers,
  addresses, contacts, delivery models, coverage and value bands, and the
  credentials list.
- **Work package** — `NormalizedWorkPackage.semanticDocument`: title,
  category, description, scope, deliverables, and only the FUNCTIONAL,
  NON_FUNCTIONAL and OTHER linked requirements. **COMPLIANCE, BUDGET and
  TIMELINE clauses are excluded** — they are near-identical across
  packages, and they are already enforced structurally by the eligibility
  gate rather than by similarity.

Nothing is lost by the omission. Every excluded field is a structured
column the eligibility gate and the ranking dimensions read directly,
which is a stricter use of it than blurring it into a vector. The full
`capability_document` and the full package `document` both still exist
and are unchanged.

Measured on the seeded registry — 4 confirmed work packages against 9
suppliers, every pair scored:

| Embedded text | Intended match, mean | Unrelated pair, mean | Top-1 correct |
|---|---|---|---|
| Full documents | 0.850 | 0.746 | 3 of 4 |
| Semantic documents | 0.829 | 0.678 | 4 of 4 |

The full-document run scored higher in absolute terms and ranked worse: a
road contractor out-scored a farmer producer company on a vegetable-supply
package. What matters is separation, not magnitude — on semantic documents
the lowest intended match sits **0.047 above** the highest unrelated one,
a clean margin where the full documents had none. This is a nine-supplier
registry; the numbers are a direction, not a benchmark.

## The Embedding Service

`apps/ai-service` exposes `POST /internal/v1/embeddings` behind an
`EmbeddingProvider` protocol (`apps/ai-service/app/embeddings/`). It is
configured **independently of the analysis provider** —
`EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL`,
`EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` — because embeddings and
analysis are different capabilities, and the provider that serves analysis
does not necessarily offer an embeddings API at all (decision **D66**).

Three providers exist. Resolution order: an explicit `EMBEDDING_PROVIDER`
wins; failing that, `openai_compatible` if `EMBEDDING_API_KEY` is set;
failing that, `local_onnx`. Valid values are `local_onnx`,
`local_concept`, `openai_compatible`.

### `local_onnx` — the default (decision D70)

**`BAAI/bge-small-en-v1.5`**, a trained sentence encoder running locally
on CPU through `fastembed`'s ONNX runtime — no torch, no GPU
(`app/embeddings/onnx_provider.py`, `LocalOnnxEmbeddingProvider`, reported
to the backend as `BAAI/bge-small-en-v1.5+v1`). It needs no API key:
fastembed pulls a quantised build of about **90 MB** once on first use and
caches it, after which the provider is fully offline. Inference is
deterministic for a given model build, so a stored vector stays
reproducible.

Vectors are **384 dimensions** — the encoder's native width, not a
configured preference. Migration `007` narrows the stored columns from
1024 to 384 accordingly, rather than padding a 384-wide vector into a
column asserting a width no model produces.

**Long text is chunked and the chunks are pooled.** The encoder's context
is 512 tokens and a capability document runs to several thousand words, so
embedding it whole would encode the organisation's address and drop its
capabilities. Text is split into 350-word windows with 50 words of overlap
(at most 12 chunks, so one malformed record cannot turn a match run into a
minute of inference), every chunk is encoded, and the chunk vectors are
mean-pooled and L2-normalised into one document vector. Unit length also
means a long document cannot acquire a larger magnitude than a short one.

The reason a *local* model is the default is unchanged from D66: semantic
retrieval partly determines which suppliers an official sees, so it must
not switch itself off — or start costing money per match — depending on
whether an unrelated API key is present in the environment.

**Its limits, stated plainly.** It is a general-purpose English sentence
encoder. Nothing here fine-tunes it, and it was not trained on Indian
government procurement text, so its notion of "similar" is
general-language similarity rather than domain judgment; it has no
particular knowledge of scheme names, statutory terms or Indian sector
vocabulary beyond what ordinary English gives it. Its 512-token context is
handled by chunking and averaging rather than by the model itself, so a
long profile's vector is a mean and one strong sentence inside it is
diluted. And its similarity is compressed into a narrow high band —
genuinely unrelated procurement text sits around 0.68 and a strong match
around 0.83 — so a raw cosine from it reads as "high" when it means
"unrelated". That last point is precisely why thresholds and scores are
[calibrated per model](#per-model-calibration) instead of being read off
the similarity directly.

### `local_concept` — the offline fallback (decision D70)

The deterministic concept-space model that was previously the default
(`app/embeddings/local_provider.py`). It is **not** a trained neural
encoder. A vector is built in two halves, and the model is parameterised
by dimension so it emits 384 like the encoder:

- A **concept half** — one dimension per domain in a curated 36-concept
  procurement lexicon (`app/embeddings/concepts.py`).
- A **hashed lexical half** — a hashed bag of the document's own tokens,
  preserving specific vocabulary the lexicon does not cover.

Each half is normalised separately, then combined (concept weight 0.94,
lexical weight 0.34) and L2-normalised.

It is selected by `EMBEDDING_PROVIDER=local_concept`, and automatically —
with a loud warning in the logs — when the encoder cannot be loaded at
all, for instance on a machine with no network on its first run. A
deployment that cannot download the model therefore still gets working
semantic retrieval rather than none. It also genuinely generalises within
the lexicon's reach: measured, "horticultural produce…" against "fresh
agricultural vegetables…" reaches roughly **0.88 cosine with no shared
content token**, while unrelated domains fall to 0.0.

**Its limitations are real and are why it is no longer the default.** It
is a bag-of-concepts model. It does not read word order. It does not read
negation — "must not involve hazardous chemicals" and "involves hazardous
chemicals" are near-identical to it. It generalises only as far as the
curated lexicon reaches; a domain absent from those 36 concepts falls back
to the hashed lexical half and behaves close to keyword matching, and it
does so silently. It is **not** a sentence encoder and should not be
described as one.

### `openai_compatible` — opt-in

Hosted embeddings from any OpenAI-compatible endpoint. It requests the
configured dimensionality explicitly and **validates the returned vector
width** rather than trusting it, so a provider silently returning a
different size fails loudly instead of corrupting the index. No hosted
model has been measured against this corpus, so one runs on the
conservative uncalibrated defaults below.

## Per-Model Calibration

Cosine is not comparable across models (decision **D72**). The encoder
puts unrelated procurement text near 0.68; the concept model puts it at
0.0. A single threshold cannot serve both — the encoder's numbers read
through the concept model's calibration would admit every supplier as a
candidate and then score every one of them as a strong match.

The numbers therefore live in one table keyed by model,
`apps/api/src/matching/calibration.ts`, and both `retrieval.ts` (the SQL
distance cut) and `ranking.ts` (the 0–100 rescale of the semantic
dimension) read from it:

| Model | Retrieval threshold | Score floor (→ 0) | Score ceiling (→ 100) |
|---|---|---|---|
| `BAAI/bge-*` | 0.65 | 0.62 | 0.85 |
| `local-concept*` | 0.35 | 0.12 | 0.82 |
| Anything unmeasured | 0.60 | 0.55 | 0.90 |

The `bge` row is measured over the seeded registry, every confirmed work
package against every supplier: intended matches scored 0.817–0.840 and
everything else 0.493–0.769. The floor sits just below the unrelated band
so an ordinary supplier scores low rather than middling. An unmeasured
model gets deliberately conservative defaults and the run **logs that it
is uncalibrated** — an under-retrieving model shows the official a short
list, which is visible, whereas a flooded pool looks like a working
ranking. Swapping models is then a measurement and a new row, not a hunt
for constants embedded in the ranking code.

## Storage and Regeneration

Vectors are stored in PostgreSQL via pgvector, owned exclusively by the
Express backend, consistent with the rest of the data model (see
[../architecture/database.md](../architecture/database.md)).

**Indexing is HNSW with `vector_cosine_ops`** (decision **D65**), not
IVFFlat. IVFFlat builds its list structure from the data present at index
time and degrades badly on a small or empty table — precisely the state
the supplier registry starts in and stays in through a demo. HNSW is
usable from the first row and needs no rebuild as the registry grows.
Cosine matches the normalised vectors the embedding service returns.

**Regeneration is keyed on a source digest, not on a write** (decision
**D67**). Each stored vector carries a SHA-256 of the exact text embedded
— now the *semantic* document, not the full one — plus a pipeline version.
A vector is recomputed only when its source text, the pipeline version, or
the `embedding_model` that produced it changes, and the sweep happens **at
match time**, not on the profile-save path. The model check is what makes
switching encoders safe: a vector from another model is stale by
definition, and migration `007` clears the stored vectors outright for the
same reason.

This resolves the sync-vs-async question this document previously left
open, and the answer is neither: the semantic document is rebuilt on
every profile write but its content usually does not change, so embedding
on write would mean an API call per keystroke during onboarding and would
put a new external AI dependency on a save path that currently has none.
A failed regeneration **leaves the previous vector in place** — a stale
embedding retrieves better than none, and deleting it would turn a
transient outage into lost data.

## Hybrid, Not Semantic-Alone — Why

- Semantic search alone risks surfacing vendors that are topically similar
  but fail hard constraints (wrong jurisdiction, missing mandatory
  certification) — this is why eligibility filtering runs *before*
  retrieval, not as a post-hoc filter on semantic results.
- Lexical search alone risks missing vendors whose capabilities are
  described differently than the work package's wording — the specific gap
  semantic search closes.
- Running both and combining results keeps matching interpretable: an
  official can see from `retrievalSources` whether a candidate matched
  lexically, semantically, or both, rather than trusting a single
  embedding-derived number.
- It is also what makes D64's optional-pgvector degradation honest. With
  the two halves independent, losing the semantic half costs recall, not
  correctness; ranking redistributes its weight so a lexical-only run
  stays on the same 0–100 scale and remains comparable to a full one.

## Retrieval-Augmented Generation (RAG)

RAG — using retrieved context to ground an LLM's output — is **not
implemented anywhere**, and the matching pipeline deliberately does not
use it. Match explanations are generated from stored data only: every
strength and gap line is read out of the database and quoted with the
value that produced it, with no model call in the explanation path. That
is stronger than grounding a generated narration in retrieved context,
because there is no generation step that could drift from the evidence.

RAG remains a candidate technique for:

- Grounding proposal/response evaluation (Milestone 9) in the actual
  submitted documents.
- Potentially grounding requirement extraction in prior similar
  procurement projects, if/when historical data exists.

**This remains a design intention, not a confirmed implementation plan.**
No RAG pipeline has been designed in detail.

## Previously Open, Now Decided

| Question | Resolution |
|---|---|
| Embedding model/provider | `BAAI/bge-small-en-v1.5` running locally on CPU by default; the deterministic concept model retained as the offline fallback; hosted `openai_compatible` opt-in — all behind one `EmbeddingProvider` protocol (**D66**, **D70**) |
| Vector dimensionality | 384, the encoder's native width; migrated down from 1024 by `007` (**D70**) |
| What text is embedded | A semantic document — capability-bearing prose only — not the full capability document (**D71**) |
| pgvector indexing strategy | HNSW with `vector_cosine_ops` (**D65**) |
| Similarity metric and threshold | Cosine; the threshold is per model (**D72**) — 0.65 for the current encoder — top 60 |
| Whether pgvector is required | No — optional at the schema level, with lexical-only degradation and a visible warning (**D64**) |
| Sync vs. async embedding generation | Neither — digest-keyed regeneration swept at match time (**D67**) |
| Combining lexical and semantic into one ranked list | Seven weighted dimensions, semantic weighted 20 of 100 — see [evaluation-and-ranking.md](evaluation-and-ranking.md) |

## Still Open

- Whether the calibration numbers in D72 hold at a registry size
  substantially larger than the demo's. They were measured against nine
  suppliers, which is too few for the similarity distribution to mean
  much, and they should be re-measured once it is not (U14).
- Whether a procurement- or India-tuned encoder would beat the
  general-purpose English one. Nothing is fine-tuned today, and no
  domain-adapted model has been evaluated.
- Whether the 36-concept lexicon needs to grow. It no longer sits on the
  critical path now that the encoder is the default, but it still governs
  quality on any machine running the offline fallback (U34).
- Re-ranking after initial hybrid retrieval — none is performed today;
  deferred to Milestone 11 along with learned ranking and query expansion.
- Whether RAG is used anywhere beyond proposal evaluation.

## Related Documents

- [ai-system.md](ai-system.md)
- [vendor-discovery.md](vendor-discovery.md)
- [evaluation-and-ranking.md](evaluation-and-ranking.md)
- [../architecture/database.md](../architecture/database.md)
- [../development-roadmap.md](../development-roadmap.md)
