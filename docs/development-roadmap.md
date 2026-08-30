# Development Roadmap

**Status:** Milestones 0 through 9 are complete. Milestone 6 delivered the
vendor ecosystem and work-package-level hybrid matching; Milestone 7 the
shortlist-to-invitation engagement step; Milestone 8 the collection of
structured vendor responses; and Milestone 9 their evaluation, comparison and
the recorded human procurement decision. Milestones 10 and 11 are planned
sequencing only, and nothing from either has been built.

## Milestone 0 — Documentation Foundation (Complete)

Establish `docs/`, `README.md`, and `CLAUDE.md` so architecture, product,
and process decisions are recorded before implementation begins.

## Milestone 1 — Project Foundation (Complete)

```
React Frontend -> Express Backend -> GET /health -> Frontend displays backend connection status
```

- [x] Scaffold `apps/web` (React + TypeScript + Vite).
- [x] Scaffold `apps/api` (Node.js + Express + TypeScript).
- [x] Implement a single `GET /health` endpoint.
- [x] Frontend calls `/health` and displays connection status.
- [x] No auth, no database, no AI service involvement.

## Milestone 2 — Procurement Project Skeleton (Complete)

```
Create / list / view procurement projects, persisted in PostgreSQL
```

- [x] PostgreSQL integration via `pg` with plain SQL migrations (D20);
      hosted development database (D19).
- [x] Initial schema: `organizations`, `users`, `procurement_projects`
      (see [architecture/database.md](architecture/database.md)).
- [x] Nine-state project workflow enum defined (D22); projects created in
      `DRAFT`.
- [x] `GET /api/v1/projects`, `GET /api/v1/projects/:id`,
      `POST /api/v1/projects` with `zod` validation.
- [x] Frontend routing plus Projects list, detail, and create screens.
- [x] `GET /health` extended to report database connectivity.

## Milestone 3 — AI Requirement Analysis (Complete)

```
Run AI analysis -> review suggestions -> answer clarifications -> confirm requirements
```

- [x] `apps/ai-service` (FastAPI + Pydantic, venv + requirements.txt).
- [x] Requirement extraction, constraint identification, missing-information
      detection, and clarification-question generation, called from `apps/api`.
- [x] Anthropic provider, an OpenAI-compatible provider (Groq et al.), and a
      deterministic stub provider so the platform runs without an API key
      (D27, D38, D41).
- [x] Structured requirements review UI: accept, edit, reject-with-reason,
      add manually, answer clarifications, confirm, reopen.
- [x] `project_stage_history` records every workflow transition.

Delivers FR2.1–FR2.6. Analysis runs synchronously (D30); no background job
infrastructure was introduced.

## Milestone 4 — Work Packages (Complete)

```
Confirmed requirements -> AI work package decomposition -> review, edit, merge, split -> confirm
```

- [x] `apps/ai-service` decomposes confirmed requirements into suggested
      work packages (title, description, scope, deliverables, dependencies,
      complexity, priority, estimated procurement category, AI reasoning,
      confidence score), with a deterministic stub fallback.
- [x] Full review surface: accept, reject, edit, manually add, duplicate,
      merge multiple packages into one, split one package into several,
      reorder, soft-delete/restore.
- [x] A project can proceed with a single, non-decomposed work package
      where that is the appropriate procurement unit (FR3.3).
- [x] `work_package_analysis_runs` and `work_package_history` give the same
      provenance and audit trail as requirement analysis (extends D28).
- [x] Confirming all packages transitions the project to
      `WORK_PACKAGES_CONFIRMED`.

Delivers FR3.1–FR3.3. Migration `003_work_packages.sql`.

## Milestone 5 — Authentication and RBAC (Complete)

```
Sign in -> session cookie -> role + organization scoped access on every request
```

- [x] Opaque server-side sessions in an `HttpOnly; SameSite=Strict` cookie
      (D44); `scrypt` password hashing (D45).
- [x] Three roles — `GOVERNMENT_OFFICIAL`, `ADMIN`, `VENDOR` — as a
      PostgreSQL enum (D46), with permission-based authorization: routes
      declare a permission via `requirePermission(...)`, and
      `ROLE_PERMISSIONS` in `apps/api/src/auth/permissions.ts` is the single
      role-to-permission mapping (D47).
- [x] Organization-scoped access preserved and made session-derived rather
      than seeded (D49, D53); cross-organization access returns 404, not
      403.
- [x] Route and API protection: `requireAuth` mounted on the `/api/v1`
      prefix so a route added later cannot be left public by omission (D52).
- [x] Role-aware frontend navigation, route guards, and landing redirects.

Delivers FR9 (human-in-the-loop is now attributable to a real identity),
FR10, and FR11.1. Migration `004_authentication.sql`. See
[engineering/security.md](engineering/security.md) and
[product/users-and-roles.md](product/users-and-roles.md).

## Milestone 6 — Vendor Ecosystem (Complete)

Goal, in full: take a vendor from public registration through a verified,
matchable capability profile, and match that profile against government
procurement work packages. Delivered in two halves — **vendor onboarding and
opportunity-level matching**, then **work-package-level hybrid matching**.
Both are built.

### Completed — first half (vendor onboarding and the vendor portal)

- [x] Public vendor self-registration (`POST /api/v1/auth/register`) —
      creates a `VENDOR` account, never a government or admin account.
- [x] Progressive, schema-driven onboarding across 8 sections (organisation,
      classification, capabilities, capacity, experience, compliance,
      innovation, plus review), with save-and-resume, a server-computed
      completion percentage, and conditional questions that adapt to the
      vendor's declared industry and solution type (D58).
- [x] A vendor capability taxonomy spanning manufacturing, agriculture,
      construction, infrastructure, logistics, healthcare, education,
      sustainability, hardware, software, professional services, and
      research — not technology-only (D56).
- [x] Repeatable profile entities: products/services offered, past
      experience, credentials/certifications.
- [x] Compliance document upload, storage, and per-document verification
      state (D59).
- [x] Admin-side supplier verification workflow (`vendor:verification:manage`
      permission, deliberately platform-wide rather than organization-scoped
      — D60) and a supplier registry.
- [x] A derived **capability document** (natural-language) and
      **capability keyword set**, rebuilt on every profile write — the
      artifact the second half's embeddings consume (see
      [ai/vendor-discovery.md](ai/vendor-discovery.md)).
- [x] Government-side opportunity publication: an official explicitly
      publishes a confirmed project, choosing what summary and which
      *accepted* requirements become visible to vendors (D57) — publication
      is a separate act from confirming requirements internally.
- [x] Vendor-facing opportunity discovery: a vendor portal dashboard, an
      opportunity list and detail view, save-for-later, and interest
      registration (an expression of interest, not a proposal).
- [x] **Deterministic, opportunity-level lexical matching**: every published
      opportunity is scored against every vendor's capability keywords using
      stop-word-filtered term overlap plus declared-industry alignment,
      geographic/delivery fit, and credibility signals — fully explainable
      (matched terms, per-component scores) but **whole-project granularity
      and lexical only**, not per-work-package and not semantic. See
      [ai/vendor-discovery.md](ai/vendor-discovery.md) for exactly what this
      does and does not do today.
- [x] AI-generated capability insights (advisory only — never read back by
      matching, verification, or eligibility).

Migration `005_vendor_profiles.sql`. This half delivered a vendor-facing
precursor to FR4 rather than FR4 itself: FR4 is specified at work-package
granularity with semantic search, and this matching is project-level and
lexical. It remains in place — it is what a *vendor* sees in their portal.

### Completed — second half (work package to vendor matching)

The first half answered *"which published opportunities look relevant to this
vendor"* — project-level, lexical, and the same answer regardless of which
work package within a project a vendor is actually suited to. This half
answers the question the product exists to answer: *"for this specific
confirmed work package, which eligible vendors are the best fit, ranked and
explained."*

```
CONFIRMED WORK PACKAGE
        |
        v
Requirement Normalization            normalization.ts
        |
        v
Hybrid Candidate Retrieval           retrieval.ts
   +---------------+----------------+
   v                                v
Lexical Search                Semantic Search (pgvector / HNSW)
   |                                |
   +---------------+----------------+
                    v
        Deduplicated Candidate Pool
                    |
                    v
     Deterministic Eligibility Gate  eligibility.ts    (hard gate, not a score)
                    |
                    v
          Multi-Factor Ranking       ranking.ts        (deterministic, 7 dims)
                    |
                    v
       Explainable Recommendations
                    |
                    v
       Government Human Review       the official decides
```

- [x] **Work-package-level matching.** A project's packages are matched
      independently and produce different rankings — verified in the seeded
      demonstration project, where four confirmed packages in one project
      each recommend a different supplier.
- [x] **Deterministic eligibility as a distinct pre-ranking gate** (D63):
      profile assessability, verification state, mandatory certifications,
      credential validity, delivery region, and contract-value ceiling. Each
      check reports the requirement it enforces and the evidence it was
      judged on. A dimension the package does not constrain produces no
      check at all. A supplier who fails is excluded, never merely ranked
      lower.
- [x] **pgvector integration** (migrations `006_work_package_matching.sql`
      and `007_semantic_embeddings.sql`), with vendor capability embeddings
      and work-package embeddings stored in 384-dimension vector columns
      behind an HNSW cosine index (D65). pgvector is optional: without it,
      matching degrades to lexical-only with a visible warning (D64).
- [x] **Embedding service boundary** in the AI service
      (`POST /internal/v1/embeddings`), configured independently of the
      analysis provider (D66). The default is `BAAI/bge-small-en-v1.5`, a real
      sentence encoder running locally on CPU with no API key (D70); the
      deterministic concept model is the offline fallback, and hosted
      embeddings are opt-in.
- [x] **Semantic documents** (D71): what gets embedded is the
      capability-bearing prose alone, on both sides. Measured on the seeded
      registry, this moved the intended supplier from top-1 on three of four
      packages to top-1 on all four, and widened the gap between an intended
      match and an unrelated one.
- [x] **Per-model similarity calibration** (D72): retrieval threshold and
      score scale are measured per embedding model, because cosine is not
      comparable between them.
- [x] **Semantic candidate retrieval** over stored embeddings, with a
      minimum similarity threshold so "found semantically" means genuinely
      close rather than merely closest.
- [x] **Hybrid retrieval**: lexical and semantic run independently and are
      unioned and deduplicated; each candidate records which halves found it,
      so a supplier a keyword search could not have surfaced is visible as
      such in the portal.
- [x] **Multi-factor ranking** with seven individually-inspectable
      dimensions — capability fit (25), semantic relevance (20), relevant
      experience (18), capacity and delivery (12), geographic fit (10),
      compliance and credentials (9), verification and credibility (6).
      Fully deterministic; no model decides a score or a position.
- [x] **Explainable recommendations**: per-dimension scores with their
      reasoning, matched and missing capability terms, relevant past
      projects, credentials, strengths, gaps, and a written summary — every
      line derived from a stored value, never authored by a model.
- [x] **Government matching UI** at
      `projects/:id/work-packages/:workPackageId/suppliers`, reached from a
      "Find Suitable Vendors" action shown only on confirmed packages.
      Includes the ranked list, an inspectable excluded-suppliers section,
      a supplier detail view scoped to the package, and side-by-side
      comparison of up to four suppliers.
- [x] **Provenance**: every run stores its strategy, normalization,
      eligibility and ranking versions, its weights, its embedding model, and
      its per-supplier results — including the suppliers it excluded and why
      (D68).
- [x] **Shortlist seam** for Milestone 7 (D69): a minimal
      `work_package_shortlist` table with add/remove endpoints, the rank and
      score read server-side from the stored run rather than accepted from
      the browser. Invitation and everything downstream was not built here —
      it is Milestone 7, which builds on this table unchanged.

Migration `006_work_package_matching.sql`. Delivers FR4.1, FR4.2 and FR4.3.

Not built in this milestone, and deliberately deferred: vendor invitation and
the engagement workflow around the shortlist (**built in Milestone 7**), and
vendor gap analysis (Milestone 10).

## Milestone 7 — Vendor Shortlisting and Engagement (Complete)

Goal: let an official act on ranked recommendations rather than only view
them, and let the supplier answer.

    confirmed work package
      -> ranked, eligible suppliers      (Milestone 6)
      -> compare, inspect
      -> shortlist, with a recorded reason
      -> invitation
      -> supplier notification
      -> supplier accepts or declines
      -> Milestone 8's structured response

- [x] **Recommendation review** — already delivered by Milestone 6's second
      half and unchanged here: the ranked list, all seven dimensions with
      their reasoning, lexical/semantic retrieval evidence, the eligibility
      result with its individual checks, matched and missing capability
      terms, verification state, relevant experience, credentials, capacity
      and geographic coverage.
- [x] **Side-by-side comparison** of up to four suppliers, extended in this
      milestone with capability coverage, relevant experience, credentials,
      geographic coverage, profile completion, per-supplier matched and
      missing capability terms, and the exclusion ground for any supplier
      the gate refused.
- [x] **Work-package shortlist**, built on Milestone 6's seam (D69): add
      with a mandatory recorded reason, remove, and view — per work package
      and never per project, so shortlisting a supplier for WP-02 says
      nothing about WP-01. An ineligible supplier is refused by the API, not
      merely by a disabled button.
- [x] **Shortlist auditability** (D73): every add and remove is written to
      `work_package_history` with the acting official, the action, the
      reason and the timestamp, alongside the decisions that produced the
      package itself.
- [x] **Invitation** of a shortlisted supplier, carrying the work package,
      the issuing department and official, an optional response deadline,
      optional written instructions, and a status. Three preconditions are
      enforced server-side: the package is in the caller's organization, the
      package is `CONFIRMED`, and the supplier is on *this* package's
      shortlist. Eligibility is enforced transitively through the shortlist
      rather than re-checked, so there is one definition of the gate.
- [x] **Invitation lifecycle** (D75): `INVITED -> ACCEPTED | DECLINED |
      WITHDRAWN`, enforced by a conditional `UPDATE`, with a partial unique
      index permitting one live invitation per supplier per package. No
      `EXPIRED` state — expiry would need a background job, which this
      system does not have (D30); a passed deadline is derived at read time.
- [x] **Supplier notification** (D74), written into the existing
      `vendor_notifications` table in the same request that creates the
      invitation. A bell in the portal header carries the unread count and
      the recent list; opening a notification marks that one read and
      navigates to the invitation it is about.
- [x] **Supplier invitation portal** at `/vendor/invitations` and
      `/vendor/invitations/:id`: the department, the project, the work
      package with its scope and deliverables, the deadline, the official's
      instructions, and accept/decline. Declining requires a stated reason.
- [x] **Government invitation tracking** on the matching page: every
      invitation on the package, its status, who issued it and when, the
      deadline, the response and its timestamp, and the supplier's note.
- [x] **Strict separation of the two sides** (D76): the supplier's view is a
      different query in a different router, and carries no rank, score,
      dimension breakdown, eligibility verdict, shortlist reason or any
      other supplier.
- [x] **RBAC**: `vendor:invitation:manage` for `GOVERNMENT_OFFICIAL`;
      `vendor:invitation:read` and `vendor:invitation:respond` for `VENDOR`.
      `ADMIN` gains neither — oversight reads a ranking but takes no
      procurement decision (D48, D60, D69).

Migration `008_vendor_engagement.sql`. Delivers FR4.4 and supports FR11.1's
requirement that *why* a decision was taken is auditable, not only *what*.

Verified by `apps/api/tests/engagement.integration.test.ts` — 41 tests over
HTTP covering the whole flow and, mostly, the requests that must be refused:
cross-organization access, cross-supplier access, an ineligible supplier, a
non-shortlisted supplier, an unconfirmed package, a duplicate invitation, a
second response, a withdrawal of an accepted invitation, and an
administrator attempting a procurement act.

`npx tsx scripts/engagementDemo.ts` puts one seeded work package into the
shortlisted-and-invited state so the supplier side of a demonstration has
something to open.

Not built, and deliberately left to Milestone 8: the structured response
itself. Accepting an invitation registers intent to respond; it is not a
proposal, a quotation or a commitment to supply.

## Milestone 8 — Vendor Response and Proposal Collection (Complete)

Goal: let an invited vendor who has accepted submit a structured,
deadline-bound response against that work package, and let the official
configure, receive and track it.

    ACCEPTED invitation                    (Milestone 7)
      -> response configuration            — type, deadline, sections, questions
      -> opened to the accepting suppliers — they are notified
      -> resumable draft                   — saved as the supplier goes
      -> requirement-by-requirement answers
      -> documents, clarifications
      -> review screen -> submission       — validated server-side
      -> UNDER_REVIEW -> READY_FOR_EVALUATION   — Milestone 9 follows

- [x] **Response configuration** per confirmed work package (D78): one of
      four response types — expression of interest, RFI, proposal,
      quotation — each with its own sensible section defaults; a deadline;
      instructions; every section set to required, optional or not asked
      for; whether clarifications are allowed; whether documents are
      allowed and whether one is mandatory. One configuration per work
      package, never per supplier, so the responses can be read side by
      side.
- [x] **Custom questions** attached to the configuration, in seven answer
      types, each optional or mandatory and shown under a chosen section.
      Asked of every supplier, so the answers stay comparable.
- [x] **Opening and closing.** A configuration is drafted, then opened — the
      act that makes a response possible and notifies every supplier that
      accepted its invitation, in the same request (D74) — then closed.
      Once anything has been submitted, the response type and section modes
      freeze; the deadline and instructions stay editable.
- [x] **One declaration of what is asked for** (D79):
      `apps/api/src/responses/schema.ts` is served to the frontend and read
      by the configuration screen, the supplier's form, the progress
      indicator and the submission check. Section values are explicit
      columns, not a jsonb blob, because Milestone 9 will compare them.
- [x] **Vendor response**, opened from an accepted invitation and resumable
      across sittings: an executive summary, the confirmed requirements
      answered individually with a stated position
      (`MEETS` / `PARTIALLY_MEETS` / `DOES_NOT_MEET` / `NOT_APPLICABLE`) and
      prose, and the technical, execution, timeline, capacity, experience,
      compliance and commercial sections the department asked for. Opening
      is idempotent — a supplier returning to the page resumes its draft.
- [x] **Supporting documents** (D84) in their own table, with the bytes going
      through the one storage module that already decodes, size-limits and
      signature-checks an upload.
- [x] **Progress and review** (D80): one server-side completeness
      computation drives both the supplier's progress indicator and the
      submission gate, so a response the bar shows as ready is one the API
      accepts. A review screen lists every section, what is outstanding, and
      exactly what will be sent.
- [x] **Submission** validated entirely server-side against the department's
      stored configuration — every required field, requirement, question and
      a mandatory document if one was demanded — and refused with the list of
      what is missing. The submission moment and the supplier's own user are
      recorded.
- [x] **Immutability after submission** (D81), expressed as a predicate
      rather than a UI state: the editable set is `DRAFT` and
      `CLARIFICATION_REQUESTED`, and it appears in the `WHERE` clause of
      every write route, so a route added later that forgets it writes
      nothing.
- [x] **Lifecycle** `DRAFT -> SUBMITTED -> UNDER_REVIEW ->
      CLARIFICATION_REQUESTED -> RESUBMITTED -> UNDER_REVIEW ->
      READY_FOR_EVALUATION`, with `WITHDRAWN` reachable by the supplier
      before evaluation, every transition a conditional `UPDATE`. No
      `EXPIRED` state and no background job: a passed deadline is derived at
      read time and enforced at submission, with a department-requested
      clarification exempt.
- [x] **Clarifications in both directions** (D82) in one thread: the
      department requests one and reopens the response; the supplier answers
      and resubmits; the supplier asks its own where allowed and the
      department answers. The side that asked cannot answer, neither the
      question nor the answer is editable, and the whole exchange keeps its
      actors and timestamps.
- [x] **Government response workspace** at
      `projects/:id/work-packages/:workPackageId/responses`: vendor,
      response type, status, submitted-at and deadline for every response,
      status counts, which accepted suppliers have not started, and the
      confirmed requirements suppliers are answering. A full response reader
      shows the requirement answers, every section, the custom answers, the
      attachments and the clarification thread.
- [x] **A draft is not readable by the department** (D83). The workspace
      shows that one exists and whose it is; its contents are served only
      after submission, and its attachments are not downloadable.
- [x] **Supplier portal** at `/vendor/responses` and `/vendor/responses/:id`,
      reached from the accepted invitation and from the header navigation,
      with the sectioned editor, the progress meter, the review step and the
      clarification thread.
- [x] **Notifications** reuse `vendor_notifications` with a `RESPONSE`
      category and a `response_id` pointer: a response becoming available,
      a clarification requested or answered, a review opened, a response
      accepted for evaluation, and the supplier's own submission and
      withdrawal. The existing header bell and unread count carry them
      unchanged.
- [x] **Audit** in `work_package_history` (D73), extended with eleven
      response actions. A supplier's submission, withdrawal and clarification
      answer are attributed to the supplier's own user.
- [x] **RBAC** (D85): `response:configure` and `response:manage` for
      `GOVERNMENT_OFFICIAL`; `response:read` for `GOVERNMENT_OFFICIAL` and
      `ADMIN`; `vendor:response:read` and `vendor:response:submit` for
      `VENDOR`. No role holds a permission from both sides.

Migration `009_vendor_responses.sql`. Delivers FR5.1 and extends FR11.1.

Verified by `apps/api/tests/responses.unit.test.ts` (28 tests over the
catalogue, the answer validators and the completeness computation) and
`apps/api/tests/responses.integration.test.ts` (72 tests over HTTP covering
the whole flow and, mostly, the requests that must be refused:
cross-organization access, cross-supplier access, an unconfirmed package, a
supplier opening a response before the department opened it, an unknown field,
an out-of-range choice, an incomplete submission, a second submission, an edit
after submission, a configuration change after a submission, a passed
deadline, a disallowed clarification, a disallowed document, each side trying
to answer its own clarification, a resubmission with an outstanding question,
a withdrawal after evaluation began, and an administrator attempting a
procurement act).

No assessment of a collected response exists in this milestone.
`READY_FOR_EVALUATION` records that a response is complete enough to be
assessed; the assessment itself is Milestone 9, below.

## Milestone 9 — Evaluation and AI-Assisted Decision Support (Complete)

```
READY_FOR_EVALUATION responses
  -> configure evaluation criteria
    -> AI analysis (advisory, optional, separate)
    -> deterministic evaluation
      -> explainable ranking
        -> side-by-side comparison
          -> human decision, with a mandatory reason
```

Goal, in full: turn the responses Milestone 8 collects into a structured,
comparable and explainable basis for a government decision, while keeping the
decision itself entirely human. It starts from `READY_FOR_EVALUATION` and from
the requirement-by-requirement answers, section values and attachments already
stored; no new collection mechanism was needed and no Milestone 8 table was
changed.

- [x] **Evaluation criteria per work package** (D86): eight criterion types —
      price, delivery timeline, capacity, certifications and compliance,
      relevant experience, technical response, requirement compliance, and a
      departmental question — each weighted, some carrying a threshold (a
      budget ceiling, a maximum duration, a minimum team size). Presets per
      response type. One configuration per work package, never per supplier,
      so the responses stay comparable.
- [x] **Internal consistency enforced, not advised.** A criterion can only be
      scored from information the department actually asked every supplier
      for: configuring price on a package whose commercial section is switched
      off is refused, as are weights that do not sum to 100, a criterion
      configured twice, a departmental question belonging to another package's
      form, a threshold on a criterion that takes none, and requirement
      compliance on a package with no confirmed requirements. An inconsistent
      set is still stored — so an official iterating on weights loses nothing —
      but as `DRAFT`, with the problems attached, and a run refuses to apply
      it. The check runs again immediately before every run.
- [x] **Deterministic scoring** (`apps/api/src/evaluation/scoring.ts`,
      `SCORING_VERSION = 1`): relative criteria scored against the best value
      in the set (the lowest compliant quote scores 100, every other quote
      `100 x lowest / this`), thresholds hard within their criterion, coverage
      ratios for the rest. Every score carries the sentence explaining how it
      was reached and the evidence lines it was read from. Reproducible by
      construction: nothing reads the clock or a random source, and the set the
      relative criteria were computed against is stored with the run.
- [x] **Requirement-by-requirement comparison** with four verdicts —
      compliant, partially compliant, non-compliant, insufficient information —
      and the supplier's own stated position preserved beside each. **Missing
      information is never compliance**: a supplier that ticked "meets" and
      wrote nothing has stated a position, not evidenced one. "Did not answer"
      and "answered that it cannot meet this" stay different facts.
- [x] **Missing-information detection** across three sources shown as one
      list: criteria whose data was absent, the Milestone 8 completeness check
      (reused rather than recomputed, so the phrase means one thing across the
      platform — D80), and every requirement that came out as insufficient.
- [x] **AI-assisted analysis** through the existing AI service
      (`POST /internal/v1/response-evaluation-insights`): a summary, a reading
      of technical fit and experience relevance, strengths, weaknesses, points
      requiring human attention, and the section and verbatim quote each
      observation was drawn from. Advisory **structurally** (D89), not by
      label: the schema has no score, rank, weight or recommendation field on
      either side of the boundary, the analysis is stored in its own
      append-only table with no score column, and nothing in
      `apps/api/src/evaluation/` imports the AI client or reads that table.
- [x] **Explainable ranking**: total score, criterion-level scores, strongest
      and weakest factors, compliance gaps, missing information and supporting
      evidence for every ranked response. Strongest and weakest are measured in
      weighted contribution rather than raw score, because that is what
      actually decided the order. Ties break deterministically, so two
      responses never swap places between runs.
- [x] **Side-by-side comparison** built from one stored run — so what is
      compared is exactly what was calculated — covering eligibility (read from
      the Milestone 6 matching run rather than re-derived), price, timeline,
      capacity, certifications, public-sector delivery, requirement compliance,
      each configured criterion with its weighted contribution, calculated
      strengths and gaps, missing information, and the advisory reading in a
      clearly marked row.
- [x] **The human decision** (D90): an official selects or rejects a named
      response with a mandatory reason. Recorded with the acting user, the
      moment, the vendor, the work package, the evaluation run they were
      looking at, and the rank and total that response held in it — read
      server-side from the stored run, never from the request. At most one live
      selection per work package, enforced by a partial unique index. Nothing
      computes a decision, and an integration test asserts that running an
      evaluation adds none.
- [x] **Immutable decisions with revocation**: correcting a decision leaves the
      original row and its reason on the record and adds a revocation with its
      own mandatory reason, plus a new decision. An `UPDATE` would erase what
      the department first decided.
- [x] **Snapshots** (D87): every run stores the criteria it applied, what was
      asked of suppliers at the time, the scoring and criteria versions, and
      one result row per response — including those it could not assess and
      why. Runs accumulate and are never overwritten, so changing the criteria
      afterwards cannot alter a score a decision already cites.
- [x] **Audit** in `work_package_history` (D73), extended with
      `EVALUATION_CONFIGURED`, `EVALUATION_RUN`, `EVALUATION_AI_ANALYSIS`,
      `VENDOR_SELECTED`, `VENDOR_REJECTED` and `DECISION_REVOKED`. The run
      entry carries the ranking that was shown; the decision entry carries the
      official's reason.
- [x] **Government evaluation workspace** at
      `projects/:id/work-packages/:workPackageId/evaluation`, arranged in the
      order the work is done and labelled for an official with no technical
      background: what is being scored on, which responses can be scored, the
      ranking and its reasons, the side-by-side comparison, the
      requirement-by-requirement grid, and the decision. A per-response page
      decomposes the score criterion by criterion with the basis and evidence
      for each, and carries the advisory reading in its own card under its own
      warning.
- [x] **Permissions** (D91): `evaluation:configure`, `evaluation:manage` and
      `evaluation:decide` for `GOVERNMENT_OFFICIAL` only; `evaluation:read` for
      `GOVERNMENT_OFFICIAL` and `ADMIN`. No vendor role holds any of the four,
      so a supplier reaches no evaluation route at all.

Migration `010_evaluation.sql`. Delivers FR5, FR6, FR7, FR8 and FR9.2 (final
decision recording), and extends FR11.1.

Verified by `apps/api/tests/evaluation.unit.test.ts` (39 tests over the
criterion catalogue, the consistency rules, the compliance derivation, the
threshold extraction, the scoring formulas, weighting, reproducibility and the
ranking) and `apps/api/tests/evaluation.integration.test.ts` (48 tests over
HTTP covering the whole flow and, mostly, the requests that must be refused: a
supplier on every evaluation route, an administrator attempting to configure,
run or decide, another department, an unauthenticated caller, an inconsistent
criteria set, a departmental question from another package's form, a run id
from another package, a response id from another package, a decision with no
reason, a second selection, a second decision on one response, a revocation
without a reason, and a repeat revocation). The suite also asserts that AI
analysis changes no score, that a supplier's own view of its response leaks no
evaluation field, and that Milestones 6, 7 and 8 still behave as before.

## Milestone 10 — Procurement Intelligence and Analytics (Planned, Not Detailed)

**Not implemented.** Goal: surface patterns across procurement activity once
enough of it has happened to be worth analyzing. Explicitly a later
product-intelligence phase, not a near-term priority.

- **Vendor gap analysis**, arising directly from Milestone 6's matching
  work: detect when a work package has no or very few eligible vendors,
  when required capabilities are absent across the vendor base, or when
  geographic/certification coverage is insufficient — and recommend a
  response (open targeted vendor registration, clarify or split the
  requirement, consider an alternative procurement approach).
- Government-side reporting: vendor availability and distribution by
  sector, work-package demand by category, frequently-missing
  capabilities, average match quality, time spent per workflow stage,
  invitation-to-response conversion, verification throughput.

## Milestone 11 — Advanced Semantic Optimization (Planned, Not Detailed)

**Not implemented.** Goal: improve matching quality after a reliable hybrid
baseline (Milestone 6's second half) is in production, not before. Milestone 9
records human selections and rejections but deliberately learns nothing from
them: that feedback loop is this milestone's, not that one's.

- Domain-specific embeddings, procurement vocabulary normalization,
  synonym expansion, industry taxonomies.
- Query expansion; reranking models; hybrid lexical/vector retrieval tuning.
- Learning from human shortlist and selection/rejection decisions —
  explicitly a feedback loop on top of the deterministic baseline, not a
  replacement for it.
- Evaluation datasets for measuring matching quality over time.
- **Multi-package and vendor allocation** — extending single-package
  matching to project-wide allocation: one vendor serving multiple
  packages, capacity limits across concurrent engagements, minimizing
  vendor count vs. preferring specialists, package dependencies. The
  architecture should support both *best vendor per package* and *best
  overall allocation across a project*, but allocation optimization is
  built on top of reliable per-package matching, not before it exists.

---

## Running It Locally

Three processes, from the repository root:

```
cd apps/ai-service && .venv/Scripts/python -m uvicorn app.main:app --port 8000
cd apps/api && npm install && npm run migrate && npm run seed && npm run dev
cd apps/web && npm install && npm run dev
```

`npm run seed` provisions demo accounts across all three roles and a
registry of 58 fully onboarded, administrator-verified suppliers spanning the
sectors a department actually buys from, with published procurement
opportunities to match against — see
[product/users-and-roles.md](product/users-and-roles.md) for the account
list.

Two supplier-only commands exist alongside it. `npm run check:vendors`
validates the catalogue against the onboarding schema and the API's own patch
schema without touching a database, and `npm run seed:vendors` writes only
supplier rows, leaving projects, work packages, invitations, responses and
evaluations alone. `npx tsx scripts/verifyVendorRegistry.ts` reads the
database back and fails if any supplier is short of complete, documented and
verified.

The first matching run after a reseed generates an embedding for every
supplier and therefore takes a couple of minutes; subsequent runs read the
stored vectors and complete in seconds (D67).

## Notes

- Sequencing follows the core system flow in
  [product/problem-statement.md](product/problem-statement.md), with one
  deliberate departure: authentication and RBAC were moved ahead of vendor
  work (D43). Vendor representatives need real accounts, so building vendor
  onboarding before authentication would have required throwaway scaffolding.
- Within Milestone 6, vendor onboarding was built before work-package-level
  matching for the same reason matching needs vendors to exist first: there
  is nothing to match against without a populated, verified vendor base.
- Each milestone must leave the project runnable, per
  [engineering/development-workflow.md](engineering/development-workflow.md).
- Milestones beyond the current one are not scheduled and should be
  re-scoped against [product/hackathon-scope.md](product/hackathon-scope.md)
  as the hackathon timeline becomes clearer.

## Related Documents

- [product/hackathon-scope.md](product/hackathon-scope.md)
- [product/requirements.md](product/requirements.md)
- [architecture/architecture.md](architecture/architecture.md)
- [ai/vendor-discovery.md](ai/vendor-discovery.md)
- [ai/rag-and-semantic-search.md](ai/rag-and-semantic-search.md)
- [ai/evaluation-and-ranking.md](ai/evaluation-and-ranking.md)
