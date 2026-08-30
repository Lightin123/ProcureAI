# Requirements

**Status:** Planned. Functional and non-functional requirements below
describe target system behavior across the full product vision. Only the
current milestone scope (last section) is being actively built — see
[hackathon-scope.md](hackathon-scope.md) and
[../development-roadmap.md](../development-roadmap.md) for what is
implemented vs. planned.

---

## Functional Requirements

### FR1 — Procurement Project Management
- FR1.1: An official can create a procurement project.
- FR1.2: An official can describe a problem in free-form natural language.
- FR1.3: A project tracks its current stage within the procurement workflow
  (see [../design/procurement-workflow.md](../design/procurement-workflow.md)).

### FR2 — Requirement Understanding
- FR2.1: The system extracts candidate structured requirements from the
  free-form problem description.
- FR2.2: The system identifies constraints (e.g. budget, timeline,
  compliance) present in the description.
- FR2.3: The system detects missing information needed to proceed.
- FR2.4: The system generates clarification questions for missing
  information.
- FR2.5: The official can answer clarification questions, and answers feed
  back into the structured requirements.
- FR2.6: The official can edit, approve, or reject any AI-extracted
  requirement before it becomes part of the confirmed structured
  requirements.

### FR3 — Solution Component / Work Package Planning

- FR3.1: Where appropriate, the system can propose a division of complex
  structured requirements into logical solution components or procurement
  work packages.

- FR3.2: The official can edit, merge, split, add, remove, or reject
  proposed solution components or work packages.

- FR3.3: A procurement project may proceed without decomposition when a
  single solution or provider is appropriate.

### FR4 — Vendor / Startup Discovery

**Status: implemented.** Vendor onboarding, verification, and
work-package-level hybrid matching are all built (see
[users-and-roles.md](users-and-roles.md) and
[../ai/vendor-discovery.md](../ai/vendor-discovery.md)). A separate,
narrower project-level lexical match also remains, powering the
vendor-facing opportunity feed rather than FR4.

- FR4.1: The system discovers candidate vendors using semantic search over
  vendor capability data, **scoped to a specific confirmed work package**.
  Implemented. The package, its linked requirements, and light project
  context are normalized into a weighted term set and a document; the
  capability-bearing part of that document is embedded and matched by
  pgvector cosine similarity against stored vendor capability embeddings,
  above a minimum calibrated per embedding model (0.65 for the current
  one), unioned with a lexical keyword-overlap pass. pgvector is optional — where it is
  absent the run degrades to lexical-only with a visible warning. See
  [../ai/rag-and-semantic-search.md](../ai/rag-and-semantic-search.md).
- FR4.2: The system supports structured filtering (e.g. sector, size,
  location, certifications) alongside semantic search, applied as a
  deterministic eligibility gate prior to ranking (not folded into the
  match score) — see
  [../ai/vendor-discovery.md](../ai/vendor-discovery.md#eligibility-filtering).
  Implemented as a distinct hard gate that runs before any scoring and is
  never expressed as a score: profile assessability, verification not
  rejected, mandatory certifications, credential validity, delivery
  region, and contract value ceiling. Each result quotes the requirement
  and the supplier evidence behind it; an unconstrained dimension produces
  no check at all.
- FR4.3: The official can review and adjust the candidate vendor list.
  Implemented. Officials see ranked supplier cards with per-dimension
  scores, strengths and gaps, an inspectable list of excluded suppliers
  and the check each failed, a side-by-side comparison of up to four
  suppliers, and can shortlist or remove suppliers and recalculate a run.

### FR5 — RFI / Proposal Collection
- FR5.1: The system supports collecting RFI responses or proposal documents
  from candidate vendors for a work package.

### FR6 — Document Intelligence
- FR6.1: The system extracts structured information from submitted
  documents (RFIs/proposals).

### FR7 — Evaluation
- FR7.1: The system evaluates candidates against technical fit criteria.
- FR7.2: The system evaluates candidates against budget compatibility.
- FR7.3: The system evaluates candidates against timeline feasibility.
- FR7.4: The system evaluates candidates against experience/track record.
- FR7.5: The system evaluates candidates against compliance requirements.
- FR7.6: The system evaluates candidates against semantic match to
  requirements.
- FR7.7: Deterministic rules are used wherever evaluation criteria are
  objective; AI-assisted analysis is used where judgment is required.

### FR8 — Ranking and Recommendation
- FR8.1: The system ranks evaluated candidates.
- FR8.2: The system generates an explanation for each recommendation,
  referencing the evidence and criteria behind it.
- FR8.3: Rankings and recommendations are presented as suggestions, not
  final outcomes.
- FR8.4 — Solution Combination Recommendation

  Where a procurement project has been divided into multiple solution
  components or work packages, the system may evaluate compatible
  combinations of candidates across those components.

  The system should identify promising combinations based on relevant
  constraints such as:

  - Overall technical fit
  - Budget compatibility
  - Timeline compatibility
  - Dependency or integration considerations
  - Compliance constraints

  Any proposed combination must be presented as a recommendation for human
  review, not as an automatic procurement decision.

### FR9 — Human Review and Decision
- FR9.1: The official can review, override, or reject any AI-generated
  suggestion at any workflow stage.
- FR9.2: The official records the final procurement decision.
- FR9.3: The system does not allow any workflow stage to auto-advance to a
  binding decision without explicit human action.

### FR10 — Access Control
- FR10.1: The system supports distinct roles with different permissions
  (see [users-and-roles.md](users-and-roles.md)).
- FR10.2: Access to a procurement project's data is restricted according to
  role and ownership.

### FR11 — Auditability
- FR11.1: Key actions (approvals, edits to AI suggestions, stage
  transitions, final decisions) are recorded with who performed them and
  when.

---

## Non-Functional Requirements

### NFR1 — Explainability
Every AI-generated recommendation must be traceable to the inputs, criteria,
and reasoning that produced it. A recommendation without an accompanying
explanation is not acceptable output.

### NFR2 — Reliability of AI Output
AI output must be validated against structured schemas before being stored
or acted upon. Malformed or out-of-schema AI output must be rejected or
flagged, never silently accepted.

### NFR3 — Security
- Authentication and role-based authorization must protect all
  non-public endpoints (planned; not yet implemented).
- All external input must be validated at the API boundary.
- See [../engineering/security.md](../engineering/security.md).

### NFR4 — Auditability
State-changing actions on procurement-relevant data must be attributable and
traceable after the fact.

### NFR5 — Accessibility
The UI must be usable by government officials with varying levels of
technical familiarity, and should follow standard accessibility practices
(keyboard navigation, sufficient contrast, readable typography). See
[../design/ui-design.md](../design/ui-design.md).

### NFR6 — Maintainability
The codebase should favor simple, readable solutions over abstractions or
technologies adopted for their own sake, consistent with
[../architecture/decisions.md](../architecture/decisions.md).

### NFR7 — Incremental Runnability
The project must remain runnable after every development milestone. No
milestone should leave the system in a broken or partially-wired state.

### NFR8 — Data Separation
AI-generated/suggested data must be stored separately from
official-confirmed data until a human approves it (supports NFR1 and the
human-in-the-loop principle).

### NFR9 — Performance
No specific performance targets (latency, throughput, concurrent users) have
been set. **Unresolved** — to be defined if/when the hackathon demo or a
later stage requires it.

---

## Current Milestone Scope

Milestones 1 through 8 are implemented — see
[../development-roadmap.md](../development-roadmap.md) for full detail.
Against the functional requirements above:

| Requirement | Status |
|---|---|
| FR1.1 — official can create a procurement project | Implemented |
| FR1.2 — free-form natural-language problem description | Implemented |
| FR1.3 — project tracks its current workflow stage | Implemented across the full workflow, with every transition recorded in `project_stage_history` |
| FR2.1 — extract structured requirements | Implemented |
| FR2.2 — identify constraints | Implemented (`CONSTRAINT` kind with BUDGET / TIMELINE / COMPLIANCE categories) |
| FR2.3 — detect missing information | Implemented |
| FR2.4 — generate clarification questions | Implemented |
| FR2.5 — official answers clarifications, fed back into analysis | Implemented |
| FR2.6 — edit / approve / reject AI-extracted requirements | Implemented, with rejection requiring a reason |
| FR3.1–FR3.3 — work package decomposition, review, single-package path | Implemented |
| FR4.1 — semantic, work-package-level vendor discovery | Implemented. Hybrid retrieval — pgvector cosine over capability embeddings, unioned with lexical keyword overlap — scoped to a confirmed work package; degrades to lexical-only where pgvector is absent |
| FR4.2 — structured filtering as a deterministic eligibility gate | Implemented as a distinct hard gate running before ranking, never as a score: profile assessability, verification not rejected, mandatory certifications, credential validity, delivery region, contract value ceiling |
| FR4.3 — official reviews/adjusts the candidate vendor list | Implemented: ranked cards with per-dimension scores, inspectable exclusions, side-by-side comparison, shortlisting, recalculation |
| FR4.4 — invite and engage shortlisted suppliers | Implemented (Milestone 7): shortlist with a recorded reason, invitation with instructions and a response date, in-portal notification, and the supplier's acceptance or reasoned decline |
| FR5.1 — collect RFI responses or proposal documents for a work package | Implemented (Milestone 8). The official configures what is required — expression of interest, RFI, proposal or quotation — with a deadline, required and optional sections, custom questions, and whether clarifications and documents are allowed. The invited supplier drafts a resumable response, answers each confirmed requirement individually, attaches documents, and submits it against server-side validation of everything mandatory. Clarifications run in both directions with their actors and timestamps preserved, and the official tracks each response through review to `READY_FOR_EVALUATION` |
| FR6 — document intelligence | Not implemented for attachment *contents*. What Milestone 9 does read is the structured information a supplier submitted through the response form — quoted value, duration, committed team size, compliance confirmation, requirement-by-requirement positions and written answers — and compares it against the procurement's own stated ceilings, deadlines and mandatory certifications. Parsing an uploaded PDF is still not done; attachment **titles** only are passed to the AI service |
| FR7 — evaluation | Implemented (Milestone 9). An official configures weighted criteria per work package — price, timeline, capacity, certifications, experience, technical response, requirement compliance and the department's own questions — validated for internal consistency and refused where they would score suppliers on information nobody was asked for. Every ready response is scored deterministically, compared requirement by requirement against four verdicts with missing information never counted as compliance, and each score carries the basis and evidence it was read from. AI analysis is advisory, separate and incapable of moving a score. See Part 2 of [../ai/evaluation-and-ranking.md](../ai/evaluation-and-ranking.md) |
| FR8 — ranking and recommendation | Implemented for responses (Milestone 9): a deterministic ranking over the configured criteria, in which every position carries its total, its criterion-level scores, its strongest and weakest factors measured in weighted contribution, its compliance gaps, its missing information and its supporting evidence, alongside a side-by-side comparison. FR8.4 (recommending a *combination* of vendors across packages) is deliberately deferred to Milestone 11. The ranking of discovered *candidates* that FR4 needs was already implemented: seven deterministic weighted dimensions per work package, each individually inspectable |
| FR9 — human review and decision | Implemented, including **FR9.2**: an official selects or rejects a named response with a mandatory reason, and the decision is recorded with its author, moment, work package, vendor and the evaluation snapshot it cites. No automated path writes a decision, at most one supplier may be selected per work package, and a correction is a revocation recorded alongside the original rather than replacing it |
| FR10 — access control | Implemented (Milestone 5): three roles, permission-based authorization, organization scoping enforced on every query |
| FR11.1 — auditability of key actions | Implemented for requirement and work-package decisions, stage transitions, vendor verification decisions, shortlist and invitation acts, and every response lifecycle event — each with its actor, moment and, where one is required, its stated reason. A supplier's own acts are attributed to the supplier's user. A general-purpose audit log across all data areas does not exist |

Against the non-functional requirements: **NFR1** is met for requirement
analysis, work package generation, vendor matching and response evaluation —
every suggestion, every match score and every criterion score carries a
rationale, and an evaluation score additionally names the values it was
calculated from. **NFR2** is met: AI output is
schema-validated by Pydantic and re-validated by zod before persistence.
**NFR3** is met: authentication and role-based authorization protect every
non-public endpoint (Milestone 5), and input is validated at the boundary.
**NFR4** is substantially met — stage transitions, review decisions, vendor
verification decisions, shortlist and invitation acts, every response
lifecycle event, and every evaluation and procurement decision are recorded
with their actor, moment and stated reason, though a general-purpose audit log
across every data area does not exist. **NFR8** is met for requirements
and work packages via the provenance model. NFR6 and NFR7 are being
observed. NFR5 and NFR9 remain unaddressed as stated requirements rather
than implemented features.

See [hackathon-scope.md](hackathon-scope.md) for the distinction between
hackathon-demo scope and long-term product scope, and
[../development-roadmap.md](../development-roadmap.md) for sequencing.

## Related Documents

- [product.md](product.md)
- [users-and-roles.md](users-and-roles.md)
- [hackathon-scope.md](hackathon-scope.md)
- [../design/procurement-workflow.md](../design/procurement-workflow.md)
- [../development-roadmap.md](../development-roadmap.md)
