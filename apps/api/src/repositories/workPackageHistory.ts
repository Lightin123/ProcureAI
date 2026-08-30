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
  | "INVITATION_DECLINED"
  // Milestone 8. The response a supplier gives is an event in the work
  // package's own life, so it is audited in the same place as everything else
  // that happened to the package (D73).
  | "RESPONSE_CONFIGURED"
  | "RESPONSE_OPENED"
  | "RESPONSE_CLOSED"
  | "RESPONSE_SUBMITTED"
  | "RESPONSE_RESUBMITTED"
  | "RESPONSE_UNDER_REVIEW"
  | "RESPONSE_CLARIFICATION_REQUESTED"
  | "RESPONSE_CLARIFICATION_ASKED"
  | "RESPONSE_CLARIFICATION_ANSWERED"
  | "RESPONSE_READY_FOR_EVALUATION"
  | "RESPONSE_WITHDRAWN"
  // Milestone 9. Configuring criteria, running an evaluation, generating an
  // advisory reading and recording a decision are all things that happened to
  // this work package, so they are audited where everything else about it is
  // (D73). `VENDOR_SELECTED` is the only action in this system that records a
  // supplier being chosen, and only a route a named official invoked with a
  // reason writes it.
  | "EVALUATION_CONFIGURED"
  | "EVALUATION_RUN"
  | "EVALUATION_AI_ANALYSIS"
  | "VENDOR_SELECTED"
  | "VENDOR_REJECTED"
  | "DECISION_REVOKED";

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
