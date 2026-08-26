# Users and Roles

**Status:** Planned design. Role-based access control (RBAC) is a stated
principle; no authentication or authorization has been implemented yet (see
[../engineering/security.md](../engineering/security.md)).

## Primary User

### Government Procurement / Department Official

The main user of the platform. Owns procurement projects end to end.

Responsibilities:
- Create procurement projects and describe problems/requirements.
- Answer AI-generated clarification questions.
- Review, edit, approve, or reject AI-extracted requirements.
- Review and adjust generated work packages.
- Review discovered vendor candidates.
- Review evaluations, rankings, and explanations.
- Make and record the final procurement decision.

Permissions (planned):
- Full read/write on their own procurement projects.
- Cannot bypass required human-review checkpoints.

## Other Roles (Planned)

### Government Administrator

Oversees officials and projects at a department/organizational level.

Responsibilities (planned):
- View procurement projects across officials in their department.
- Configure department-level settings (future, unresolved scope).
- Oversight/audit of procurement decisions.

Permissions (planned):
- Read access across department projects.
- Administrative actions scoped to their department.

### Procurement Administrator

A more specialized administrative role focused on procurement process
governance (e.g. compliance rules, evaluation criteria templates).

Responsibilities (planned):
- Maintain evaluation criteria/weighting templates.
- Maintain compliance checklists used during evaluation.

Permissions (planned):
- Manage procurement configuration entities.
- Read access to procurement projects for governance purposes.

**Open question:** whether "Government Administrator" and "Procurement
Administrator" are genuinely distinct roles or should be merged into one
administrative role. Not yet decided — see
[../architecture/decisions.md](../architecture/decisions.md).

### Startup / Vendor Representative

Represents a startup or solution provider that can be discovered and
evaluated by the platform.

Responsibilities (planned):
- Maintain their organization's profile/capability data.
- Submit RFI responses / proposals for procurement projects they are invited
  to or apply to.

Permissions (planned):
- Read/write access limited to their own vendor profile and their own
  submissions.
- No access to other vendors' data or to internal evaluation results.

**Open question:** whether vendor self-service (profile management, RFI
submission) is in scope for the hackathon build or a future extension. See
[hackathon-scope.md](hackathon-scope.md).

### System Administrator

Technical administrator of the platform itself.

Responsibilities (planned):
- User and role management.
- System configuration and monitoring.
- Access to audit logs.

Permissions (planned):
- Full administrative access, separate from procurement decision-making
  authority.

## RBAC Summary (Planned, Not Implemented)

| Role | Manage Own Projects | View Other Projects | Manage Evaluation Config | Manage Vendor Profile | System Admin |
|---|---|---|---|---|---|
| Government Official | Yes | No | No | No | No |
| Government Administrator | Yes (department) | Yes (department) | No | No | No |
| Procurement Administrator | No | Read | Yes | No | No |
| Vendor Representative | No | No | No | Yes (own) | No |
| System Administrator | No | No | No | No | Yes |

This table describes intended design, not implemented behavior.

## Related Documents

- [requirements.md](requirements.md)
- [../engineering/security.md](../engineering/security.md)
- [../architecture/decisions.md](../architecture/decisions.md)
