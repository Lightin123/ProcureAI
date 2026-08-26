# Problem Statement

**Status:** Confirmed — as provided for Smart India Hackathon 2026.

## Identification

| Field | Value |
|---|---|
| Problem Statement ID | SIH26136 |
| Title | Startup-Friendly Public Procurement Mechanism |
| Theme | Smart Automation |
| Type | Software |
| Hackathon | Smart India Hackathon 2026 |

## Background

Government departments often face complex problems but may not initially
know:

- What type of solution or technology is required.
- How to convert a broad problem into structured requirements.
- Which startups or solution providers are suitable.
- How to discover relevant vendors efficiently.
- How to compare technical solutions.
- How to evaluate proposals against multiple constraints.
- Which combination of vendors or solutions provides the best overall
  outcome.

This gap makes it difficult for smaller, innovative startups to be
discovered and fairly evaluated through traditional procurement processes,
which tend to favor vendors with established relationships or heavier
compliance overhead.

## What Is Required

A platform that assists government officials throughout the early
procurement planning and solution discovery process — from an unstructured
problem statement to a shortlist of evaluated, explainable vendor
recommendations — while keeping the final decision with the human official.

## Core System Flow (as specified)

```text
Government Official
        |
        v
Create Procurement Project
        |
        v
Describe Problem / Requirement
        |
        v
AI Requirement Analysis
        |
        +-- Extract requirements
        +-- Identify constraints
        +-- Detect missing information
        |
        v
Clarification and Human Review
        |
        v
Structured Requirements
        |
        v
Work Package Generation
        |
        v
Startup / Vendor Discovery
        |
        +-- Semantic Search
        +-- Structured Filtering
        |
        v
RFI / Proposal Collection
        |
        v
Document Intelligence
        |
        v
Technical / Financial / Compliance Evaluation
        |
        v
Ranking and Optimization
        |
        v
Explainable Recommendations
        |
        v
Human Review
        |
        v
Procurement Decision
```

The detailed, elaborated version of this flow (with states and human
checkpoints) lives in
[../design/procurement-workflow.md](../design/procurement-workflow.md).

## Explicit Constraint

The system is an **AI-assisted decision-support system**, not an autonomous
procurement system. The final procurement decision must always remain with
the responsible government official.

## Related Documents

- [product.md](product.md)
- [requirements.md](requirements.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
