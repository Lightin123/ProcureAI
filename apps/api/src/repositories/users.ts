import type { OrganizationKind } from "../auth/currentUser.js";
import type { UserRole } from "../auth/permissions.js";
import { query } from "../db/pool.js";

/**
 * The only shape in the codebase that carries a password hash, and the only
 * function that selects it. It is consumed by the login handler and never
 * reaches a response body.
 */
export interface UserCredentials {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  organizationKind: OrganizationKind;
  passwordHash: string | null;
  isActive: boolean;
}

export async function findUserCredentialsByEmail(
  email: string,
): Promise<UserCredentials | undefined> {
  const result = await query<{
    id: string;
    full_name: string;
    email: string;
    role: UserRole;
    organization_id: string;
    organization_name: string;
    organization_kind: OrganizationKind;
    password_hash: string | null;
    is_active: boolean;
  }>(
    `SELECT u.id, u.full_name, u.email, u.role, u.organization_id,
            o.name AS organization_name, o.kind AS organization_kind,
            u.password_hash, u.is_active
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE lower(u.email) = lower($1)`,
    [email],
  );

  const row = result.rows[0];
  if (row === undefined) {
    return undefined;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationKind: row.organization_kind,
    passwordHash: row.password_hash,
    isActive: row.is_active,
  };
}

export async function recordLogin(userId: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}
