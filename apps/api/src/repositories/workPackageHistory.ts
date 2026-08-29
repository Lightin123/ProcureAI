import { query } from "../db/pool.js";

export type WorkPackageHistoryAction =
  | "GENERATED"
  | "EDITED"
  | "ACCEPTED"
  | "REJECTED"
  | "MERGED"
  | "SPLIT"
  | "DELETED"
  | "RESTORED"
  | "DUPLICATED"
  | "REORDERED"
  | "CONFIRMED"
  // Milestone 7. Shortlisting and invitation are decisions taken against a work
  // package, so they are audited in the work package's own history rather than
  // in a parallel table nobody would think to read (D73).
  | "SHORTLISTED"
  | "SHORTLIST_REMOVED"
  | "INVITED"
  | "INVITATION_WITHDRAWN"
  | "INVITATION_ACCEPTED"
  | "INVITATION_DECLINED";

export interface WorkPackageHistoryEntry {
  id: string;
  projectId: string;
  workPackageId: string | null;
  actorId: string;
  actorName: string;
  action: WorkPackageHistoryAction;
  oldValue: any;
  newValue: any;
  reason: string | null;
  createdAt: string;
}

export async function recordWorkPackageHistory(
  projectId: string,
  workPackageId: string | null,
  actorId: string,
  action: WorkPackageHistoryAction,
  oldValue: any = null,
  newValue: any = null,
  reason: string | null = null,
): Promise<void> {
  await query(
    `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, old_value, new_value, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      projectId,
      workPackageId,
      actorId,
      action,
      oldValue !== null ? JSON.stringify(oldValue) : null,
      newValue !== null ? JSON.stringify(newValue) : null,
      reason,
    ],
  );
}

export async function listWorkPackageHistory(
  projectId: string,
  workPackageId?: string,
): Promise<WorkPackageHistoryEntry[]> {
  const whereClause = workPackageId
    ? "WHERE h.project_id = $1 AND h.work_package_id = $2"
    : "WHERE h.project_id = $1";
  const params = workPackageId ? [projectId, workPackageId] : [projectId];

  const result = await query<{
    id: string;
    project_id: string;
    work_package_id: string | null;
    actor_id: string;
    actor_name: string;
    action: WorkPackageHistoryAction;
    old_value: any;
    new_value: any;
    reason: string | null;
    created_at: string;
  }>(
    `SELECT h.id, h.project_id, h.work_package_id, h.actor_id, u.full_name AS actor_name,
            h.action, h.old_value, h.new_value, h.reason, h.created_at
     FROM work_package_history h
     JOIN users u ON u.id = h.actor_id
     ${whereClause}
     ORDER BY h.created_at DESC`,
    params,
  );

  return result.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    workPackageId: row.work_package_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    oldValue: row.old_value,
    newValue: row.new_value,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
