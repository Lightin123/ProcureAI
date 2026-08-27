import type { PoolClient } from "pg";

import { query } from "../db/pool.js";

export type ClarificationStatus = "OPEN" | "ANSWERED" | "DISMISSED";

export interface ClarificationQuestion {
  id: string;
  analysisRunId: string | null;
  question: string;
  rationale: string | null;
  status: ClarificationStatus;
  answerText: string | null;
  answeredAt: string | null;
  createdAt: string;
}

interface ClarificationRow {
  id: string;
  analysis_run_id: string | null;
  question: string;
  rationale: string | null;
  status: ClarificationStatus;
  answer_text: string | null;
  answered_at: Date | null;
  created_at: Date;
}

const SELECT_COLUMNS = `id, analysis_run_id, question, rationale, status, answer_text,
  answered_at, created_at`;

function toClarification(row: ClarificationRow): ClarificationQuestion {
  return {
    id: row.id,
    analysisRunId: row.analysis_run_id,
    question: row.question,
    rationale: row.rationale,
    status: row.status,
    answerText: row.answer_text,
    answeredAt: row.answered_at === null ? null : row.answered_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

export async function listClarifications(projectId: string): Promise<ClarificationQuestion[]> {
  const result = await query<ClarificationRow>(
    `SELECT ${SELECT_COLUMNS} FROM clarification_questions
     WHERE project_id = $1 ORDER BY created_at`,
    [projectId],
  );
  return result.rows.map(toClarification);
}

export async function countOpenClarifications(projectId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM clarification_questions
     WHERE project_id = $1 AND status = 'OPEN'`,
    [projectId],
  );
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function insertClarifications(
  client: PoolClient,
  projectId: string,
  analysisRunId: string,
  items: Array<{ question: string; rationale: string }>,
): Promise<void> {
  for (const item of items) {
    await client.query(
      `INSERT INTO clarification_questions (project_id, analysis_run_id, question, rationale)
       VALUES ($1, $2, $3, $4)`,
      [projectId, analysisRunId, item.question, item.rationale],
    );
  }
}

export async function answerClarification(input: {
  projectId: string;
  questionId: string;
  answerText: string;
  answeredBy: string;
}): Promise<ClarificationQuestion | undefined> {
  const result = await query<ClarificationRow>(
    `UPDATE clarification_questions
     SET answer_text = $3, status = 'ANSWERED', answered_by = $4, answered_at = now()
     WHERE project_id = $1 AND id = $2
     RETURNING ${SELECT_COLUMNS}`,
    [input.projectId, input.questionId, input.answerText, input.answeredBy],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : toClarification(row);
}
