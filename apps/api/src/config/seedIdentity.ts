import type { OrganizationKind } from "../auth/currentUser.js";
import type { UserRole } from "../auth/permissions.js";

/**
 * Government identities used for development and demonstration. Consumed only
 * by `scripts/seed.ts` — nothing under `src/` resolves an identity from this
 * file. Until Milestone 5 the acting official was read from here at request
 * time (D21); identity now comes from the authenticated session (D44).
 *
 * Supplier organizations and their accounts live in `seedVendors.ts`, because
 * each one carries a whole capability profile rather than just an identity.
 */

export interface SeedOrganization {
  code: string;
  name: string;
  kind: OrganizationKind;
}

export interface SeedUser {
  email: string;
  fullName: string;
  role: UserRole;
  organizationCode: string;
  description: string;
}

export const SEEDED_ORGANIZATION: SeedOrganization = {
  code: "DEPT-INFRA",
  name: "Department of Infrastructure Development",
  kind: "GOVERNMENT",
};

export const SEEDED_ORGANIZATIONS: readonly SeedOrganization[] = [
  SEEDED_ORGANIZATION,
  {
    code: "DEPT-HEALTH",
    name: "Department of Health and Family Welfare",
    kind: "GOVERNMENT",
  },
];

/**
 * The first entry is the original seeded official (D21). It is promoted in
 * place — same row, same UUID — so every existing project, analysis run,
 * requirement decision and stage-history entry stays attributed to it (D50).
 */
export const SEEDED_OFFICIAL: SeedUser = {
  email: "official@procureai.local",
  fullName: "A. Sharma",
  role: "GOVERNMENT_OFFICIAL",
  organizationCode: "DEPT-INFRA",
  description: "Government Official — owns the existing demonstration projects",
};

export const SEEDED_USERS: readonly SeedUser[] = [
  SEEDED_OFFICIAL,
  {
    email: "admin@procureai.local",
    fullName: "R. Iyer",
    role: "ADMIN",
    organizationCode: "DEPT-INFRA",
    description: "Administrator — organization-wide oversight, read-only",
  },
  {
    email: "official.health@procureai.local",
    fullName: "M. Banerjee",
    role: "GOVERNMENT_OFFICIAL",
    organizationCode: "DEPT-HEALTH",
    description: "Government Official in a second department — proves organization isolation",
  },
]; 
