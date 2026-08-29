import { query } from "../db/pool.js";

export interface VendorNotification {
  id: string;
  category: string;
  title: string;
  body: string;
  linkPath: string | null;
  invitationId: string | null;
  readAt: string | null;
  createdAt: string;
}

export type NotificationCategory =
  | "REGISTRATION"
  | "PROFILE"
  | "VERIFICATION"
  | "DOCUMENT"
  | "OPPORTUNITY"
  | "INVITATION";

export async function listNotifications(
  profileId: string,
  limit = 20,
): Promise<VendorNotification[]> {
  const result = await query<{
    id: string;
    category: string;
    title: string;
    body: string;
    link_path: string | null;
    invitation_id: string | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, category, title, body, link_path, invitation_id, read_at, created_at
     FROM vendor_notifications
     WHERE vendor_profile_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [profileId, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    linkPath: row.link_path,
    invitationId: row.invitation_id,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createNotification(input: {
  profileId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  linkPath?: string | undefined;
  invitationId?: string | undefined;
}): Promise<void> {
  await query(
    `INSERT INTO vendor_notifications
       (vendor_profile_id, category, title, body, link_path, invitation_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.profileId,
      input.category,
      input.title,
      input.body,
      input.linkPath ?? null,
      input.invitationId ?? null,
    ],
  );
}

/**
 * Marks one notification read.
 *
 * The owning profile is part of the WHERE clause rather than checked before it:
 * a notification id from the browser is not evidence of ownership, and the only
 * safe way to use one is as half of a predicate. A notification belonging to
 * another supplier updates nothing and reads back as absent.
 */
export async function markNotificationRead(
  profileId: string,
  notificationId: string,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE vendor_notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND vendor_profile_id = $2
     RETURNING id`,
    [notificationId, profileId],
  );

  return result.rows.length > 0;
}

export async function markNotificationsRead(profileId: string): Promise<void> {
  await query(
    `UPDATE vendor_notifications SET read_at = now()
     WHERE vendor_profile_id = $1 AND read_at IS NULL`,
    [profileId],
  );
}

export async function countUnread(profileId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM vendor_notifications
     WHERE vendor_profile_id = $1 AND read_at IS NULL`,
    [profileId],
  );
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}
