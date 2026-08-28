import { query } from "../db/pool.js";
import { type WorkPackageDecompositionResult } from "../services/aiClient.js";

export interface WorkPackageAnalysisRecord {
  id: string;
  projectId: string;
  triggeredBy: string;
  triggeredByName: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  promptHash: string | null;
  temperature: number | null;
  generationTimeMs: number | null;
  completionId: string | null;
  rawPrompt: string | null;
  rawResponse: string | null;
  tokenUsage: Record<string, any>;
  confidenceScore: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function createWorkPackageAnalysisRun(
  projectId: string,
  userId: string,
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO work_package_analyses (project_id, triggered_by, status)
     VALUES ($1, $2, 'PENDING')
     RETURNING id`,
    [projectId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create work package analysis run.");
  return row.id;
}

export async function completeWorkPackageAnalysisRun(
  analysisId: string,
  result: WorkPackageDecompositionResult,
): Promise<void> {
  await query(
    `UPDATE work_package_analyses
     SET status = 'SUCCEEDED',
         provider = $1,
         model = $2,
         prompt_version = $3,
         prompt_hash = $4,
         raw_prompt = $5,
         raw_response = $6,
         token_usage = $7,
         completion_id = $8,
         generation_time_ms = $9,
         confidence_score = $10,
         completed_at = now()
     WHERE id = $11`,
    [
      result.provider,
      result.model,
      result.prompt_version,
      result.prompt_hash,
      result.raw_prompt,
      result.raw_response,
      JSON.stringify(result.token_usage),
      result.completion_id ?? null,
      result.response_time_ms,
      result.overall_confidence,
      analysisId,
    ],
  );
}

export async function markWorkPackageAnalysisRunFailed(
  analysisId: string,
  errorMessage: string,
): Promise<void> {
  await query(
    `UPDATE work_package_analyses
     SET status = 'FAILED',
         error_message = $1,
         completed_at = now()
     WHERE id = $2`,
    [errorMessage, analysisId],
  );
}

export async function listWorkPackageAnalyses(
  projectId: string,
): Promise<WorkPackageAnalysisRecord[]> {
  const result = await query<{
    id: string;
    project_id: string;
    triggered_by: string;
    triggered_by_name: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    provider: string | null;
    model: string | null;
    prompt_version: string | null;
    prompt_hash: string | null;
    temperature: number | null;
    generation_time_ms: number | null;
    completion_id: string | null;
    raw_prompt: string | null;
    raw_response: string | null;
    token_usage: any;
    confidence_score: number | null;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
  }>(
    `SELECT a.id, a.project_id, a.triggered_by, u.full_name AS triggered_by_name,
            a.status, a.provider, a.model, a.prompt_version, a.prompt_hash,
            a.temperature, a.generation_time_ms, a.completion_id,
            a.raw_prompt, a.raw_response, a.token_usage, a.confidence_score,
            a.error_message, a.created_at, a.completed_at
     FROM work_package_analyses a
     JOIN users u ON u.id = a.triggered_by
     WHERE a.project_id = $1
     ORDER BY a.created_at DESC`,
    [projectId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    triggeredBy: row.triggered_by,
    triggeredByName: row.triggered_by_name,
    status: row.status,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    promptHash: row.prompt_hash,
    temperature: row.temperature !== null ? Number(row.temperature) : null,
    generationTimeMs: row.generation_time_ms,
    completionId: row.completion_id,
    rawPrompt: row.raw_prompt,
    rawResponse: row.raw_response,
    tokenUsage: typeof row.token_usage === "object" && row.token_usage !== null ? row.token_usage : {},
    confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}
