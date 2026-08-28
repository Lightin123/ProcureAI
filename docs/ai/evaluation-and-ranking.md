# Evaluation and Ranking

**Status:** Partially implemented. A deterministic, multi-component,
explainable scoring model exists today at **procurement-project**
granularity (`apps/api/src/vendor/matching.ts`). Package-level ranking,
eligibility as a distinct gate, and vendor-response evaluation (this
document's original scope) are **not yet implemented** — see
[../development-roadmap.md](../development-roadmap.md) Milestones 6
(next phase) and 9.

This document covers two related but distinct planned capabilities:
**vendor ranking per work package** (near-term — extends the current
matching work) and **vendor response/proposal evaluation** (later —
Milestone 9, requires vendor responses to exist first, which requires
Milestone 8).

## Three Concepts That Must Not Be Conflated

Both ranking capabilities described in this document share one governing
principle, already established in
[vendor-discovery.md](vendor-discovery.md#eligibility-filtering-planned):

| Concept | Question | Nature |
|---|---|---|
| **Eligibility** | Can this vendor/response reasonably participate? | Hard gate, deterministic, pass/fail |
| **Relevance / Evaluation** | How well does it match / perform against criteria? | Scored, multi-dimensional |
| **Ranking** | Among eligible candidates, which are best? | Ordering derived from the scores |

A single opaque score that mixes "is this vendor allowed to bid" with "how
good is this vendor" is not acceptable output under this principle — the
official must be able to see *why* something is excluded versus merely
ranked low.

## Part 1 — Vendor Ranking Per Work Package (Near-Term)

Extends the matching pipeline in
[vendor-discovery.md](vendor-discovery.md) and
[rag-and-semantic-search.md](rag-and-semantic-search.md). Evaluates
already-eligible candidates (eligibility is a prior, separate stage — see
the table above) and ranks them for a specific work package.

### Ranking Dimensions

- Semantic similarity between work package requirements and vendor
  capabilities (once [rag-and-semantic-search.md](rag-and-semantic-search.md)
  is implemented).
- Structured capability overlap — the lexical scoring already implemented.
- Industry/domain alignment.
- Relevant previous experience.
- Certification and compliance fit.
- Geographic and delivery fit.
- Capacity and availability.
- Engagement model compatibility.
- Vendor verification status and credibility.

### Individually Inspectable, Not One Opaque Score

The current implementation already establishes the pattern to extend: four
weighted components (capability overlap, domain alignment, delivery fit,
credibility), each returned separately with its own score and supporting
detail, combined into one overall number the official can decompose at
any time. The package-level ranking engine should preserve this — every
dimension above should be individually inspectable and its weight legible,
not folded into a single AI-generated number the official cannot audit.

### Recommendation Output

Each vendor recommendation for a work package should include:

- Overall match score.
- Match band (e.g. strong / moderate / limited — matching the existing
  `STRONG`/`MODERATE`/`LIMITED` bands already used at opportunity level).
- Ranking position among eligible candidates.
- Major matching strengths.
- Missing or weak areas.
- Eligibility status (pass, with which criteria evaluated).
- Individual scoring dimensions, each visible on its own.
- A human-readable explanation.

## Part 2 — Vendor Response / Proposal Evaluation (Later — Milestone 9)

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
review, an auditor) must be able to trace any ranking back to deterministic,
inspectable criteria, with AI narrating the evidence rather than being the
evidence.

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

- Scoring scale and weighting between dimensions, for both package ranking
  and response evaluation — the current opportunity-level implementation's
  55/20/15/10 weighting is a starting point to validate, not a settled
  formula for either.
- Whether weighting is fixed, configurable per project, or configurable by
  an administrative role (see
  [../product/users-and-roles.md](../product/users-and-roles.md) — no such
  role exists today; `ADMIN` is oversight-only).
- Multi-work-package allocation optimization — future idea, unscheduled
  until Milestone 11.
- Whether an unverified vendor is eligibility-excluded or merely
  rank-penalized (mirrors the same open question in
  [vendor-discovery.md](vendor-discovery.md)).

## Related Documents

- [ai-system.md](ai-system.md)
- [vendor-discovery.md](vendor-discovery.md)
- [rag-and-semantic-search.md](rag-and-semantic-search.md)
- [document-intelligence.md](document-intelligence.md)
- [../development-roadmap.md](../development-roadmap.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
