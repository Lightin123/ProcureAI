import type { PoolClient } from "pg";

import { query } from "../db/pool.js";

export type RequirementKind = "REQUIREMENT" | "CONSTRAINT";
export type RequirementCategory =
  | "FUNCTIONAL"
  | "NON_FUNCTIONAL"
  | "BUDGET"
  | "TIMELINE"
  | "COMPLIANCE"
  | "OTHER";
export type RequirementStatus = "SUGGESTED" | "ACCEPTED" | "REJECTED";
export type RequirementSource = "AI_SUGGESTED" | "MANUAL";

export interface ProjectRequirement {
  id: string;
  analysisRunId: string | null;
  kind: RequirementKind;
  category: RequirementCategory;
  text: string;
  rationale: string | null;
  source: RequirementSource;
  status: RequirementStatus;
  originalText: string | null;
  rejectionReason: string | null;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RequirementRow {
  id: string;
  analysis_run_id: string | null;
  kind: RequirementKind;
  category: RequirementCategory;
  text: string;
  rationale: string | null;
  source: RequirementSource;
  status: RequirementStatus;
  original_text: string | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

function toRequirement(row: RequirementRow): ProjectRequirement {
  return {
    id: row.id,
    analysisRunId: row.analysis_run_id,
    kind: row.kind,
    category: row.category,
    text: row.text,
    rationale: row.rationale,
    source: row.source,
    status: row.status,
    originalText: row.original_text,
    rejectionReason: row.rejection_reason,
    edited: row.original_text !== null && row.original_text !== row.text,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_COLUMNS = `id, analysis_run_id, kind, category, text, rationale, source,
  status, original_text, rejection_reason, created_at, updated_at`;

export async function listRequirements(projectId: string): Promise<ProjectRequirement[]> {
  const result = await query<RequirementRow>(
    `SELECT ${SELECT_COLUMNS} FROM project_requirements
     WHERE project_id = $1 ORDER BY kind, category, created_at`,
    [projectId],
  );
  return result.rows.map(toRequirement);
}

export async function findRequirement(
  projectId: string,
  requirementId: string,
): Promise<ProjectRequirement | undefined> {
  const result = await query<RequirementRow>(
    `SELECT ${SELECT_COLUMNS} FROM project_requirements WHERE project_id = $1 AND id = $2`,
    [projectId, requirementId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : toRequirement(row);
}

export async function countAcceptedRequirements(projectId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM project_requirements
     WHERE project_id = $1 AND status = 'ACCEPTED'`,
    [projectId],
  );
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function insertSuggestedRequirements(
  client: PoolClient,
  projectId: string,
  analysisRunId: string,
  items: Array<{
    kind: RequirementKind;
    category: RequirementCategory;
    text: string;
    rationale: string;
  }>,
): Promise<void> {
  for (const item of items) {
    await client.query(
      `INSERT INTO project_requirements
         (project_id, analysis_run_id, kind, category, text, rationale, source, status, original_text)
       VALUES ($1, $2, $3, $4, $5, $6, 'AI_SUGGESTED', 'SUGGESTED', $5)`,
      [projectId, analysisRunId, item.kind, item.category, item.text, item.rationale],
    );
  }
}

export async function createManualRequirement(input: {
  projectId: string;
  kind: RequirementKind;
  category: RequirementCategory;
  text: string;
}): Promise<ProjectRequirement> {
  const result = await query<RequirementRow>(
    `INSERT INTO project_requirements
       (project_id, kind, category, text, source, status)
     VALUES ($1, $2, $3, $4, 'MANUAL', 'ACCEPTED')
     RETURNING ${SELECT_COLUMNS}`,
    [input.projectId, input.kind, input.category, input.text],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Failed to create requirement.");
  return toRequirement(row);
}

export async function updateRequirementDecision(input: {
  projectId: string;
  requirementId: string;
  status: RequirementStatus;
  text?: string;
  rejectionReason?: string | null;
  decidedBy: string;
}): Promise<ProjectRequirement | undefined> {
  const result = await query<RequirementRow>(
    `UPDATE project_requirements
     SET status = $3,
         text = COALESCE($4, text),
         rejection_reason = $5,
         decided_by = $6,
         decided_at = now(),
         updated_at = now()
     WHERE project_id = $1 AND id = $2
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.projectId,
      input.requirementId,
      input.status,
      input.text ?? null,
      input.rejectionReason ?? null,
      input.decidedBy,
    ],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : toRequirement(row);
}
