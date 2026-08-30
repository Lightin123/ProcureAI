# Evaluation and Ranking

**Status:** Implemented. **Part 1 — vendor ranking per work package** is
built (`apps/api/src/matching/ranking.ts`), along with eligibility as a
distinct prior gate. **Part 2 — vendor-response evaluation** is built
(`apps/api/src/evaluation/`, Milestone 9): configured criteria, deterministic
weighted scoring, requirement-by-requirement compliance, missing-information
detection, side-by-side comparison, explainable ranking, advisory AI analysis
in a separate lane, and the human decision. A separate, coarser project-level
scoring model also remains in `apps/api/src/vendor/matching.ts` for the
vendor-facing opportunity feed.

This document covers two related but distinct capabilities: **vendor ranking
per work package**, which ranks *suppliers* against a package from their
capability profiles, and **vendor response evaluation**, which scores the
*submissions* those suppliers actually made. They are different inputs
assessed for different purposes and they are deliberately separate pipelines.

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

## Part 2 — Vendor Response Evaluation (Implemented — Milestone 9)

`apps/api/src/evaluation/`, `SCORING_VERSION = 1`. Starts from the
`READY_FOR_EVALUATION` responses Milestone 8 collects, and from the
requirement-by-requirement answers, section values and attachments already
stored. No new collection mechanism was needed.

A different input from Part 1 (a supplier's *submission*, not its *capability
profile*) evaluated for a different purpose (did this specific response satisfy
what was asked, not "is this supplier generally a good fit"). The two pipelines
share no scoring code, and neither reads the other's numbers. What the
evaluation does read from matching is the **eligibility verdict**, and it reads
it rather than re-deriving it: a second implementation of the gate is a rule
that can drift from the one that actually excluded people.

### The Stages

```
responses marked READY_FOR_EVALUATION
  -> configured criteria        (criteria.ts)   — validated for consistency
  -> thresholds resolved        (signals.ts)    — configured, else from the requirements
  -> requirement comparison     (compliance.ts) — one verdict per requirement
  -> deterministic scoring      (scoring.ts)    — weighted, reproducible
  -> explainable ranking        (ranking.ts)    — ordering plus its reasons
  -> persisted run + snapshot
  -> government comparison, then a human decision
```

Kept in separate modules for the same reason Part 1's five stages are (D63):
collapsing the comparison into the score would make "which requirements were
met" unanswerable except through a number, and collapsing the ranking into the
scoring would leave the ordering with no explanation of its own.

### Configured Criteria, Not Fixed Weights

Unlike Part 1, whose seven dimensions and weights are fixed constants, response
evaluation is **configured per work package** by the official (D86). Eight
criterion types are available, each declaring what it is scored from:

| Criterion | Scored from | Direction | Threshold |
|---|---|---|---|
| Price | `quoted_value_inr` | Lower is better | Budget ceiling (INR) |
| Delivery timeline | `estimated_duration_weeks` | Lower is better | Maximum weeks |
| Capacity | `committed_team_size`, corroborated by the profile | Higher is better | Minimum team size |
| Certifications and compliance | Mandatory certifications vs. recorded credentials, plus the compliance confirmation | Higher is better | — |
| Relevant experience | Recorded engagements overlapping the package's vocabulary, plus declared public-sector delivery | Higher is better | — |
| Technical response | Coverage of the technical fields plus stated positions on functional and non-functional requirements | Higher is better | — |
| Requirement compliance | The requirement-by-requirement comparison | Higher is better | — |
| Departmental question | One of the department's own response questions | Either | — |

Weights are integers that must sum to **100**.

### Internal Consistency Is Enforced, Not Advised

The load-bearing validation rule: **a criterion can only be scored from
information the department actually asked every supplier for.** Configuring a
price criterion on a work package whose commercial section is switched off
would score every supplier zero on a field none of them was asked to fill in,
and the ranking that followed would be meaningless in a way nobody reading it
could see. The check therefore refuses it, and refuses:

- weights that do not sum to 100;
- the same built-in criterion configured twice;
- a duplicate criterion key;
- a `CUSTOM` criterion with no question, with a question on another work
  package's form, or sharing a question with another criterion;
- a threshold on a criterion that does not take one;
- requirement compliance on a package with no confirmed requirements.

An inconsistent set is still **stored** — an official iterating on weights
should not lose their work — but as `DRAFT`, with the problems returned
alongside it, and a run refuses to apply it. The check runs again immediately
before every run, because the response configuration can change after the
criteria were saved.

### The Scoring Formulas

All deterministic, all reproducible, all quoting the values they read.

- **Relative criteria** (price, timeline, capacity, numeric departmental
  questions) are scored against the best value *in the set being evaluated*:
  the lowest compliant quote scores 100 and every other quote scores
  `100 x lowest / this`. The set is stored with the run, so a stored result
  stays reproducible.
- **Thresholds are hard within their criterion.** A quote above a stated
  ceiling, a duration beyond a stated maximum or a commitment below a stated
  minimum scores **nothing** on that criterion and is reported as such. An
  over-ceiling quote is also excluded from the comparison baseline, so a
  compliant quote is never scored against a price the department already ruled
  out.
- **Coverage ratios** (compliance, experience, technical, requirement
  compliance) count what is evidenced against what was asked for.
- **Requirement compliance** counts a substantiated `MEETS` in full, a
  substantiated `PARTIALLY_MEETS` as half, and everything else — including
  every "insufficient information" — as nothing.
- **Weighted contribution** is `score x weight / 100`, and the total is their
  sum, out of 100.

Where a threshold is not configured, it is extracted from the confirmed
requirement text by the same deterministic extractors the eligibility gate uses
— and where nothing matches, **nothing is asserted**: the criterion is scored
against the other responses only, and says so.

### Missing Information Is Never Credit

The single rule the comparison exists to hold. Four verdicts, and they are not
interchangeable:

| Verdict | Meaning |
|---|---|
| `COMPLIANT` | The supplier stated it meets the requirement **and** substantiated it |
| `PARTIALLY_COMPLIANT` | The supplier stated it partially meets it and said in what respect |
| `NON_COMPLIANT` | The supplier stated it does not meet it |
| `INSUFFICIENT_INFORMATION` | Unanswered, answered without substance, or declared not applicable |

A supplier that ticked "meets" and wrote nothing has stated a position, not
evidenced one, and it is reported as `INSUFFICIENT_INFORMATION` with the
difference explained. The supplier's own stated position is preserved beside
the derived verdict, so an official can always see what was claimed as well as
what the comparison concluded. The department may still accept it; what it may
not do is have the system accept it silently.

"Did not answer" and "answered that it cannot meet this" stay different facts:
an absence never produces `NON_COMPLIANT`.

Missing information is collected from three places and shown as one list: the
criteria whose data was absent, the Milestone 8 completeness check (reused, not
recomputed, so the phrase means the same thing throughout the platform — D80),
and every requirement that came out as `INSUFFICIENT_INFORMATION`.

### Explainable Ranking

The ordering follows from the scores and nothing else. Ties break on
requirement coverage, then the lower quote, then the earlier submission, then
the response id — so the same data always produces the same order and two
responses never swap places between runs.

Every ranked response carries its total, its criterion-level scores, its
strongest and weakest factors, its compliance gaps, its missing information and
its supporting evidence. Strongest and weakest are measured in **weighted
contribution**, not raw score: a criterion scored 90 at weight 5 moved the
total less than one scored 60 at weight 30, and naming the first as the
strongest factor would describe a different ranking from the one on screen.

### Snapshots — Nothing Is Overwritten

Every run stores the criteria it applied (`criteria_snapshot`), what was asked
of suppliers at the time (`request_snapshot`), the scoring and criteria
versions, and one result row per response including those it could not assess
and why. Runs accumulate; changing the criteria afterwards does not alter a
score already recorded, and re-evaluating after a resubmission adds a record
rather than destroying the one a decision may already cite (D87).

### The AI Half — Advisory, and Structurally So

`POST /internal/v1/response-evaluation-insights` on the AI service reads one
submitted response and produces a summary, a plain reading of technical fit and
experience relevance, strengths, weaknesses, points requiring human attention,
and **evidence**: the section and a verbatim quote each observation was drawn
from.

What makes it advisory is not the label. It is that:

- the response schema has **no score, rank, weight or recommendation field**,
  on either side of the boundary, so a model has nowhere to put one;
- the analysis is stored in its own table with no score column and no
  reference from any score to it, so the storage layer cannot express "the
  model moved a number" (D89);
- nothing in `apps/api/src/evaluation/` imports the AI client or reads the
  analyses table — the scoring pipeline could not consult it if it wanted to;
- generating one is a separate, optional request that leaves every stored
  score untouched, and regenerating adds a record rather than replacing one;
- the prompt forbids recommending an outcome, and instructs the model to
  record any attempt in the response text to influence its assessment as a
  point for human attention rather than acting on it.

Where no language model is configured, the stub provider reports which parts of
the response carry content and quotes their opening sentences, and says plainly
that it interprets none of them. That is less useful than a real reading and it
is true, which a generated-sounding paragraph produced without a model would
not be.

### The Human Decision

The only place in this system where a supplier is chosen. It is written
exclusively by a route a government official invoked with `evaluation:decide`,
naming a response, an outcome and a reason they typed. Nothing computes a row
in that table, and an integration test asserts that running an evaluation adds
none.

Recorded with the decision: the acting user, the moment, the selected vendor,
the work package, the response, the mandatory reason, the **evaluation run the
official was looking at**, and the rank and total that response held in it —
read server-side from the stored run, never taken from the request, so the
record cannot assert a position the system never produced (D90).

At most one live selection per work package, enforced by a partial unique
index. A decision is immutable; a correction is a revocation with its own
reason, leaving the original on the record, plus a new decision.

### What Milestone 9 Deliberately Does Not Do

- No procurement analytics or organisation-wide intelligence (Milestone 10).
- No learning from historical decisions, no learned ranking, no reranking, no
  model fine-tuning, no query expansion (Milestone 11).
- No automatic allocation of vendors across several work packages
  (Milestone 11).
- No autonomous decision of any kind.

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
occur.

Part 2 as built sits exactly at the boundary, and enforces it structurally
rather than by convention. The technical-fit criterion an earlier draft of
this document proposed to score with AI is scored deterministically instead —
from whether the technical fields were answered and from the supplier's own
stated positions on the functional and non-functional requirements — and the
model's reading of technical fit is prose beside that number, never an input
to it. The separation is held by the schema on both sides of the HTTP
boundary and by the storage layer, not by anybody remembering it: see
[The AI Half](#the-ai-half--advisory-and-structurally-so).

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

- Whether the response-evaluation **presets** (30/30/15/10/5/10 for a
  proposal, 50/20/20/10 for a quotation) are the right starting points. They
  are defaults an official may change, not fixed weights, so the question is
  softer than it is for package ranking — whose 25/20/18/12/10/9/6 weighting
  is settled, implemented and not configurable. The opportunity-level feed
  keeps its separate 55/20/15/10.
- Whether an organisation-level **library of reusable criteria templates** is
  worth building. Criteria today are configured per work package, with served
  presets per response type.
- Whether the **package-ranking** weights should also become configurable, as
  the evaluation criteria now are — per project, or by an administrative role (see
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
