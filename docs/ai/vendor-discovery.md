# Vendor / Startup Discovery and Matching

**Status:** Partially implemented. Opportunity-level deterministic lexical
matching exists today. Work-package-level hybrid matching — the design
described in most of this document — is the current development priority
and is **not yet implemented**. See
[../development-roadmap.md](../development-roadmap.md) Milestone 6.

## Current Implementation

What exists today, in `apps/api/src/vendor/matching.ts` and the
`GET /api/v1/vendor/opportunities` / `GET /api/v1/vendor/dashboard`
endpoints:

- Matching operates at **procurement project ("opportunity") granularity**
  — a vendor is scored against a whole published project, not against an
  individual work package within it. There is no work-package-level
  matching yet.
- Matching is **deterministic lexical overlap only** — no embeddings, no
  vector search, no semantic component. Both the opportunity's text
  (title, published summary, accepted requirement text) and the vendor's
  capability keywords are tokenized through a shared stop-word filter that
  strips ordinary English and generic procurement vocabulary
  ("government", "department", "contract", "requirement", "solution",
  "compliance", and similar), so what remains is compared as plain term
  overlap.
- The score combines four weighted, individually-inspectable components:
  capability overlap (55%), declared industry/sector alignment (20%),
  geographic/delivery fit and government-scale readiness (15%), and
  credibility — public-sector experience, verification state, profile
  completeness (10%). Delivery fit and credibility are scaled by
  relevance, so a verified national supplier of the wrong thing cannot
  outrank a local supplier of the right thing.
- Every score returns matched terms, unmatched terms, and per-component
  detail — this is already explainable, just not yet semantic or
  package-scoped.
- **Eligibility is not a separate gate.** A vendor with no relevant
  capability still receives a (low) score rather than being filtered out
  before scoring; there is no hard eligibility pass/fail step today. See
  [Eligibility Filtering](#eligibility-filtering-planned) below for what
  that gate will need to check once it exists.
- The vendor capability profile already produces the artifact the next
  phase needs: on every profile write, the server derives a
  natural-language **capability document** (structured answers resolved to
  their labels, plus the vendor's own free-text descriptions preserved
  verbatim) and a normalized **capability keyword set**. This is what an
  embedding step would embed — it does not yet exist, but nothing about
  the profile data model needs to change to add it.

This is a genuine, useful precursor — it lets a vendor discover
plausible-fit opportunities and lets a department see who has expressed
interest — but it is **not** what FR4 in
[../product/requirements.md](../product/requirements.md) specifies (which
is package-level and semantic), and it should not be described as
"vendor discovery" in the FR4 sense in product conversations.

## Next Phase — Work Package to Vendor Matching

### Purpose

Given a **confirmed work package** — not a whole project — identify vendors
whose capabilities are relevant to that specific package, combining
AI-driven semantic matching with deterministic structured filtering, per
FR4 in [../product/requirements.md](../product/requirements.md).

### Matching Should Consider

- Work package title and description.
- Required products or services.
- Required capabilities, technical and non-technical.
- Industry, sector, and domain specialization.
- Delivery requirements and geographic coverage.
- Capacity.
- Certifications and compliance requirements.
- Previous relevant experience.
- Engagement model and number of concurrent engagements the vendor can
  sustain.
- Service levels and delivery commitments.
- The vendor's capability narrative, structured products/services,
  previous projects, and credentials — all of which the Milestone 6
  onboarding work already collects (see
  [../architecture/database.md](../architecture/database.md)).

### Planned Pipeline

```
Work Package
    |
    v
Requirement Normalization
    |
    v
Structured Eligibility Filtering
    |
    v
Semantic Candidate Retrieval
    |
    v
Deterministic Relevance Scoring
    |
    v
AI-Assisted Explanation
    |
    v
Ranked Vendor Recommendations
```

**Requirement Normalization.** A work package's title, description, scope,
and deliverables are turned into the same normalized term/entity form the
vendor capability document already produces, so both sides of the match are
expressed comparably before either filtering or retrieval runs.

**Structured Eligibility Filtering.** A hard, deterministic gate applied
*before* any similarity computation — see
[Eligibility Filtering](#eligibility-filtering-planned) below. Vendors that
fail eligibility are excluded from the candidate pool entirely; they are
not scored, ranked, or shown, though a rejected vendor's profile remains
visible to the official on request for context (e.g. to understand why the
candidate pool is thin).

**Semantic Candidate Retrieval.** Once pgvector is integrated (see
[rag-and-semantic-search.md](rag-and-semantic-search.md)), the normalized
work package is embedded and compared against stored vendor capability
embeddings via similarity search, returning a candidate pool that a purely
lexical pass would miss when a vendor describes the same capability in
different words. This runs *alongside* the deterministic lexical matching
already implemented, not instead of it — see
[rag-and-semantic-search.md](rag-and-semantic-search.md) for why hybrid
retrieval, not embeddings alone, is the intended architecture.

**Deterministic Relevance Scoring.** The existing multi-component scoring
approach (already proven at opportunity level) extends to package-level
inputs and the combined lexical + semantic candidate pool. See
[evaluation-and-ranking.md](evaluation-and-ranking.md) for how relevance
scoring and ranking relate, and why they stay separate concepts.

**AI-Assisted Explanation.** An LLM call may turn the structured matching
evidence (which terms matched, which eligibility checks passed, which
score components contributed) into a readable explanation for the official.
This step **never determines eligibility or overrides the deterministic
ranking** — it narrates evidence that already exists; see
[evaluation-and-ranking.md](evaluation-and-ranking.md) for this as a
trust/auditability principle, not just a UX nicety.

**Ranked Vendor Recommendations.** The output an official acts on:
ranked, eligible vendors per work package, each with its explanation —
feeding directly into Milestone 7 (shortlisting and invitation).

## Eligibility Filtering (Planned)

Eligibility and relevance are different questions and must not be
collapsed into one score:

| Concept | Question it answers |
|---|---|
| **Eligibility** | Can this vendor reasonably participate at all? |
| **Relevance** | How well does this vendor match the work package? |
| **Ranking** | Among eligible, relevant vendors, which are the best choices? |

A vendor can be perfectly eligible and a poor relevance match (a verified,
compliant road contractor is eligible for a road package and irrelevant to
a vaccine cold-chain package). A vendor can look highly relevant by
keyword overlap and still be ineligible (missing a mandatory certification,
wrong jurisdiction, unverified profile). Only vendors that pass eligibility
are scored for relevance and ranked; eligibility failure is a hard
exclusion, not a scoring penalty.

Planned eligibility criteria:

- Industry/sector compatibility with the work package.
- Required certifications present and, where the work package demands it,
  verified.
- Compliance requirements met.
- Geographic eligibility (the vendor's declared operating states cover the
  work package's delivery location).
- Capacity constraints (declared minimum/maximum project value brackets,
  concurrent-engagement limits) not already exceeded.
- Delivery capability consistent with what the package requires.
- Organization status active and profile not in a rejected state.
- Vendor **verification status** — whether an unverified vendor is
  excluded outright or included with a lower ceiling is an open product
  decision, not yet made.
- Vendor profile completeness above a minimum threshold.
- Any domain qualification the work package marks as mandatory rather than
  preferred.
- Any other work-package-specific mandatory condition an official sets.

None of this exists yet. The current implementation folds a version of
several of these signals (verification state, government-scale readiness,
completion percentage) into the *relevance* score's credibility component
rather than gating on them — that is a known simplification to correct
when this layer is built, not the intended long-term design.

## Vendor Ranking Per Work Package (Planned)

See [evaluation-and-ranking.md](evaluation-and-ranking.md) for the full
design of the ranking engine, the signals it combines, and the
explainability requirement each recommendation must satisfy.

## Why Hybrid, Not Semantic Search Alone

- Semantic search alone risks surfacing vendors that are topically similar
  but fail hard constraints (wrong jurisdiction, missing mandatory
  certification) — which is exactly why eligibility filtering is a
  separate, prior stage, not folded into the similarity score.
- Lexical/structured filtering alone (what exists today) risks missing
  vendors whose capabilities are described differently than the work
  package's wording — the gap semantic search closes.
- Combining both keeps matching interpretable: an official can see which
  candidates matched lexically vs. semantically vs. both, rather than a
  single opaque similarity number.

## Explicitly Not Yet Decided

- Exact ranking formula for combining lexical overlap, semantic
  similarity, and the other relevance signals listed above.
- Whether an unverified vendor is eligibility-excluded or included at a
  lower ranking ceiling.
- Embedding model, vector dimensionality, and pgvector indexing strategy
  — see [rag-and-semantic-search.md](rag-and-semantic-search.md).
- How multi-package vendor allocation (one vendor across several packages,
  capacity limits, minimizing vendor count vs. preferring specialists)
  composes with per-package ranking — see
  [../development-roadmap.md](../development-roadmap.md) Milestone 11.
  Deliberately deferred until single-package matching is reliable.

## Related Documents

- [rag-and-semantic-search.md](rag-and-semantic-search.md)
- [evaluation-and-ranking.md](evaluation-and-ranking.md)
- [../product/requirements.md](../product/requirements.md)
- [../development-roadmap.md](../development-roadmap.md)
- [../architecture/database.md](../architecture/database.md)
