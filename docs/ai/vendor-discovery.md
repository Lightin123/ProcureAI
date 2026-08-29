# Vendor / Startup Discovery and Matching

**Status:** Implemented. Work-package-level hybrid matching — the design
described in most of this document — is built, tested, and in use
(`apps/api/src/matching/`). The earlier opportunity-level deterministic
lexical matching remains, serving a different audience (a vendor browsing
opportunities) rather than being superseded. See
[../development-roadmap.md](../development-roadmap.md) Milestone 6.

## Current Implementation

Two matching capabilities exist side by side. They answer different
questions for different users and neither replaces the other.

### Opportunity-Level Matching (vendor-facing)

What a vendor sees, in `apps/api/src/vendor/matching.ts` and the
`GET /api/v1/vendor/opportunities` / `GET /api/v1/vendor/dashboard`
endpoints:

- Matching operates at **procurement project ("opportunity") granularity**
  — a vendor is scored against a whole published project, not against an
  individual work package within it.
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
  detail.
- **Eligibility is not a separate gate here.** A vendor with no relevant
  capability still receives a (low) score rather than being filtered out.
  This is appropriate for a discovery feed — a vendor browsing
  opportunities is not being excluded from anything — but it is not how
  the official-facing pipeline works.

This lets a vendor discover plausible-fit opportunities and lets a
department see who has expressed interest. It is **not** what FR4 in
[../product/requirements.md](../product/requirements.md) specifies, and it
should not be described as "vendor discovery" in the FR4 sense.

### Work-Package-Level Hybrid Matching (official-facing)

What an official runs, in `apps/api/src/matching/` — this is FR4. It is
described in full below.

## Work Package to Vendor Matching

### Purpose

Given a **confirmed work package** — not a whole project — identify vendors
whose capabilities are relevant to that specific package, combining
semantic retrieval with deterministic structured filtering, per FR4 in
[../product/requirements.md](../product/requirements.md).

### Matching Considers

- Work package title, description, scope, and deliverables.
- The `project_requirements` linked to the package, plus light project
  context.
- Required products or services, and required capabilities.
- Industry, sector, and domain specialization.
- Delivery requirements and geographic coverage.
- Capacity, expressed as declared contract value brackets.
- Certifications and compliance requirements.
- Previous relevant experience.
- The vendor's capability narrative, structured products/services,
  previous projects, and credentials — all collected by the Milestone 6
  onboarding work (see
  [../architecture/database.md](../architecture/database.md)).

### The Pipeline

```
Confirmed Work Package
    |
    v
Requirement Normalization        normalization.ts
    |                              -> semantic document + weighted terms
    v
Hybrid Candidate Retrieval       retrieval.ts
    |
    +---------------+---------------+
    v                               v
Lexical Retrieval             Semantic Retrieval
(GIN keyword overlap)         (embedding -> pgvector/HNSW -> top-K)
    |                               |
    +---------------+---------------+
                    v
            Candidate Pool           unioned, deduplicated
                    |
                    v
      Deterministic Eligibility Gate  eligibility.ts   hard pass/fail
                    |
                    v
      Multi-Factor Ranking            ranking.ts       eligible only
                    |
                    v
      Evidence-Derived Explanation    presentation.ts
                    |
                    v
      Government Official             shortlist or set aside
```

Retrieval runs before the gate, not after it. The gate needs the
supplier's full record — credentials and their expiry dates, operating
states, stated contract values — and loading that for every supplier on
the platform in order to discard most of them would be the full-table scan
retrieval exists to avoid. Running it over the candidate pool instead
reaches the same verdict for every supplier who could have been
recommended, because a supplier neither half retrieved was never going to
be ranked. What matters for correctness is that the gate sits between
retrieval and ranking, so nothing that fails it can be scored.

Each stage is a separate module and each is unit-testable independently —
normalization, eligibility and ranking are pure functions of their inputs
and need no database (decision **D63**). `pipeline.ts` composes them.

**Requirement Normalization** (`normalization.ts`,
`NORMALIZATION_VERSION = 1`). Builds one `NormalizedWorkPackage` from the
work package, its linked `project_requirements`, and light project
context. It produces four things: a natural-language `document` (the full
statement of the package, for display and audit), a `semanticDocument`
(the subject matter alone — this is what gets embedded, decision **D71**),
a `terms` list, and `termWeights` — a weight in [0,1] per term, assigned
by the field the term came from:

| Source field | Weight |
|---|---|
| Work package title | 1.00 |
| Deliverable | 0.85 |
| Category | 0.80 |
| Description | 0.60 |
| Linked requirement text | 0.60 |
| Scope | 0.45 |
| Project context | 0.25 |

A term appearing in several fields takes its **highest** weight rather
than a sum, so repeating a word throughout a long paragraph cannot
outweigh naming it in the title. Normalization also extracts the
package's mandatory certifications, required delivery regions, and rupee
contract value ceiling — the inputs the eligibility gate consumes.

The `semanticDocument` is the title, category, description, scope,
deliverables, and only the FUNCTIONAL, NON_FUNCTIONAL and OTHER linked
requirements. **Compliance, budget and timeline clauses are deliberately
left out**: they are near-identical from one package to the next, so
averaging them into the vector pulls every package towards the same point,
and they are already enforced structurally by the eligibility gate rather
than by similarity. The supplier side has the same split —
`vendor_profiles.semantic_document` alongside the full
`capability_document`. See
[rag-and-semantic-search.md](rag-and-semantic-search.md#the-semantic-document).

**Deterministic Eligibility Gate** (`eligibility.ts`,
`ELIGIBILITY_VERSION = 1`). A hard pass/fail gate applied to the candidate
pool, *before* any scoring — see
[Eligibility Filtering](#eligibility-filtering) below.

**Hybrid Candidate Retrieval** (`retrieval.ts`). The lexical and semantic
halves run **independently** and their results are unioned and
deduplicated; neither half filters the other. Each candidate records which
half or halves found it in `retrievalSources` (`"LEXICAL"`, `"SEMANTIC"`,
or both), so an official can see how a supplier surfaced. Both halves draw
on the normalized terms with weight **>= 0.45**, capped at **40 terms**.

- **Lexical.** A GIN-indexed array overlap of
  `vendor_profiles.capability_keywords && terms`, requiring at least **2**
  overlapping strong terms — one shared word is coincidence, not a match
  — returning the top **60**.
- **Semantic.** The package's semantic document is embedded — by default
  `BAAI/bge-small-en-v1.5`, a sentence encoder running locally on CPU,
  producing **384**-dimension vectors (decision **D70**) — and compared
  against the stored supplier vectors with a pgvector cosine search
  (`embedding <=> query`), returning the top **60**. The minimum
  similarity is **calibrated per embedding model** (decision **D72**):
  **0.65** for the current encoder, 0.35 for the concept-model fallback,
  0.6 for a model nobody has measured. Cosine does not mean the same thing
  across models, so it cannot be one constant. See
  [rag-and-semantic-search.md](rag-and-semantic-search.md).

pgvector is optional (decision **D64**). Where the extension is absent the
semantic half is skipped, the run proceeds lexical-only, and the UI shows
a visible warning rather than silently returning a narrower result.

**Multi-Factor Ranking** (`ranking.ts`, `RANKING_VERSION = 1`). Fully
deterministic — no LLM participates in scoring. Seven weighted dimensions,
detailed in
[evaluation-and-ranking.md](evaluation-and-ranking.md#part-1--vendor-ranking-per-work-package-implemented).

**Evidence-Derived Explanation** (`presentation.ts`). Explanations are
generated **from stored data only** — no model call is involved anywhere
in this stage. Every strength and gap line is derived from a value read
out of the database and is quoted alongside that value, so an official (or
an auditor) can trace any sentence back to the record that produced it.
This is stricter than the "AI-assisted explanation" this document
originally planned, and better: there is no narration layer that could
drift from the evidence.

**Ranked Vendor Recommendations.** Each run is persisted with its
provenance and its exclusions (decision **D68**), so a ranking an official
acted on stays interpretable after the weights or the embedding model have
moved on.

### API and UI

Endpoints live under
`/api/v1/work-packages/:workPackageId/vendor-matches`:

| Route | Purpose |
|---|---|
| `GET` | Read the last stored run |
| `POST` | Run or recalculate matching |
| `GET /:vendorProfileId` | One supplier in the context of this package |
| `POST` / `DELETE` `/shortlist` | Add to / remove from the shortlist |

Permissions are `vendor:matching:read` (`GOVERNMENT_OFFICIAL` and `ADMIN`)
and `vendor:shortlist:manage` (`GOVERNMENT_OFFICIAL` only — shortlisting
is a procurement act, per D69). Vendors hold neither. Cross-organization
access returns 404.

The officials' UI is `apps/web/src/pages/WorkPackageVendorMatchingPage.tsx`
at `projects/:id/work-packages/:workPackageId/suppliers`, reached from a
"Find Suitable Vendors" button shown only on `CONFIRMED` packages. It
presents ranked supplier cards with per-dimension bars, a why/gaps
breakdown, an inspectable excluded-suppliers section, a side-by-side
comparison modal (up to four suppliers), a supplier detail modal, and
shortlisting.

## Eligibility Filtering

Eligibility and relevance are different questions and are not collapsed
into one score:

| Concept | Question it answers |
|---|---|
| **Eligibility** | Can this vendor reasonably participate at all? |
| **Relevance** | How well does this vendor match the work package? |
| **Ranking** | Among eligible, relevant vendors, which are the best choices? |

A vendor can be perfectly eligible and a poor relevance match (a verified,
compliant road contractor is eligible for a road package and irrelevant to
a vaccine cold-chain package). A vendor can look highly relevant by
keyword overlap and still be ineligible (missing a mandatory certification,
wrong jurisdiction). Eligibility failure is a hard exclusion, not a scoring
penalty — an ineligible supplier is not ranked into the recommendations
however well they would have scored.

`checkEligibility` returns
`{ eligible, passedChecks[], failedChecks[], warnings[] }`. Each check
carries two fields: the `requirement` (quoted from the source clause that
imposed it) and the `evidence` (read from the supplier's own record), so
every pass and every failure states what was asked and what was found.

The implemented checks:

| Check | What it verifies |
|---|---|
| `PROFILE_ASSESSABLE` | Profile completion is at least 40% — below that there is not enough data to assess anything |
| `VERIFICATION_NOT_REJECTED` | The supplier's verification is not in a rejected state |
| `MANDATORY_CERTIFICATION` | Each certification the package mandates is held |
| `CREDENTIAL_VALIDITY` | A mandatory credential that has expired counts as not held |
| `DELIVERY_REGION` | The supplier's declared operating regions cover the package's required regions |
| `CONTRACT_VALUE_CEILING` | The package's rupee value falls within the supplier's declared bracket |

Three rules govern how these behave, and each exists to prevent a specific
wrong exclusion:

- **A dimension the package does not constrain produces no check at all.**
  An absent constraint is never reported as satisfied — a package that
  names no certification does not generate a passed `MANDATORY_CERTIFICATION`
  line, because reporting an unasked question as answered would inflate the
  apparent rigour of the gate.
- **Certification requirements are extracted only from clauses carrying an
  obligation marker** (must, shall, mandatory, required, and similar). A
  descriptive mention — "a quality system comparable to ISO 9001" — cannot
  exclude anyone. Excluding a supplier on an obligation the source text
  never imposed is the most damaging error this gate could make.
- **`UNVERIFIED` and `PENDING` suppliers are admitted, with a warning.**
  Only `REJECTED` is a hard exclusion. A supplier who has not yet been
  reached by an administrator has not failed anything; the official sees
  the verification state and decides. This resolves what this document
  previously listed as an open product decision.

## Vendor Ranking Per Work Package

See [evaluation-and-ranking.md](evaluation-and-ranking.md) for the seven
ranking dimensions, their weights, the relevance-scaling mechanic, the
band thresholds, and the explainability requirement each recommendation
satisfies.

## Why Hybrid, Not Semantic Search Alone

- Semantic search alone risks surfacing vendors that are topically similar
  but fail hard constraints (wrong jurisdiction, missing mandatory
  certification) — which is why eligibility filtering is a separate, prior
  stage, not folded into the similarity score.
- Lexical/structured filtering alone risks missing vendors whose
  capabilities are described differently than the work package's wording —
  the gap semantic search closes.
- Combining both keeps matching interpretable: `retrievalSources` records
  which candidates matched lexically, semantically, or both, rather than
  presenting a single opaque similarity number.

## Not Built — Future Work

The matching pipeline ends at a ranked, explained, shortlistable candidate
list. Everything downstream of that is future work:

- **Vendor invitation and the engagement workflow** (Milestone 7).
  Shortlisting exists today only as a minimal seam — a table, add/remove
  endpoints, and a list in the UI (decision **D69**). Nothing invites a
  shortlisted supplier or notifies them.
- **RFI issue and structured vendor responses** (Milestone 8).
- **Document intelligence and response evaluation** (Milestone 9) — see
  Part 2 of [evaluation-and-ranking.md](evaluation-and-ranking.md).
- **Vendor gap analysis and procurement analytics** (Milestone 10).
- **Multi-package vendor allocation** — one vendor across several
  packages, capacity limits, minimizing vendor count vs. preferring
  specialists (Milestone 11). Deliberately deferred until single-package
  matching is proven.
- **Advanced semantic optimization** — learned ranking, query expansion,
  reranking after retrieval (Milestone 11).

Open questions that remain, rather than unbuilt features:

- Whether the ranking weights should be fixed, configurable per project,
  or configurable by an administrative role — see
  [evaluation-and-ranking.md](evaluation-and-ranking.md).
- Whether the per-model semantic calibration holds at a registry size
  larger than the demo's. The current thresholds were measured against
  nine suppliers, and the encoder itself is a general-purpose English
  model, not one tuned on Indian procurement text (U14, D72).
- Whether a stored ranking should be re-run automatically when supplier
  data changes; today a run is explicit and its result is stored, so a
  displayed ranking can be out of date without saying so (U35).

## Related Documents

- [rag-and-semantic-search.md](rag-and-semantic-search.md)
- [evaluation-and-ranking.md](evaluation-and-ranking.md)
- [../product/requirements.md](../product/requirements.md)
- [../development-roadmap.md](../development-roadmap.md)
- [../architecture/database.md](../architecture/database.md)
