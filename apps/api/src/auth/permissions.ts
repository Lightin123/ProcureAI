export const USER_ROLES = ["GOVERNMENT_OFFICIAL", "ADMIN", "VENDOR"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  GOVERNMENT_OFFICIAL: "Government Official",
  ADMIN: "Administrator",
  VENDOR: "Vendor Representative",
};

export const PERMISSIONS = [
  "project:create",
  "project:read",
  "project:update",
  "requirements:read",
  "requirements:analyze",
  "requirements:decide",
  "clarification:answer",
  "workflow:transition",
  "workpackage:read",
  "workpackage:manage",
  "vendor:matching:read",
  "vendor:shortlist:manage",
  "organization:read",
  "system:status:read",
  "user:read",
  "user:manage",
  "audit:read",
  "vendor:profile:read",
  "vendor:profile:manage",
  "vendor:opportunity:read",
  "vendor:opportunity:engage",
  "vendor:registry:read",
  "vendor:verification:manage",
  "opportunity:publish",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The single authoritative statement of who may do what. Routes declare a
 * permission and never test a role, so authorization can be audited by reading
 * this one table.
 *
 * ADMIN is deliberately oversight-only: it reads across its organization but
 * holds no decision or workflow permission, because a procurement decision must
 * be attributable to the government official who made it.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  GOVERNMENT_OFFICIAL: [
    "project:create",
    "project:read",
    "project:update",
    "requirements:read",
    "requirements:analyze",
    "requirements:decide",
    "clarification:answer",
    "workflow:transition",
    "workpackage:read",
    "workpackage:manage",
    "vendor:matching:read",
    "vendor:shortlist:manage",
    "organization:read",
    "system:status:read",
    "opportunity:publish",
  ],
  // Oversight may read a ranking but not act on it: shortlisting a supplier is
  // a procurement act, and it stays with the official who is accountable for
  // the decision (D60).
  ADMIN: [
    "project:read",
    "requirements:read",
    "workpackage:read",
    "vendor:matching:read",
    "organization:read",
    "system:status:read",
    "user:read",
    "user:manage",
    "audit:read",
    "vendor:registry:read",
    "vendor:verification:manage",
  ],
  VENDOR: [
    "vendor:profile:read",
    "vendor:profile:manage",
    "vendor:opportunity:read",
    "vendor:opportunity:engage",
  ],
};

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
