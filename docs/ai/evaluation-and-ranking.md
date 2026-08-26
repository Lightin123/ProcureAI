# Evaluation and Ranking

**Status:** Planned. Not implemented.

## Purpose

Evaluate discovered/candidate vendors against a work package's requirements
across multiple dimensions, then rank them and produce explainable
recommendations — per FR7 and FR8 in
[../product/requirements.md](../product/requirements.md).

## Evaluation Dimensions (as specified)

- Technical fit
- Budget compatibility
- Timeline
- Experience
- Compliance
- Semantic match to requirements

## Deterministic vs. AI-Assisted

Consistent with the "deterministic rules where appropriate" principle (see
[../product/product.md](../product/product.md)):

- **Deterministic (planned):** budget compatibility (numeric comparison),
  compliance checks against a checklist, timeline feasibility against
  stated constraints.
- **AI-assisted (planned):** technical fit assessment, experience
  relevance, semantic match — dimensions that require interpreting
  free-text or comparing capability descriptions to requirements.

Exact scoring formulas and weighting are not yet designed.

## Ranking and Optimization

- Individual dimension scores are combined into an overall ranking.
- "Optimization" per the original system flow may extend beyond
  single-vendor ranking to selecting a good combination of vendors across
  multiple work packages within a project — this is a **future idea**, not
  yet designed, and likely beyond hackathon scope.

## Explainability Requirement

Every ranked recommendation must surface:
- The scores/assessments per dimension that contributed to it.
- The evidence used (e.g. which requirement matched which vendor
  capability, which document field satisfied which compliance item).

A ranking without this accompanying explanation does not satisfy NFR1 in
[../product/requirements.md](../product/requirements.md).

## Explicitly Not Yet Decided

- Scoring scale (e.g. 0–100, weighted composite) and weighting between
  dimensions.
- Whether weighting is fixed, configurable per project, or configurable by
  a Procurement Administrator role (see
  [../product/users-and-roles.md](../product/users-and-roles.md)).
- Multi-work-package optimization — future idea, unscheduled.

## Related Documents

- [ai-system.md](ai-system.md)
- [vendor-discovery.md](vendor-discovery.md)
- [document-intelligence.md](document-intelligence.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
