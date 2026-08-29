/**
 * The department's configuration of what a response to a work package must
 * contain, and the custom questions attached to it.
 *
 * Government-side only. Suppliers read the configuration through
 * `workPackageResponses.ts`, which resolves it from their own response row and
 * serves a narrower shape — a supplier is told what it is being asked for, not
 * who configured it, when, or what the department has closed since.
 *
 * Every function here takes the organization from the caller and applies it in
 * SQL. A work package id from the browser is never sufficient on its own.
 */

import { query } from "../db/pool.js";
import {
  normalizeSections,
  type QuestionType,
  type ResponseType,
  type SectionMode,
} from "../responses/schema.js";
import { dayHasPassed, toIsoDay } from "./dates.js";

export type ResponseConfigStatus = "DRAFT" | "OPEN" | "CLOSED";

export interface ResponseConfig {
  id: string;
  workPackageId: string;
  projectId: string;
  organizationId: string;
  responseType: ResponseType;
  status: ResponseConfigStatus;
  title: string | null;
  instructions: string | null;
  responseDeadline: string | null;
  /** Derived at read time; there is no stored expiry and no job to write one. */
  deadlinePassed: boolean;
  sections: Record<string, SectionMode>;
  allowClarifications: boolean;
  allowDocuments: boolean;
  documentsRequired: boolean;
  configuredByName: string;
  openedByName: string | null;
  openedAt: string | null;
  closedByName: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConfigRow {
  id: string;
  work_package_id: string;
  project_id: string;
  organization_id: string;
  response_type: ResponseType;
  status: ResponseConfigStatus;
  title: string | null;
  instructions: string | null;
  response_deadline: Date | null;
  sections: Record<string, SectionMode> | null;
  allow_clarifications: boolean;
  allow_documents: boolean;
  documents_required: boolean;
  configured_by_name: string;
  opened_by_name: string | null;
  opened_at: Date | null;
  closed_by_name: string | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const CONFIG_SELECT = `
  SELECT c.id, c.work_package_id, c.project_id, c.organization_id, c.response_type,
         c.status, c.title, c.instructions, c.response_deadline, c.sections,
         c.allow_clarifications, c.allow_documents, c.documents_required,
         configurer.full_name AS configured_by_name,
         opener.full_name AS opened_by_name, c.opened_at,
         closer.full_name AS closed_by_name, c.closed_at,
         c.created_at, c.updated_at
  FROM work_package_response_configs c
  JOIN users configurer ON configurer.id = c.configured_by
  LEFT JOIN users opener ON opener.id = c.opened_by
  LEFT JOIN users closer ON closer.id = c.closed_by
`;

function toConfig(row: ConfigRow): ResponseConfig {
  const responseDeadline = toIsoDay(row.response_deadline);

  return {
    id: row.id,
    workPackageId: row.work_package_id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    responseType: row.response_type,
    status: row.status,
    title: row.title,
    instructions: row.instructions,
    responseDeadline,
    deadlinePassed: dayHasPassed(responseDeadline),
    sections: normalizeSections(row.response_type, row.sections),
    allowClarifications: row.allow_clarifications,
    allowDocuments: row.allow_documents,
    documentsRequired: row.documents_required,
    configuredByName: row.configured_by_name,
    openedByName: row.opened_by_name,
    openedAt: row.opened_at?.toISOString() ?? null,
    closedByName: row.closed_by_name,
    closedAt: row.closed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function findConfigForWorkPackage(
  workPackageId: string,
  organizationId: string,
): Promise<ResponseConfig | undefined> {
  const result = await query<ConfigRow>(
    `${CONFIG_SELECT} WHERE c.work_package_id = $1 AND c.organization_id = $2`,
    [workPackageId, organizationId],
  );

  const row = result.rows[0];
  return row === undefined ? undefined : toConfig(row);
}

export async function findConfigById(configId: string): Promise<ResponseConfig | undefined> {
  const result = await query<ConfigRow>(`${CONFIG_SELECT} WHERE c.id = $1`, [configId]);
  const row = result.rows[0];
  return row === undefined ? undefined : toConfig(row);
}

/**
 * Creates or replaces the configuration for one work package.
 *
 * An upsert rather than separate create and update paths: there is exactly one
 * configuration per work package, and "does one already exist" is a question the
 * unique index answers better than the caller can. `configured_by` is left as
 * whoever first wrote it, so the record shows who set the terms up rather than
 * who last adjusted a deadline.
 *
 * The lifecycle columns are untouched here — opening and closing are their own
 * transitions, and an edit must not silently reopen a closed configuration.
 */
export async function upsertConfig(input: {
  workPackageId: string;
  projectId: string;
  organizationId: string;
  responseType: ResponseType;
  title: string | null;
  instructions: string | null;
  responseDeadline: string | null;
  sections: Record<string, SectionMode>;
  allowClarifications: boolean;
  allowDocuments: boolean;
  documentsRequired: boolean;
  configuredBy: string;
}): Promise<ResponseConfig> {
  const result = await query<{ id: string }>(
    `INSERT INTO work_package_response_configs
       (work_package_id, project_id, organization_id, response_type, title, instructions,
        response_deadline, sections, allow_clarifications, allow_documents,
        documents_required, configured_by)
     VALUES ($1, $2, $3, $4::work_package_response_type, $5, $6, $7::date, $8::jsonb,
             $9, $10, $11, $12)
     ON CONFLICT (work_package_id) DO UPDATE
       SET response_type        = EXCLUDED.response_type,
           title                = EXCLUDED.title,
           instructions         = EXCLUDED.instructions,
           response_deadline    = EXCLUDED.response_deadline,
           sections             = EXCLUDED.sections,
           allow_clarifications = EXCLUDED.allow_clarifications,
           allow_documents      = EXCLUDED.allow_documents,
           documents_required   = EXCLUDED.documents_required,
           updated_at           = now()
     RETURNING id`,
    [
      input.workPackageId,
      input.projectId,
      input.organizationId,
      input.responseType,
      input.title,
      input.instructions,
      input.responseDeadline,
      JSON.stringify(input.sections),
      input.allowClarifications,
      input.allowDocuments,
      input.documentsRequired,
      input.configuredBy,
    ],
  );

  const id = result.rows[0]?.id;
  if (id === undefined) {
    throw new Error("The response configuration could not be saved.");
  }

  const config = await findConfigById(id);
  if (config === undefined) {
    throw new Error("The response configuration could not be read back after it was saved.");
  }

  return config;
}

/**
 * Opens the configuration to the invited suppliers.
 *
 * A conditional UPDATE on `status = 'DRAFT'`, so opening is single-shot: a
 * second request changes nothing rather than re-stamping `opened_at` and
 * re-notifying every supplier.
 */
export async function openConfig(input: {
  workPackageId: string;
  organizationId: string;
  openedBy: string;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_response_configs
     SET status = 'OPEN', opened_by = $3, opened_at = now(), updated_at = now()
     WHERE work_package_id = $1 AND organization_id = $2 AND status = 'DRAFT'
     RETURNING id`,
    [input.workPackageId, input.organizationId, input.openedBy],
  );

  return result.rows.length > 0;
}

export async function closeConfig(input: {
  workPackageId: string;
  organizationId: string;
  closedBy: string;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_response_configs
     SET status = 'CLOSED', closed_by = $3, closed_at = now(), updated_at = now()
     WHERE work_package_id = $1 AND organization_id = $2 AND status = 'OPEN'
     RETURNING id`,
    [input.workPackageId, input.organizationId, input.closedBy],
  );

  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Custom questions
// ---------------------------------------------------------------------------

export interface ResponseQuestion {
  id: string;
  configId: string;
  section: string;
  prompt: string;
  helpText: string | null;
  answerType: QuestionType;
  options: string[];
  isRequired: boolean;
  displayOrder: number;
  createdAt: string;
}

interface QuestionRow {
  id: string;
  config_id: string;
  section: string;
  prompt: string;
  help_text: string | null;
  answer_type: QuestionType;
  options: unknown;
  is_required: boolean;
  display_order: number;
  created_at: Date;
}

function toQuestion(row: QuestionRow): ResponseQuestion {
  return {
    id: row.id,
    configId: row.config_id,
    section: row.section,
    prompt: row.prompt,
    helpText: row.help_text,
    answerType: row.answer_type,
    options: Array.isArray(row.options)
      ? row.options.filter((option): option is string => typeof option === "string")
      : [],
    isRequired: row.is_required,
    displayOrder: row.display_order,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listQuestions(configId: string): Promise<ResponseQuestion[]> {
  const result = await query<QuestionRow>(
    `SELECT id, config_id, section, prompt, help_text, answer_type, options,
            is_required, display_order, created_at
     FROM work_package_response_questions
     WHERE config_id = $1
     ORDER BY display_order ASC, created_at ASC`,
    [configId],
  );

  return result.rows.map(toQuestion);
}

export async function createQuestion(input: {
  configId: string;
  section: string;
  prompt: string;
  helpText: string | null;
  answerType: QuestionType;
  options: string[];
  isRequired: boolean;
  createdBy: string;
}): Promise<ResponseQuestion> {
  // Appended, so a new question does not renumber the ones suppliers may
  // already have answered.
  const next = await query<{ next: number }>(
    `SELECT COALESCE(MAX(display_order), 0) + 1 AS next
     FROM work_package_response_questions WHERE config_id = $1`,
    [input.configId],
  );

  const result = await query<QuestionRow>(
    `INSERT INTO work_package_response_questions
       (config_id, section, prompt, help_text, answer_type, options, is_required,
        display_order, created_by)
     VALUES ($1, $2, $3, $4, $5::work_package_response_question_type, $6::jsonb, $7, $8, $9)
     RETURNING id, config_id, section, prompt, help_text, answer_type, options,
               is_required, display_order, created_at`,
    [
      input.configId,
      input.section,
      input.prompt,
      input.helpText,
      input.answerType,
      JSON.stringify(input.options),
      input.isRequired,
      next.rows[0]?.next ?? 1,
      input.createdBy,
    ],
  );

  const row = result.rows[0];
  if (row === undefined) throw new Error("The question could not be saved.");
  return toQuestion(row);
}

/**
 * The config id is part of the predicate rather than checked beforehand, so a
 * question belonging to another work package's configuration is simply not
 * found. Its answers go with it through the cascade.
 */
export async function deleteQuestion(configId: string, questionId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `DELETE FROM work_package_response_questions
     WHERE id = $1 AND config_id = $2
     RETURNING id`,
    [questionId, configId],
  );

  return result.rows.length > 0;
}

/**
 * Whether any supplier has already submitted against this configuration.
 *
 * The guard on changing what is being asked for. Adding a mandatory question
 * after a supplier has submitted would retrospectively make its response
 * incomplete, and removing one would discard an answer it gave; neither is a
 * configuration change, both are a change of the terms mid-competition.
 */
export async function hasSubmittedResponses(configId: string): Promise<boolean> {
  const result = await query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM work_package_responses
       WHERE config_id = $1 AND status <> 'DRAFT' AND status <> 'WITHDRAWN'
     ) AS present`,
    [configId],
  );

  return result.rows[0]?.present === true;
}
