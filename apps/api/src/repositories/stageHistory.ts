import type { PoolClient } from "pg";

import { query } from "../db/pool.js";

export interface StageHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorName: string;
  reason: string | null;
  createdAt: string;
}

interface StageHistoryRow {
  id: string;
  from_status: string | null;
  to_status: string;
  actor_name: string;
  reason: string | null;
  created_at: Date;
}

export async function recordStageTransition(
  client: PoolClient,
  input: {
    projectId: string;
    fromStatus: string | null;
    toStatus: string;
    actorId: string;
    reason?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO project_stage_history (project_id, from_status, to_status, actor_id, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.projectId, input.fromStatus, input.toStatus, input.actorId, input.reason ?? null],
  );
}

export async function listStageHistory(projectId: string): Promise<StageHistoryEntry[]> {
  const result = await query<StageHistoryRow>(
    `SELECT h.id, h.from_status, h.to_status, u.full_name AS actor_name, h.reason, h.created_at
     FROM project_stage_history h
     JOIN users u ON u.id = h.actor_id
     WHERE h.project_id = $1
     ORDER BY h.created_at DESC`,
    [projectId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorName: row.actor_name,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  }));
}
