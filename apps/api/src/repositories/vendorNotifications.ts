import { query } from "../db/pool.js";

export interface VendorNotification {
  id: string;
  category: string;
  title: string;
  body: string;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

export type NotificationCategory =
  | "REGISTRATION"
  | "PROFILE"
  | "VERIFICATION"
  | "DOCUMENT"
  | "OPPORTUNITY";

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
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, category, title, body, link_path, read_at, created_at
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
}): Promise<void> {
  await query(
    `INSERT INTO vendor_notifications (vendor_profile_id, category, title, body, link_path)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.profileId, input.category, input.title, input.body, input.linkPath ?? null],
  );
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
