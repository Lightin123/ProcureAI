import { createHash, randomBytes } from "node:crypto";

import type { AuthenticatedUser, OrganizationKind } from "../auth/currentUser.js";
import type { UserRole } from "../auth/permissions.js";
import { loadConfig } from "../config/env.js";
import { query } from "../db/pool.js";

const TOKEN_BYTES = 32;
const TOUCH_INTERVAL_MS = 60_000;
const EXPIRED_RETENTION_DAYS = 7;

/**
 * Only the hash is persisted, so a database dump yields nothing replayable.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(input: {
  userId: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}): Promise<IssuedSession> {
  const config = loadConfig();
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const now = Date.now();
  const expiresAt = new Date(now + config.sessionIdleMinutes * 60_000);
  const absoluteExpiresAt = new Date(now + config.sessionAbsoluteHours * 3_600_000);

  await query(
    `INSERT INTO user_sessions
       (user_id, token_hash, expires_at, absolute_expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.userId,
      hashToken(token),
      expiresAt,
      absoluteExpiresAt,
      input.userAgent ?? null,
      input.ipAddress ?? null,
    ],
  );

  return { token, expiresAt };
}

interface SessionLookupRow {
  session_id: string;
  last_seen_at: Date;
  user_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  organization_id: string;
  organization_name: string;
  organization_kind: OrganizationKind;
}

export interface ResolvedSession {
  user: AuthenticatedUser;
  lastSeenAt: Date;
}

/**
 * A session is usable only if it is unrevoked, inside both its idle and its
 * absolute window, and belongs to an active user. Putting `is_active` in this
 * predicate means disabling an account takes effect on its very next request
 * without having to find and revoke its sessions.
 */
export async function findValidSession(token: string): Promise<ResolvedSession | undefined> {
  const result = await query<SessionLookupRow>(
    `SELECT s.id AS session_id, s.last_seen_at,
            u.id AS user_id, u.full_name, u.email, u.role, u.organization_id,
            o.name AS organization_name, o.kind AS organization_kind
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = u.organization_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND s.absolute_expires_at > now()
       AND u.is_active = true`,
    [hashToken(token)],
  );

  const row = result.rows[0];
  if (row === undefined) {
    return undefined;
  }

  return {
    user: {
      id: row.user_id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationKind: row.organization_kind,
      sessionId: row.session_id,
    },
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * Slides the idle window, but never past the absolute expiry, and writes at most
 * once a minute so an active session does not cost a write per request.
 */
export async function touchSession(sessionId: string, lastSeenAt: Date): Promise<void> {
  if (Date.now() - lastSeenAt.getTime() < TOUCH_INTERVAL_MS) {
    return;
  }

  const idleMinutes = loadConfig().sessionIdleMinutes;
  await query(
    `UPDATE user_sessions
     SET last_seen_at = now(),
         expires_at = LEAST(now() + ($2 || ' minutes')::interval, absolute_expires_at)
     WHERE id = $1`,
    [sessionId, String(idleMinutes)],
  );
}

export async function revokeSession(token: string): Promise<void> {
  await query(
    `UPDATE user_sessions SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)],
  );
}

/** Called on login so a fresh sign-in never leaves an older token live. */
export async function revokeSessionsForUser(userId: string): Promise<void> {
  await query(
    `UPDATE user_sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

/** Opportunistic cleanup on login; no background job infrastructure (D30). */
export async function deleteExpiredSessions(): Promise<void> {
  await query(
    `DELETE FROM user_sessions
     WHERE absolute_expires_at < now() - ($1 || ' days')::interval`,
    [String(EXPIRED_RETENTION_DAYS)],
  );
}
