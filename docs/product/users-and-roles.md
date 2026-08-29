# Users and Roles

**Status:** Implemented as of Milestone 5. Three roles exist, authenticate,
and are enforced by the Express backend — see
[../engineering/security.md](../engineering/security.md) for the
authentication and authorization architecture.

## Implemented Roles

Milestone 5 implements **three roles, one per user**, stored as the
`user_role` PostgreSQL enum (D46). The role model below replaces the earlier
five-role sketch; what changed and why is recorded under
[Roles Not Implemented](#roles-not-implemented).

### Government Procurement / Department Official — `GOVERNMENT_OFFICIAL`

The primary user of the platform. Owns procurement projects end to end.

Responsibilities:
- Create procurement projects and describe problems/requirements.
- Answer AI-generated clarification questions.
- Review, edit, approve, or reject AI-extracted requirements.
- Review and adjust generated work packages.
- Review discovered vendor candidates, compare them side by side, and
  shortlist them against a specific work package with a recorded reason.
- Invite shortlisted suppliers to respond, and track who accepted, who
  declined and why.
- Review evaluations, rankings, and explanations.
- Make and record the final procurement decision.

Permissions: full read/write on procurement projects **within their own
organization**, including running AI analysis and performing workflow
transitions. Cannot bypass required human-review checkpoints, and cannot see
another department's projects.

### Administrator — `ADMIN`

Departmental oversight. Merges what were previously described as "Government
Administrator" and "Procurement Administrator" (D46).

Responsibilities:
- View procurement projects across officials in their department.
- Oversight and audit of procurement activity.
- User administration within their department (no endpoint yet — see U30).

Permissions: **read-only across their organization.** An administrator is
deliberately *not* able to create projects, run analysis, decide on
requirements, answer clarifications, or transition a workflow stage (D48).

> **Why administrators cannot act on a project.** A procurement decision must
> be attributable to the government official who made it (FR11.1, Workflow
> Principle 6). An oversight role able to quietly confirm another official's
> requirements would defeat both the audit trail and the accountability model.
> The accepted cost is that an administrator cannot unblock a project on an
> absent official's behalf.

### Vendor Representative — `VENDOR`

Represents a startup, manufacturer, service provider, or other solution
provider that can be discovered and matched by the platform — not limited
to technology companies. Vendor accounts exist, authenticate, self-register
publicly, and onboard a capability profile (Milestone 6, implemented), and
receive, open and answer work-package invitations (Milestone 7, implemented).
Submitting a structured RFI response or proposal — as distinct from accepting
an invitation to respond — is not yet implemented; see
[../development-roadmap.md](../development-roadmap.md) Milestone 8.

Responsibilities (implemented):
- Register the organization and maintain its capability profile through a
  progressive, industry-adaptive onboarding flow.
- Add products/services, past experience, and credentials; upload
  compliance documents.
- Discover published procurement opportunities matched against the
  profile, save opportunities, and register interest.
- Receive an in-portal notification when a department issues an invitation,
  open the invitation, review the work package it concerns, and **accept or
  decline** — with a stated reason when declining.

Responsibilities (planned, Milestone 8):
- Submit RFI responses / proposals / quotations, distinct from both the
  unstructured "register interest" signal and the accept/decline already
  implemented.

Permissions (Milestone 8 adds `vendor:response:read` and
`vendor:response:submit`, held by no other role): `vendor:profile:read`,
`vendor:profile:manage`,
`vendor:opportunity:read`, `vendor:opportunity:engage`,
`vendor:invitation:read`, `vendor:invitation:respond`. A vendor holds
**no** project, requirement, workflow, matching, shortlist or
system-diagnostics permission — access to internal government data is not
restricted by a check that could be bypassed, because there is no grant to
bypass. Signing in as a vendor leads to the vendor portal; every procurement
endpoint and the system-status endpoint return 403.

The two invitation permissions are held by `VENDOR` alone, and
`vendor:invitation:manage` by `GOVERNMENT_OFFICIAL` alone. No role holds both
halves: the side that issues an invitation cannot answer it, and the side
that answers it cannot see how it was selected (D76).

## Implemented Permission Matrix

Authorization is permission-based (D47): routes declare a permission, and
`ROLE_PERMISSIONS` in `apps/api/src/auth/permissions.ts` is the single
authoritative mapping. This table mirrors that file.

| Permission | Official | Admin | Vendor |
|---|---|---|---|
| `project:create` | Yes | — | — |
| `project:read` | Yes | Yes | — |
| `project:update` | Yes | — | — |
| `requirements:read` | Yes | Yes | — |
| `requirements:analyze` | Yes | — | — |
| `requirements:decide` | Yes | — | — |
| `clarification:answer` | Yes | — | — |
| `workflow:transition` | Yes | — | — |
| `workpackage:read` | Yes | Yes | — |
| `workpackage:manage` | Yes | — | — |
| `opportunity:publish` | Yes | — | — |
| `organization:read` | Yes | Yes | — |
| `system:status:read` | Yes | Yes | — |
| `user:read` | — | Yes | — |
| `user:manage` | — | Yes | — |
| `audit:read` | — | Yes | — |
| `vendor:registry:read` | — | Yes | — |
| `vendor:verification:manage` | — | Yes | — |
| `vendor:profile:read` | — | — | Yes |
| `vendor:profile:manage` | — | — | Yes |
| `vendor:opportunity:read` | — | — | Yes |
| `vendor:opportunity:engage` | — | — | Yes |
| `vendor:matching:read` | Yes | Yes | — |
| `vendor:shortlist:manage` | Yes | — | — |
| `vendor:invitation:manage` | Yes | — | — |
| `vendor:invitation:read` | — | — | Yes |
| `vendor:invitation:respond` | — | — | Yes |
| `response:configure` | Yes | — | — |
| `response:read` | Yes | Yes | — |
| `response:manage` | Yes | — | — |
| `vendor:response:read` | — | — | Yes |
| `vendor:response:submit` | — | — | Yes |

Every "Yes" is additionally scoped to the user's own organization — see
[Organization Scope](#organization-scope) — **except** `vendor:registry:read`
and `vendor:verification:manage`, which are deliberately platform-wide: an
administrator verifies suppliers across every vendor organization, not only
their own department's (D60). `system:status:read` is withheld from vendors,
who are external parties (D54). `opportunity:publish` governs an official
exposing a confirmed project to the vendor portal (D57) — a separate act
from `workflow:transition`. `user:manage` and `audit:read` are granted but
have no endpoints yet (U30, U31). `vendor:shortlist:manage` and
`vendor:invitation:manage` are withheld from `ADMIN` for the same reason as
every other decision permission: shortlisting and inviting a supplier are
procurement acts, and they stay with the official who is accountable for them
(D48, D60, D69).

## Organization Scope

Each user belongs to exactly one organization via `users.organization_id`
(D49). A role grants a capability; the organization decides which records that
capability applies to. Effective authority is therefore *role x organization*.

`organizations.kind` distinguishes a `GOVERNMENT` department from a `VENDOR`
company, so vendor users participate in the same foreign key without a
government project ever being scoped to a vendor organization.

Access to another organization's data returns **404, not 403** — a 403 would
confirm that a resource with that identifier exists elsewhere.

## Roles Not Implemented

### Procurement Administrator — merged into `ADMIN`

The distinction between "Government Administrator" and "Procurement
Administrator" was the long-standing open question U4. It is resolved by
merging them (D46): the only thing that separated them was management of
evaluation-criteria templates and compliance checklists, and neither exists
yet. Two roles indistinguishable in every implemented surface are one role
with two names. Milestone 7 did not make them divergent — it added
shortlisting and invitation, both of which are official-only decision
permissions that an administrator was already withheld from. If a later
milestone does, splitting is a data migration on a single column.

### System Administrator — not implemented

A platform-operations role whose entire surface — user management UI, system
configuration, monitoring, audit log access — does not exist. Creating an
empty role would be scaffolding. It is recorded here as deliberately deferred
rather than dropped.

## Demo Accounts

`npm run seed` provisions, for development and demonstration only: three
government accounts across two departments (two officials, one
administrator), and a set of vendor accounts spanning multiple industries
— manufacturing, agriculture, construction, healthcare, skilling,
sustainability — at varying onboarding-completion and verification states,
alongside published procurement opportunities for them to match against.
Credential handling and the reset procedure are covered in
[../engineering/security.md](../engineering/security.md).

## Related Documents

- [requirements.md](requirements.md)
- [../engineering/security.md](../engineering/security.md)
- [../architecture/decisions.md](../architecture/decisions.md)
- [../architecture/database.md](../architecture/database.md)
