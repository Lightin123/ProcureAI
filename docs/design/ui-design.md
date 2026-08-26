# UI / UX Design Philosophy

**Status:** Confirmed design direction, elaborated into a concrete frontend
design specification. No UI has been implemented yet. Specific tokens
(exact colors, fonts, component library) remain unresolved — see
[Not Yet Decided](#not-yet-decided) — but the structural, layout, and
interaction conventions below are intended to guide every screen that gets
built.

## Design Intent

ProcureAI must look and feel like a **standard, professional Indian
government web portal or official administrative system** — not a modern
startup product. A government officer opening ProcureAI for the first time
should recognize the conventions immediately: formal layout, an
institutional header, structured navigation, breadcrumbs, information-dense
pages, tables, forms, notices, and status indicators — the same visual
grammar as other official government portals they already use daily.

The product should communicate:

- Trust
- Authority
- Professionalism
- Accessibility
- Administrative efficiency
- Clarity

It should feel **formal, structured, functional, and slightly
conservative** — modern and easy to use, but never flashy. When in doubt,
prefer the boring, predictable, government-portal choice over the
visually interesting one. The measure of success is believability as a
real government procurement platform, not visual novelty.

## Explicit Anti-Patterns

The design must **not** resemble:

- A modern startup SaaS product
- A futuristic AI application
- A chatbot product
- A crypto / Web3 interface
- A flashy, card-heavy analytics dashboard
- A generic marketing landing page

Avoid excessive or arbitrary:

- Gradients
- Animations and motion effects
- Rounded decorative cards
- Glowing effects, glassmorphism, or heavy shadows
- AI-themed graphics, mascots, or iconography
- Large hero sections or marketing-style imagery
- Trendy visual elements adopted only to look "modern"

Any visual decoration must earn its place by improving clarity or
findability. If it doesn't, leave it out.

## Standard Page Structure

Every authenticated screen follows the same skeleton, so officials always
know where to look for a given thing:

```
+----------------------------------------------------------------+
| Institutional Header (branding, portal name, user/session)      |
+----------------------------------------------------------------+
| Primary Navigation                                               |
+---------------+--------------------------------------------------+
| Section        | Breadcrumb                                      |
| Navigation     | Page Title                    [ Primary Action ]|
| (where          +--------------------------------------------------+
| applicable)    |                                                  |
|                | Page Content                                    |
|                | (tables / forms / panels / workflow status)     |
|                |                                                  |
+---------------+--------------------------------------------------+
| Footer (institutional links, version/build info)                 |
+----------------------------------------------------------------+
```

- **Header, primary navigation, and footer are constant** across the
  authenticated application.
- **Breadcrumb + page title + primary action** form a consistent "page
  header bar" at the top of every inner page — the official should never
  have to guess "where am I" or "what can I do here."
- Content areas favor **structured panels and tables over free-floating
  cards**. Panels have clear borders/headers, not decorative shadows.

## Institutional Header and Branding

The header establishes legitimacy and orientation, the way a real
government portal does:

- A left-aligned **branding area**: an emblem/logo placeholder, the portal
  name ("ProcureAI"), and — where applicable — the department/organization
  the current user is acting within (see Organizations/Departments in
  [../architecture/database.md](../architecture/database.md)).
- A right-aligned **session area**: signed-in official's name and role,
  and a sign-out action. No decorative avatar imagery — a plain
  name/role label is sufficient.
- The header is a fixed, thin institutional strip — not a large branded
  hero band. It should read as "official system," not "product marketing."
- A persistent, unobtrusive area for **system-wide notices** (e.g.
  scheduled maintenance, policy updates) may render directly beneath the
  header when active — see [Notices and Alerts](#notices-and-alerts).

## Navigation Patterns

- **Primary navigation** is a horizontal bar (or a persistent left rail,
  for an admin-heavy surface) listing top-level areas: Dashboard,
  Procurement Projects, Vendors, Evaluations, Reports/Audit,
  Administration (role-dependent visibility per
  [../product/users-and-roles.md](../product/users-and-roles.md)).
- **Section navigation** (a secondary left sidebar) is used within a
  complex area that has multiple sub-views — for example, within a single
  procurement project: Overview, Requirements, Work Packages, Vendor
  Discovery, Submissions, Evaluation, Recommendations, History. This
  mirrors how a project moves through
  [procurement-workflow.md](procurement-workflow.md).
- **Breadcrumbs are mandatory on every inner page**, reflecting the full
  hierarchy, e.g.:
  `Home / Procurement Projects / Smart Traffic Monitoring / Work Packages / WP-02`
- **Page titles are standardized**: a single, unambiguous `<h1>`-level
  title per page, matching the last breadcrumb segment, with the primary
  action (if any) aligned to its right — never buried in a menu.
- Navigation structure is **predictable and stable** — items do not
  reorder or appear/disappear based on transient state; visibility changes
  only with role/permission, not with workflow phase.

## Information-Dense Administrative Screens

Officials are professionals working through structured data, not consumers
browsing a feed. Screens should favor:

- **Tables and structured lists as the default**, not card grids. A card
  layout may be used only for small, genuinely card-shaped things (e.g. a
  handful of top-level summary counts), never for primary data browsing.
- **Compact, readable density** — moderate row height, clear column
  alignment (numbers right-aligned, text left-aligned, status as a badge
  column), and enough visible rows that officials aren't fighting
  pagination for routine review.
- **Summary/KPI strips are minimal and factual** (e.g. "12 Active
  Projects," "4 Pending Review") — small, restrained, and never the
  visual focus of the page.

## Government-Style Forms and Data Entry

- Forms are **section-grouped** with clear section headings (e.g.
  "Problem Description," "Constraints," "Timeline") rather than one long
  undifferentiated field list.
- Every field has a **visible label above the input** (not
  placeholder-only labels), with required fields marked consistently
  (e.g. a trailing `*` plus the word "required" for accessibility, not
  color alone).
- **Inline validation** appears next to the field on blur/submit, in plain
  language ("Budget must be a positive number"), not a generic toast.
- Multi-part processes (e.g. creating a procurement project, running
  requirement clarification) use a **numbered step indicator** (e.g.
  "Step 2 of 4: Clarification"), not a single overwhelming form or a
  silent multi-screen flow.
- **Destructive or final actions require explicit confirmation** — a
  modal dialog restating what will happen (e.g. "Reject this requirement?
  This cannot be undone.") before proceeding.
- Officials can always see a clear **Save / Cancel / Back** action set;
  no action is triggered implicitly by navigation alone.

## Tables: Search, Filter, Sort, and Pagination

Every substantial data table (projects, vendors, submissions, evaluations)
follows the same pattern:

- A **search box** scoped to that table, with a visible label of what it
  searches (e.g. "Search by project name or ID").
- A **filter panel or filter row** above the table for structured
  filtering (status, date range, organization, category) — filters are
  explicit, visible controls, not hidden behind a single ambiguous icon.
- **Sortable column headers** with a clear sort-direction indicator.
- **Standard pagination** (page numbers or prev/next with a visible
  total count, e.g. "Showing 21–40 of 132") — not infinite scroll, which
  hides how much data exists and breaks predictable review.
- Applied filters/sort/search state is reflected visibly (e.g. as removable
  filter chips) so officials always know what subset they're looking at.

## Notices, Alerts, and Announcements

- **Inline banner alerts** use a consistent, restrained set of levels —
  informational, success, warning, error — each with a distinct but
  muted color and an icon, never a floating toast that disappears before
  it can be read twice.
- **Page-level notices** (e.g. "This project has requirement changes that
  may affect existing evaluations" — consistent with the workflow
  principle that upstream changes can affect downstream results, per
  [procurement-workflow.md](procurement-workflow.md)) render as a
  persistent banner at the top of the affected page until acknowledged or
  resolved, not a transient popup.
- **System-wide announcements** (maintenance windows, policy notices) use
  the header-adjacent notice area described above.
- Alerts state **what happened and what the official can do about it** —
  never a bare error code.

## Workflow and Procurement Status Tracking

Status must always be visible and unambiguous, at two levels:

- **Project-level status** — a rolled-up status badge (e.g. "In Progress,"
  "Awaiting Clarification," "Under Evaluation," "Decision Recorded")
  reflecting the project's overall position, shown on every project list
  and the project overview page.
- **Work-package-level status** — since work packages can progress
  independently once confirmed (see
  [procurement-workflow.md](procurement-workflow.md)), each work package
  shows its own status and stage, so officials can see at a glance which
  packages are ahead or behind.
- A **stage/stepper indicator** on a project or work package's detail page
  visualizes its position along the workflow (e.g. Requirements →
  Work Packages → Discovery → Submissions → Evaluation → Recommendation →
  Decision), with completed, current, and upcoming stages visually
  distinguished — plainly, via labels and simple markers, not animation.
- **Status badges use consistent, restrained color coding** (e.g. neutral
  gray = not started, blue = in progress, amber = needs attention/action
  required, green = completed/approved, red = rejected/blocked) applied
  consistently everywhere a status appears.

## Document and Submission Management

- Each Submission (see
  [../architecture/database.md](../architecture/database.md)) has a clear
  **document list view**: filename, type, upload date, uploading party,
  and a processing-status badge (Pending / Processing / Processed /
  Failed), consistent with the Documents and Document Processing Results
  entities in that same document.
- **Upload areas** are explicit drag-and-drop-or-browse zones with visible
  accepted file types/size limits — never a bare unlabeled button.
- Officials can **view or download** a document directly; if document
  intelligence has extracted structured data from it, that extracted data
  is shown **alongside** the source document (e.g. side-by-side or an
  expandable panel), never presented as if it replaces the original file.
- Failed or stalled processing is surfaced clearly with a retry action
  where applicable, not silently hidden.

## Approval, Review, and Rejection Actions

A single, predictable action pattern is used everywhere an official acts on
an AI suggestion or a candidate/vendor/proposal, mirroring the actions
already defined in
[procurement-workflow.md](procurement-workflow.md) (Approve, Edit, Reject,
Merge, Split, Remove, Add manually, Regenerate/Re-run):

- Actions are presented as **clearly labeled buttons**, grouped together,
  with the affirmative/approving action visually primary and destructive
  actions (Reject, Remove) visually secondary but still clearly legible —
  never hidden in an overflow menu for a primary review action.
- **Rejecting or overriding an AI suggestion requires a reason** (a short
  required comment), which becomes part of that item's history — this
  supports auditability and gives future reviewers context.
- **Editing an AI suggestion** opens it in the same form pattern used for
  manual entry, pre-filled with the suggested value, and visibly marks it
  as "edited from AI suggestion" once changed.
- Bulk actions (e.g. approving multiple requirements at once) are
  available on list/table views via row selection, with the same
  confirmation pattern as single-item actions.

## Audit and History Views

Consistent with the conceptual distinction in
[../architecture/database.md](../architecture/database.md), the UI exposes
two related but separate views:

- **Workflow / Stage History** — a chronological view scoped to a single
  project or work package, showing its stage transitions (previous state
  → new state, actor, timestamp, reason where provided). Presented as a
  simple vertical timeline on that item's detail page.
- **Audit Log** — a broader, searchable/filterable table of state-changing
  actions (approvals, edits, rejections, overrides) across the system or
  scoped to an organization, available to roles with audit visibility
  (see [../product/users-and-roles.md](../product/users-and-roles.md)).
  Uses the same table conventions as any other data table (search, filter,
  sort, pagination).
- Both views are **read-only, plain, and dense** — history is a record to
  be reviewed, not a feature to be visually elevated.

## How AI Should Appear in the UI

AI stays embedded in the workflow; it never becomes the product's visual
identity.

**Prefer:**
> "AI Requirement Analysis," "AI-Suggested Work Packages,"
> "AI Evaluation Summary"

**Over:**
> "Ask ProcureAI 🤖," a floating chat bubble, or a conversational
> "ask me anything" surface as a primary interaction model.

Concretely:

- AI output — extracted requirements, clarification questions, generated
  work packages, evaluations, recommendations — renders as **structured
  panels** clearly labeled as AI-generated/suggested (e.g. a small
  "AI-Suggested" tag), using the same table/form/panel conventions as the
  rest of the product, not a distinct "AI mode" visual style.
- Every AI-generated item is presented with the standard
  review/edit/approve/reject controls from the
  [Approval, Review, and Rejection Actions](#approval-review-and-rejection-actions)
  pattern above — nothing AI-generated silently becomes confirmed state.
- Where a recommendation or evaluation includes reasoning/evidence (per
  explainability requirements in
  [../product/requirements.md](../product/requirements.md)), that
  reasoning is shown adjacent to the result, not hidden behind a
  secondary click, so officials can review the "why" without extra
  effort.
- No mascot, avatar, glowing indicator, or chat-style bubble is used to
  represent "the AI." It is a labeled capability inside the workflow, not
  a character.

## Accessibility and Usability for Non-Technical Officials

- Follow standard accessibility practice: full keyboard navigation,
  visible focus states, sufficient color contrast, and status/meaning
  never conveyed by color alone (always paired with text/icon+label).
- Use **plain, direct language** throughout — avoid technical or AI
  jargon in labels and messages (e.g. "Missing Information" rather than
  "Unresolved Entity Slots").
- **Icons are always paired with text labels** in primary navigation and
  actions; icon-only controls are reserved for well-established,
  universally understood cases (e.g. a search icon inside a labeled search
  box).
- Typography favors a **clear hierarchy and generous readability** —
  legible body text size, consistent heading levels — over dense
  compression for its own sake; "information-dense" means well-organized
  tables and panels, not small illegible text.
- Help/guidance text, where needed, is inline and contextual (e.g. field
  hints), not a separate help center officials must navigate away to find.

## Predictable and Conservative Interaction Patterns

- **No hidden gestures** (swipe-to-delete, long-press menus). Every action
  is a visible, labeled control.
- **No silent state changes.** Anything that changes confirmed data,
  especially irreversibly, requires an explicit action and, for
  significant actions, a confirmation dialog.
- **Consistent action placement**: primary/affirmative actions align to
  the right of a page-header action bar or the end of a form; Cancel/Back
  is always available and clearly distinguished from Save/Submit.
- **No auto-advancing workflows.** The system never moves a project or
  work package to its next stage without an explicit official action,
  consistent with the human-in-the-loop principle across
  [procurement-workflow.md](procurement-workflow.md) and
  [../product/product.md](../product/product.md).
- Loading and processing states are shown plainly (a labeled progress
  indicator or status badge, e.g. "Processing…"), not disguised with
  playful animation.

## Responsive Behavior

ProcureAI is a **desktop-first administrative tool** — officials are
expected to primarily use it on a laptop/desktop workstation, similar to
other government back-office systems. Desktop usability is never sacrificed
to accommodate mobile:

- Desktop/laptop layouts are the primary design target: full sidebar
  navigation, wide data tables, multi-column forms where appropriate.
- Tablet and mobile layouts **reflow** the same structure (e.g. sidebar
  collapses to a menu, tables become scrollable rather than reformatted
  into cards) rather than being redesigned as a separate, simplified
  mobile experience.
- No functionality is exclusive to a smaller breakpoint; mobile/tablet
  access is a reasonable secondary convenience, not the design center.

## Reference Framing

When a design decision is ambiguous, the test is: **"How would an existing,
credible Indian government e-governance portal handle this?"** — not "what
would a modern SaaS product do?" Favor the boring, institutional,
already-familiar pattern.

## Not Yet Decided

- Specific design system / component library, or hand-built components.
- Exact color palette and typography choices, beyond the general
  direction of a restrained, institutional palette (e.g. muted blue/navy
  tones commonly associated with Indian government portals, neutral grays
  for structure, a single reserved accent color for primary actions) and
  the consistent status-color coding described above.
- Specific accessibility standard/level to target (e.g. WCAG 2.1 AA).
- Whether an existing Indian government design system (e.g. patterns from
  established digital India portals) will be used as a direct visual
  reference.
- Bilingual/localization support (e.g. Hindi/English) — a plausible fit
  for an Indian government portal, but not yet discussed or confirmed as
  in scope.
- Whether primary navigation is a top bar, a left rail, or both depending
  on section, in the actual implementation.

## Related Documents

- [procurement-workflow.md](procurement-workflow.md)
- [../product/requirements.md](../product/requirements.md)
- [../product/users-and-roles.md](../product/users-and-roles.md)
- [../architecture/database.md](../architecture/database.md)
- [../ai/ai-system.md](../ai/ai-system.md)
