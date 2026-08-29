# Evaluation and Ranking

**Status:** Partially implemented. **Part 1 — vendor ranking per work
package — is implemented** (`apps/api/src/matching/ranking.ts`), along
with eligibility as a distinct prior gate. A separate, coarser
project-level scoring model also remains in `apps/api/src/vendor/matching.ts`
for the vendor-facing opportunity feed. **Part 2 — vendor-response
evaluation — is not implemented** and depends on Milestone 8 existing
first; see [../development-roadmap.md](../development-roadmap.md)
Milestone 9.

This document covers two related but distinct capabilities: **vendor
ranking per work package** (built) and **vendor response/proposal
evaluation** (later — Milestone 9, requires vendor responses to exist
first, which requires Milestone 8).

## Three Concepts That Must Not Be Conflated

Both ranking capabilities described in this document share one governing
principle, established in
[vendor-discovery.md](vendor-discovery.md#eligibility-filtering):

| Concept | Question | Nature |
|---|---|---|
| **Eligibility** | Can this vendor/response reasonably participate? | Hard gate, deterministic, pass/fail |
| **Relevance / Evaluation** | How well does it match / perform against criteria? | Scored, multi-dimensional |
| **Ranking** | Among eligible candidates, which are best? | Ordering derived from the scores |

A single opaque score that mixes "is this vendor allowed to bid" with "how
good is this vendor" is not acceptable output under this principle — the
official must be able to see *why* something is excluded versus merely
ranked low.

## Part 1 — Vendor Ranking Per Work Package (Implemented)

`apps/api/src/matching/ranking.ts`, `RANKING_VERSION = 1`. The final
scoring stage of the pipeline in
[vendor-discovery.md](vendor-discovery.md) and
[rag-and-semantic-search.md](rag-and-semantic-search.md). It ranks
already-eligible candidates (eligibility is a prior, separate stage — see
the table above) for a specific work package.

Ranking is **fully deterministic. No LLM participates in scoring**, and
none participates in the explanations either.

### The Seven Ranking Dimensions

Weights sum to 100. Each dimension returns a 0–100 score plus a
human-readable `detail` string explaining how it arrived there.

| Dimension | Weight | What it measures |
|---|---|---|
| Capability fit | 25 | Weighted overlap between the package's normalized terms and the supplier's capability keywords |
| Semantic relevance | 20 | Cosine similarity between the package's semantic-document embedding and the supplier's, rescaled per embedding model |
| Relevant experience | 18 | Prior projects and offerings relevant to this package |
| Capacity and delivery fit | 12 | Declared contract value brackets and delivery capability against what the package needs |
| Geographic fit | 10 | Declared operating regions against the package's delivery regions |
| Compliance and credentials | 9 | Certifications and credentials held, and their validity |
| Verification and credibility | 6 | Verification state and profile completeness |

### The Semantic Dimension Is Rescaled Per Model

Raw cosine is not a score, and it is not comparable across embedding
models: the current sentence encoder places genuinely unrelated
procurement text near 0.68, while the concept-model fallback places it at
0.0. Feeding one model's numbers through the other's scale would score
every supplier as a strong match. So the floor (cosine mapped to 0) and
the ceiling (cosine mapped to 100) are **per model**, held in
`apps/api/src/matching/calibration.ts` and read by ranking rather than
written into it as constants (decision **D72**):

| Model | Floor → 0 | Ceiling → 100 |
|---|---|---|
| `BAAI/bge-*` (default) | 0.62 | 0.85 |
| `local-concept*` (offline fallback) | 0.12 | 0.82 |
| Anything unmeasured | 0.55 | 0.90 |

The `bge` figures are measured over the seeded registry, every confirmed
work package against every supplier: intended matches scored 0.817–0.840
and everything else 0.493–0.769. The floor sits just below the unrelated
band so an ordinary supplier scores low rather than middling. A model
nobody has measured falls back to conservative defaults and the run logs
that it did, rather than presenting an uncalibrated number as if it were
one of these. The same table also supplies retrieval's minimum similarity
— see [rag-and-semantic-search.md](rag-and-semantic-search.md#per-model-calibration).

The dimension's **weight of 20 is unaffected** by any of this, as are the
other six weights: calibration changes what a cosine is worth on the 0–100
scale, not what that scale contributes to the overall score.

### Relevance Scaling — the Load-Bearing Mechanic

The four **qualifier** dimensions — capacity, geographic, compliance,
credibility — are each scaled by

```
relevance = max(capability, semantic) / 100
```

before they contribute. A supplier who is not relevant to this package
earns close to nothing from being large, verified, or nationally present.
This is what stops **a verified national supplier of the wrong thing from
outranking a smaller supplier of the right thing** — the failure mode that
a flat weighted sum produces by default, and the one that would most
damage trust in the recommendations.

Capability and semantic relevance are not scaled: they *are* the relevance
signal.

### Degradation When Semantic Retrieval Is Unavailable

Where pgvector is absent (decision **D64**), the semantic dimension's
weight of 20 is **redistributed across the remaining six dimensions rather
than lost**. A lexical-only run therefore stays on the same 0–100 scale
and remains comparable to a full run, instead of every supplier appearing
20 points worse for an infrastructure reason. The UI shows a visible
warning that the run was lexical-only.

### Bands

| Band | Overall score |
|---|---|
| `STRONG` | >= 65 |
| `MODERATE` | >= 40 |
| `LIMITED` | below 40 |

### Individually Inspectable, Not One Opaque Score

Every dimension is returned separately with its own score, weight, and
supporting detail, and the UI renders them as per-dimension bars. An
official can decompose any overall number at any time. Each run is
persisted with the weights it used and the pipeline versions it ran
(decision **D68**), so a past ranking stays interpretable after the
weights or the embedding model have changed.

### Recommendation Output

Each supplier recommendation for a work package carries:

- Overall match score and band (`STRONG` / `MODERATE` / `LIMITED`).
- Ranking position among eligible candidates.
- Eligibility result — passed checks, failed checks, and warnings, each
  quoting the requirement and the evidence.
- All seven dimension scores, each with its detail string.
- Matched capabilities and missing capabilities.
- Relevant experience and relevant offerings.
- Credentials.
- Strengths and gaps.
- A human-readable explanation.

**Every one of these lines is derived from stored data**, quoted with the
value it came from — not generated by a model. Excluded suppliers are
stored and shown too, with the check they failed, so "who did the system
rule out, and why" is answerable after the fact.

## Part 2 — Vendor Response / Proposal Evaluation (Not Built — Milestone 9)

**None of this section is implemented.** No RFI is issued, no vendor
response is collected, no document is parsed, and no response is
evaluated. It requires Milestone 8 (response collection) to exist first,
which requires Milestone 7 (invitation) — neither of which is built. The
material below is specification, not description.

Once Milestone 8 (vendor response collection) exists, evaluate the actual
submitted RFI responses, proposals, or quotations against a work package's
requirements — a different input (a vendor's *response document*, not
their *capability profile*) evaluated for a different purpose (did this
specific submission satisfy what was asked, not "is this vendor generally
a good fit").

### Evaluation Dimensions (as specified)

- Technical fit
- Budget compatibility
- Timeline
- Experience
- Compliance
- Semantic match to requirements

### Deterministic vs. AI-Assisted

Consistent with the "deterministic rules where appropriate" principle (see
[../product/product.md](../product/product.md)) and the pattern already
used for AI output throughout the platform (schema-validated, provenance-
tracked, human-reviewable):

- **Deterministic:** budget compatibility (numeric comparison), compliance
  checks against a checklist, timeline feasibility against stated
  constraints.
- **AI-assisted:** technical fit assessment, experience relevance,
  semantic match to requirements — dimensions that require interpreting
  free text or comparing capability descriptions to requirements.

Exact scoring formulas and weighting are not yet designed.

### Structured Comparison

- Structured extraction of key information from vendor submissions
  (document intelligence — see
  [document-intelligence.md](document-intelligence.md)).
- Requirement-by-requirement comparison across responding vendors.
- Identification of strengths, weaknesses, and missing information.
- Compliance checking.
- Side-by-side vendor comparison with explainable rankings.

## The AI / Deterministic / Human Boundary

This boundary applies to both parts of this document and is the platform's
core trust principle for anything touching a procurement decision:

- **AI Analysis** identifies and summarizes evidence — it reads free text,
  surfaces relevant passages, and drafts explanations.
- **Deterministic Evaluation** applies defined scoring criteria to that
  evidence and to structured data.
- **Human Decision** — the official reviews, can override anything, and
  makes the binding procurement decision.

AI may convert structured matching or evaluation evidence into a clear
explanation, but **AI-generated explanations must never independently
determine eligibility or override deterministic ranking or scoring logic.**
This is a trust and auditability requirement specific to government
procurement, not a general-purpose UX preference — an official (and, on
review, an auditor) must be able to trace any ranking back to
deterministic, inspectable criteria, with AI narrating the evidence rather
than being the evidence.

Part 1 as built goes one step further than this floor: no model is invoked
in the package-matching pipeline at all, including for its explanations,
which are assembled from stored values and quoted with them. That removes
even the narration layer as a place where drift from the evidence could
occur. Part 2, when built, will need genuine AI-assisted judgment for
technical fit and so will sit exactly at the boundary described above
rather than above it.

## Ranking and Optimization Beyond a Single Package

"Optimization" per the original system flow may extend beyond ranking
vendors for one work package to selecting a good combination of vendors
across all of a project's work packages — one vendor serving several
packages, capacity limits, minimizing vendor count vs. preferring
specialists, package dependencies. This is a **future idea**, deliberately
sequenced after single-package ranking is reliable — see
[../development-roadmap.md](../development-roadmap.md) Milestone 11
("Multi-Package and Vendor Allocation"). Building allocation optimization
before per-package ranking is trustworthy would compound an unreliable
signal rather than fix it.

## Explainability Requirement

Every ranked recommendation, at either package-matching or
response-evaluation stage, must surface:

- The scores/assessments per dimension that contributed to it.
- The evidence used (e.g. which requirement matched which vendor
  capability or response section, which document field satisfied which
  compliance item).

A ranking without this accompanying explanation does not satisfy NFR1 in
[../product/requirements.md](../product/requirements.md).

## Explicitly Not Yet Decided

- Scoring scale and weighting for **response evaluation** (Part 2) — not
  designed. Package ranking's 25/20/18/12/10/9/6 weighting is settled and
  implemented; the opportunity-level feed keeps its separate 55/20/15/10.
- Whether the package-ranking weights are fixed, configurable per project,
  or configurable by an administrative role (see
  [../product/users-and-roles.md](../product/users-and-roles.md) — no such
  role exists today; `ADMIN` is oversight-only). They are fixed constants
  today.
- Whether the seven weights and the 65/40 band thresholds hold against a
  supplier registry substantially larger than the demo's. The same caveat
  applies to the per-model semantic calibration (D72): its floor and
  ceiling were measured against nine suppliers.
- Multi-work-package allocation optimization — future idea, unscheduled
  until Milestone 11.
- Learned ranking, query expansion, and reranking after retrieval —
  Milestone 11.

**Resolved since this list was written:** an unverified vendor is
*admitted with a warning*, not excluded and not rank-penalized; only a
`REJECTED` verification state is a hard exclusion. See
[vendor-discovery.md](vendor-discovery.md#eligibility-filtering).

## Related Documents

- [ai-system.md](ai-system.md)
- [vendor-discovery.md](vendor-discovery.md)
- [rag-and-semantic-search.md](rag-and-semantic-search.md)
- [document-intelligence.md](document-intelligence.md)
- [../development-roadmap.md](../development-roadmap.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
