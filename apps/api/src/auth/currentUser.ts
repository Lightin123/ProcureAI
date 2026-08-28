import type { Request } from "express";

import { ApiError } from "../middleware/errors.js";
import { ROLE_LABELS, permissionsForRole, type Permission, type UserRole } from "./permissions.js";

export type OrganizationKind = "GOVERNMENT" | "VENDOR";

/**
 * The authenticated identity for one request. Every field is derived from the
 * session row and the database, never from anything the client sent.
 */
export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  organizationKind: OrganizationKind;
  sessionId: string;
}

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  organizationId: string;
  organizationName: string;
  organizationKind: OrganizationKind;
  permissions: readonly Permission[];
}

/**
 * Request-scoped accessor. Throws rather than returning undefined so a route
 * that somehow escaped `requireAuth` fails closed instead of acting as nobody.
 */
export function getCurrentUser(request: Request): AuthenticatedUser {
  const user = request.user;
  if (user === undefined) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  return user;
}

/** The wire representation. Deliberately has no field a password hash could occupy. */
export function toPublicUser(user: Omit<AuthenticatedUser, "sessionId">): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    organizationId: user.organizationId,
    organizationName: user.organizationName,
    organizationKind: user.organizationKind,
    permissions: permissionsForRole(user.role),
  };
}
