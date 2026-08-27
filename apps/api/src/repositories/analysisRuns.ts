import { getPool, query } from "../db/pool.js";
import { insertClarifications } from "./clarifications.js";
import { insertSuggestedRequirements, type RequirementCategory, type RequirementKind } from "./requirements.js";
import { recordStageTransition } from "./stageHistory.js";

export interface AnalysisRun {
  id: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  errorMessage: string | null;
  triggeredByName: string;
  createdAt: string;
  completedAt: string | null;
}

interface AnalysisRunRow {
  id: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  error_message: string | null;
  triggered_by_name: string;
  created_at: Date;
  completed_at: Date | null;
}

export async function listAnalysisRuns(projectId: string): Promise<AnalysisRun[]> {
  const result = await query<AnalysisRunRow>(
    `SELECT r.id, r.status, r.provider, r.model, r.prompt_version, r.error_message,
            u.full_name AS triggered_by_name, r.created_at, r.completed_at
     FROM requirement_analysis_runs r
     JOIN users u ON u.id = r.triggered_by
     WHERE r.project_id = $1
     ORDER BY r.created_at DESC`,
    [projectId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    errorMessage: row.error_message,
    triggeredByName: row.triggered_by_name,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at === null ? null : row.completed_at.toISOString(),
  }));
}

export async function createRun(projectId: string, triggeredBy: string): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO requirement_analysis_runs (project_id, triggered_by) VALUES ($1, $2) RETURNING id`,
    [projectId, triggeredBy],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error("Failed to create analysis run.");
  return id;
}

export async function markRunFailed(runId: string, message: string): Promise<void> {
  await query(
    `UPDATE requirement_analysis_runs
     SET status = 'FAILED', error_message = $2, completed_at = now()
     WHERE id = $1`,
    [runId, message],
  );
}

/**
 * Persists a successful analysis atomically: suggestions, clarifications, run
 * completion, and (on the first run) the DRAFT -> REQUIREMENTS_ANALYSIS transition.
 */
export async function completeRun(input: {
  runId: string;
  projectId: string;
  actorId: string;
  currentStatus: string;
  provider: string;
  model: string;
  promptVersion: string;
  requirements: Array<{
    kind: RequirementKind;
    category: RequirementCategory;
    text: string;
    rationale: string;
  }>;
  clarifications: Array<{ question: string; rationale: string }>;
}): Promise<void> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    await insertSuggestedRequirements(client, input.projectId, input.runId, input.requirements);
    await insertClarifications(client, input.projectId, input.runId, input.clarifications);

    await client.query(
      `UPDATE requirement_analysis_runs
       SET status = 'SUCCEEDED', provider = $2, model = $3, prompt_version = $4, completed_at = now()
       WHERE id = $1`,
      [input.runId, input.provider, input.model, input.promptVersion],
    );

    if (input.currentStatus === "DRAFT") {
      await client.query(
        `UPDATE procurement_projects SET status = 'REQUIREMENTS_ANALYSIS', updated_at = now()
         WHERE id = $1`,
        [input.projectId],
      );
      await recordStageTransition(client, {
        projectId: input.projectId,
        fromStatus: "DRAFT",
        toStatus: "REQUIREMENTS_ANALYSIS",
        actorId: input.actorId,
        reason: "AI requirement analysis started",
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function transitionStatus(input: {
  projectId: string;
  fromStatus: string;
  toStatus: string;
  actorId: string;
  reason: string;
}): Promise<void> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE procurement_projects SET status = $2::procurement_project_status, updated_at = now()
       WHERE id = $1`,
      [input.projectId, input.toStatus],
    );
    await recordStageTransition(client, {
      projectId: input.projectId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorId: input.actorId,
      reason: input.reason,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
