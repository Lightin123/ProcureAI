/**
 * Storage for Milestone 9 — evaluation criteria, evaluation runs, AI advisory
 * analyses and the human decision.
 *
 * Government-side only. There is no vendor-facing function in this file and no
 * vendor-facing route reaches it: a supplier is never shown a score, a rank, a
 * criterion, another supplier's submission or the department's decision
 * reasoning. That is the structural half of the rule (D76, D85) — a query that
 * never had the columns cannot leak them.
 *
 * Every function takes the organization from the caller and applies it in SQL.
 * A work package id, a response id or a run id arriving from the browser is
 * never sufficient on its own.
 *
 * Two invariants the writes here exist to hold:
 *
 *  - **Runs accumulate; they never overwrite.** Re-evaluating after a
 *    resubmission adds a run. The one an official may already have cited stays
 *    exactly as it was, with the criteria it used.
 *  - **Decisions are immutable.** A correction is a revocation plus a new
 *    decision, never an UPDATE of the reason somebody first gave.
 */

import { query, withTransaction } from "../db/pool.js";
import type {
  CriterionDirection,
  CriterionType,
  EvaluationCriterion,
} from "../evaluation/criteria.js";
import type { ResponseStatus, ResponseType } from "../responses/schema.js";
import { dayHasPassed, toIsoDay } from "./dates.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type EvaluationConfigStatus = "DRAFT" | "READY";

export interface EvaluationConfig {
  id: string;
  workPackageId: string;
  projectId: string;
  organizationId: string;
  status: EvaluationConfigStatus;
  criteriaVersion: number;
  title: string | null;
  notes: string | null;
  configuredByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  criteria: EvaluationCriterion[];
}

interface ConfigRow {
  id: string;
  work_package_id: string;
  project_id: string;
  organization_id: string;
  status: EvaluationConfigStatus;
  criteria_version: number;
  title: string | null;
  notes: string | null;
  configured_by_name: string;
  updated_by_name: string;
  created_at: Date;
  updated_at: Date;
}

interface CriterionRow {
  id: string;
  criterion_key: string;
  criterion_type: CriterionType;
  direction: CriterionDirection;
  label: string;
  description: string | null;
  weight: number;
  target_value: string | null;
  question_id: string | null;
  display_order: number;
}

function toCriterion(row: CriterionRow): EvaluationCriterion {
  const target = row.target_value === null ? null : Number.parseFloat(row.target_value);

  return {
    id: row.id,
    criterionKey: row.criterion_key,
    criterionType: row.criterion_type,
    direction: row.direction,
    label: row.label,
    description: row.description,
    weight: row.weight,
    targetValue: target === null || !Number.isFinite(target) ? null : target,
    questionId: row.question_id,
    displayOrder: row.display_order,
  };
}

async function loadCriteria(configId: string): Promise<EvaluationCriterion[]> {
  const result = await query<CriterionRow>(
    `SELECT id, criterion_key, criterion_type::text, direction::text, label, description,
            weight, target_value::text, question_id, display_order
     FROM work_package_evaluation_criteria
     WHERE config_id = $1
     ORDER BY display_order, created_at`,
    [configId],
  );

  return result.rows.map(toCriterion);
}

export async function findEvaluationConfig(
  workPackageId: string,
  organizationId: string,
): Promise<EvaluationConfig | undefined> {
  const result = await query<ConfigRow>(
    `SELECT c.id, c.work_package_id, c.project_id, c.organization_id, c.status::text,
            c.criteria_version, c.title, c.notes,
            configurer.full_name AS configured_by_name,
            updater.full_name AS updated_by_name,
            c.created_at, c.updated_at
     FROM work_package_evaluation_configs c
     JOIN users configurer ON configurer.id = c.configured_by
     JOIN users updater ON updater.id = c.updated_by
     WHERE c.work_package_id = $1 AND c.organization_id = $2`,
    [workPackageId, organizationId],
  );

  const row = result.rows[0];
  if (row === undefined) return undefined;

  return {
    id: row.id,
    workPackageId: row.work_package_id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    status: row.status,
    criteriaVersion: row.criteria_version,
    title: row.title,
    notes: row.notes,
    configuredByName: row.configured_by_name,
    updatedByName: row.updated_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    criteria: await loadCriteria(row.id),
  };
}

export interface CriterionWrite {
  criterionKey: string;
  criterionType: CriterionType;
  direction: CriterionDirection;
  label: string;
  description: string | null;
  weight: number;
  targetValue: number | null;
  questionId: string | null;
}

/**
 * Creates or replaces the criteria for one work package.
 *
 * The criteria are deleted and rewritten inside one transaction rather than
 * diffed: a criteria set is a single artefact and a half-applied edit would
 * leave weights that do not add up. Nothing that has already been *run* is
 * touched — every run carries its own frozen copy, which is what makes
 * rewriting the live set safe (D87).
 */
export async function saveEvaluationConfig(input: {
  workPackageId: string;
  projectId: string;
  organizationId: string;
  status: EvaluationConfigStatus;
  title: string | null;
  notes: string | null;
  criteria: readonly CriterionWrite[];
  userId: string;
}): Promise<EvaluationConfig> {
  await withTransaction(async (execute) => {
    const config = await execute<{ id: string }>(
      `INSERT INTO work_package_evaluation_configs
         (work_package_id, project_id, organization_id, status, title, notes,
          configured_by, updated_by)
       VALUES ($1, $2, $3, $4::evaluation_config_status, $5, $6, $7, $7)
       ON CONFLICT (work_package_id) DO UPDATE
         SET status = EXCLUDED.status,
             title = EXCLUDED.title,
             notes = EXCLUDED.notes,
             updated_by = EXCLUDED.updated_by,
             criteria_version = work_package_evaluation_configs.criteria_version + 1,
             updated_at = now()
       RETURNING id`,
      [
        input.workPackageId,
        input.projectId,
        input.organizationId,
        input.status,
        input.title,
        input.notes,
        input.userId,
      ],
    );

    const configId = config.rows[0]?.id;
    if (configId === undefined) throw new Error("The evaluation configuration could not be saved.");

    await execute(`DELETE FROM work_package_evaluation_criteria WHERE config_id = $1`, [configId]);

    for (const [index, criterion] of input.criteria.entries()) {
      await execute(
        `INSERT INTO work_package_evaluation_criteria
           (config_id, criterion_key, criterion_type, direction, label, description,
            weight, target_value, question_id, display_order)
         VALUES ($1, $2, $3::evaluation_criterion_type, $4::evaluation_criterion_direction,
                 $5, $6, $7, $8, $9, $10)`,
        [
          configId,
          criterion.criterionKey,
          criterion.criterionType,
          criterion.direction,
          criterion.label,
          criterion.description,
          criterion.weight,
          criterion.targetValue,
          criterion.questionId,
          index,
        ],
      );
    }
  });

  const saved = await findEvaluationConfig(input.workPackageId, input.organizationId);
  if (saved === undefined) throw new Error("The evaluation configuration could not be read back.");
  return saved;
}

/**
 * The custom questions on this work package's response form.
 *
 * Used to check that a criterion's `questionId` belongs to *this* package
 * before it is stored. A question id from the request body is evidence of
 * nothing on its own.
 */
export async function listQuestionIdsForWorkPackage(
  workPackageId: string,
  organizationId: string,
): Promise<Array<{ id: string; prompt: string; answerType: string }>> {
  const result = await query<{ id: string; prompt: string; answer_type: string }>(
    `SELECT q.id, q.prompt, q.answer_type::text
     FROM work_package_response_questions q
     JOIN work_package_response_configs c ON c.id = q.config_id
     WHERE c.work_package_id = $1 AND c.organization_id = $2
     ORDER BY q.display_order, q.created_at`,
    [workPackageId, organizationId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    answerType: row.answer_type,
  }));
}

// ---------------------------------------------------------------------------
// Responses to evaluate
// ---------------------------------------------------------------------------

/**
 * Every response on a work package that carries content, with the values the
 * scorer reads.
 *
 * Drafts are excluded in SQL rather than filtered afterwards: a department
 * cannot read an unsubmitted draft (D83), and an evaluation that scored one
 * would be reading exactly what that rule forbids.
 */
export interface EvaluationInputRow {
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  verificationState: string;
  status: ResponseStatus;
  responseType: ResponseType;
  submittedAt: string | null;
  submissionCount: number;
  documentCount: number;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  values: {
    summary: string | null;
    technicalApproach: string | null;
    technicalStandards: string | null;
    executionPlan: string | null;
    teamComposition: string | null;
    timelineSummary: string | null;
    estimatedDurationWeeks: number | null;
    proposedStartDate: string | null;
    capacityStatement: string | null;
    committedTeamSize: number | null;
    experienceSummary: string | null;
    complianceStatement: string | null;
    complianceConfirmed: boolean;
    commercialSummary: string | null;
    quotedValueInr: number | null;
    priceValidityDays: number | null;
    paymentTerms: string | null;
    taxesIncluded: boolean | null;
  };
}

function toBigIntNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listEvaluationInputs(
  workPackageId: string,
  organizationId: string,
): Promise<EvaluationInputRow[]> {
  const result = await query<{
    id: string;
    vendor_profile_id: string;
    organization_name: string;
    legal_name: string | null;
    verification_state: string;
    status: ResponseStatus;
    response_type: ResponseType;
    submitted_at: Date | null;
    submission_count: number;
    document_count: string;
    response_deadline: Date | null;
    summary: string | null;
    technical_approach: string | null;
    technical_standards: string | null;
    execution_plan: string | null;
    team_composition: string | null;
    timeline_summary: string | null;
    estimated_duration_weeks: number | null;
    proposed_start_date: Date | null;
    capacity_statement: string | null;
    committed_team_size: number | null;
    experience_summary: string | null;
    compliance_statement: string | null;
    compliance_confirmed: boolean;
    commercial_summary: string | null;
    quoted_value_inr: string | null;
    price_validity_days: number | null;
    payment_terms: string | null;
    taxes_included: boolean | null;
  }>(
    `SELECT r.id, r.vendor_profile_id, o.name AS organization_name, p.legal_name,
            p.verification_state, r.status, c.response_type, r.submitted_at,
            r.submission_count, c.response_deadline,
            (SELECT COUNT(*) FROM work_package_response_documents d
              WHERE d.response_id = r.id)::text AS document_count,
            r.summary, r.technical_approach, r.technical_standards, r.execution_plan,
            r.team_composition, r.timeline_summary, r.estimated_duration_weeks,
            r.proposed_start_date, r.capacity_statement, r.committed_team_size,
            r.experience_summary, r.compliance_statement, r.compliance_confirmed,
            r.commercial_summary, r.quoted_value_inr, r.price_validity_days,
            r.payment_terms, r.taxes_included
     FROM work_package_responses r
     JOIN work_package_response_configs c ON c.id = r.config_id
     JOIN vendor_profiles p ON p.id = r.vendor_profile_id
     JOIN organizations o ON o.id = p.organization_id
     WHERE r.work_package_id = $1 AND r.organization_id = $2 AND r.status <> 'DRAFT'
     ORDER BY r.submitted_at NULLS LAST, r.id`,
    [workPackageId, organizationId],
  );

  return result.rows.map((row) => {
    const deadline = toIsoDay(row.response_deadline);

    return {
      responseId: row.id,
      vendorProfileId: row.vendor_profile_id,
      organizationName: row.organization_name,
      legalName: row.legal_name,
      verificationState: row.verification_state,
      status: row.status,
      responseType: row.response_type,
      submittedAt: row.submitted_at?.toISOString() ?? null,
      submissionCount: row.submission_count,
      documentCount: Number.parseInt(row.document_count, 10),
      responseDeadline: deadline,
      deadlinePassed: dayHasPassed(deadline),
      values: {
        summary: row.summary,
        technicalApproach: row.technical_approach,
        technicalStandards: row.technical_standards,
        executionPlan: row.execution_plan,
        teamComposition: row.team_composition,
        timelineSummary: row.timeline_summary,
        estimatedDurationWeeks: row.estimated_duration_weeks,
        proposedStartDate: toIsoDay(row.proposed_start_date),
        capacityStatement: row.capacity_statement,
        committedTeamSize: row.committed_team_size,
        experienceSummary: row.experience_summary,
        complianceStatement: row.compliance_statement,
        complianceConfirmed: row.compliance_confirmed,
        commercialSummary: row.commercial_summary,
        quotedValueInr: toBigIntNumber(row.quoted_value_inr),
        priceValidityDays: row.price_validity_days,
        paymentTerms: row.payment_terms,
        taxesIncluded: row.taxes_included,
      },
    };
  });
}

/** Requirement answers for several responses at once. */
export async function listRequirementAnswersForResponses(
  responseIds: readonly string[],
): Promise<Map<string, Array<{ requirementId: string; compliance: string; answer: string | null; notes: string | null }>>> {
  const grouped = new Map<
    string,
    Array<{ requirementId: string; compliance: string; answer: string | null; notes: string | null }>
  >();
  if (responseIds.length === 0) return grouped;

  const result = await query<{
    response_id: string;
    requirement_id: string;
    compliance: string;
    answer: string | null;
    notes: string | null;
  }>(
    `SELECT response_id, requirement_id, compliance::text, answer, notes
     FROM work_package_response_requirement_answers
     WHERE response_id = ANY($1::uuid[])`,
    [[...responseIds]],
  );

  for (const row of result.rows) {
    const list = grouped.get(row.response_id) ?? [];
    list.push({
      requirementId: row.requirement_id,
      compliance: row.compliance,
      answer: row.answer,
      notes: row.notes,
    });
    grouped.set(row.response_id, list);
  }

  return grouped;
}

/** Custom-question answers for several responses at once. */
export async function listQuestionAnswersForResponses(
  responseIds: readonly string[],
): Promise<Map<string, Map<string, unknown>>> {
  const grouped = new Map<string, Map<string, unknown>>();
  if (responseIds.length === 0) return grouped;

  const result = await query<{ response_id: string; question_id: string; value: unknown }>(
    `SELECT response_id, question_id, value
     FROM work_package_response_question_answers
     WHERE response_id = ANY($1::uuid[])`,
    [[...responseIds]],
  );

  for (const row of result.rows) {
    const map = grouped.get(row.response_id) ?? new Map<string, unknown>();
    map.set(row.question_id, row.value);
    grouped.set(row.response_id, map);
  }

  return grouped;
}

/**
 * The eligibility verdict each supplier received in the most recent matching
 * run for this work package.
 *
 * Read rather than recomputed. Eligibility is Milestone 6's gate and stays
 * Milestone 6's gate — a second implementation here is a rule that can drift
 * from the one that actually excluded people.
 */
export async function findMatchEligibility(
  workPackageId: string,
): Promise<Map<string, { eligible: boolean; rankPosition: number | null; overallScore: number; runAt: string }>> {
  const result = await query<{
    vendor_profile_id: string;
    eligible: boolean;
    rank_position: number | null;
    overall_score: number;
    created_at: Date;
  }>(
    `SELECT res.vendor_profile_id, res.eligible, res.rank_position, res.overall_score,
            run.created_at
     FROM work_package_match_results res
     JOIN work_package_match_runs run ON run.id = res.run_id
     WHERE run.work_package_id = $1
       AND run.id = (
         SELECT id FROM work_package_match_runs
         WHERE work_package_id = $1
         ORDER BY created_at DESC
         LIMIT 1
       )`,
    [workPackageId],
  );

  const map = new Map<
    string,
    { eligible: boolean; rankPosition: number | null; overallScore: number; runAt: string }
  >();

  for (const row of result.rows) {
    map.set(row.vendor_profile_id, {
      eligible: row.eligible,
      rankPosition: row.rank_position,
      overallScore: row.overall_score,
      runAt: row.created_at.toISOString(),
    });
  }

  return map;
}

// ---------------------------------------------------------------------------
// Runs and results
// ---------------------------------------------------------------------------

export interface EvaluationRunSummary {
  id: string;
  workPackageId: string;
  projectId: string;
  configId: string | null;
  scoringVersion: number;
  criteriaVersion: number;
  criteriaSnapshot: EvaluationCriterion[];
  requestSnapshot: Record<string, unknown>;
  evaluatedCount: number;
  rankedCount: number;
  excludedCount: number;
  durationMs: number;
  requestedByName: string;
  createdAt: string;
}

export interface EvaluationResultRow {
  id: string;
  runId: string;
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  ranked: boolean;
  exclusionReason: string | null;
  rankPosition: number | null;
  totalScore: number;
  criterionScores: unknown[];
  compliance: unknown[];
  complianceSummary: Record<string, unknown>;
  missingInformation: unknown[];
  strengths: string[];
  gaps: string[];
  structuredSummary: Record<string, unknown>;
  createdAt: string;
}

const RUN_SELECT = `
  SELECT r.id, r.work_package_id, r.project_id, r.config_id, r.scoring_version,
         r.criteria_version, r.criteria_snapshot, r.request_snapshot,
         r.evaluated_count, r.ranked_count, r.excluded_count, r.duration_ms,
         u.full_name AS requested_by_name, r.created_at
  FROM work_package_evaluation_runs r
  JOIN users u ON u.id = r.requested_by
`;

interface RunRow {
  id: string;
  work_package_id: string;
  project_id: string;
  config_id: string | null;
  scoring_version: number;
  criteria_version: number;
  criteria_snapshot: EvaluationCriterion[] | null;
  request_snapshot: Record<string, unknown> | null;
  evaluated_count: number;
  ranked_count: number;
  excluded_count: number;
  duration_ms: number;
  requested_by_name: string;
  created_at: Date;
}

function toRun(row: RunRow): EvaluationRunSummary {
  return {
    id: row.id,
    workPackageId: row.work_package_id,
    projectId: row.project_id,
    configId: row.config_id,
    scoringVersion: row.scoring_version,
    criteriaVersion: row.criteria_version,
    criteriaSnapshot: row.criteria_snapshot ?? [],
    requestSnapshot: row.request_snapshot ?? {},
    evaluatedCount: row.evaluated_count,
    rankedCount: row.ranked_count,
    excludedCount: row.excluded_count,
    durationMs: row.duration_ms,
    requestedByName: row.requested_by_name,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listEvaluationRuns(
  workPackageId: string,
  organizationId: string,
): Promise<EvaluationRunSummary[]> {
  const result = await query<RunRow>(
    `${RUN_SELECT}
     WHERE r.work_package_id = $1 AND r.organization_id = $2
     ORDER BY r.created_at DESC`,
    [workPackageId, organizationId],
  );

  return result.rows.map(toRun);
}

export async function findEvaluationRun(
  runId: string,
  workPackageId: string,
  organizationId: string,
): Promise<EvaluationRunSummary | undefined> {
  const result = await query<RunRow>(
    `${RUN_SELECT}
     WHERE r.id = $1 AND r.work_package_id = $2 AND r.organization_id = $3`,
    [runId, workPackageId, organizationId],
  );

  const row = result.rows[0];
  return row === undefined ? undefined : toRun(row);
}

export async function findLatestEvaluationRun(
  workPackageId: string,
  organizationId: string,
): Promise<EvaluationRunSummary | undefined> {
  const result = await query<RunRow>(
    `${RUN_SELECT}
     WHERE r.work_package_id = $1 AND r.organization_id = $2
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [workPackageId, organizationId],
  );

  const row = result.rows[0];
  return row === undefined ? undefined : toRun(row);
}

export async function listEvaluationResults(runId: string): Promise<EvaluationResultRow[]> {
  const result = await query<{
    id: string;
    run_id: string;
    response_id: string;
    vendor_profile_id: string;
    organization_name: string;
    legal_name: string | null;
    ranked: boolean;
    exclusion_reason: string | null;
    rank_position: number | null;
    total_score: string;
    criterion_scores: unknown[] | null;
    compliance: unknown[] | null;
    compliance_summary: Record<string, unknown> | null;
    missing_information: unknown[] | null;
    strengths: string[] | null;
    gaps: string[] | null;
    structured_summary: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT res.id, res.run_id, res.response_id, res.vendor_profile_id,
            o.name AS organization_name, p.legal_name,
            res.ranked, res.exclusion_reason, res.rank_position, res.total_score::text,
            res.criterion_scores, res.compliance, res.compliance_summary,
            res.missing_information, res.strengths, res.gaps, res.structured_summary,
            res.created_at
     FROM work_package_evaluation_results res
     JOIN vendor_profiles p ON p.id = res.vendor_profile_id
     JOIN organizations o ON o.id = p.organization_id
     WHERE res.run_id = $1
     ORDER BY res.rank_position NULLS LAST, res.total_score DESC, res.id`,
    [runId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    responseId: row.response_id,
    vendorProfileId: row.vendor_profile_id,
    organizationName: row.organization_name,
    legalName: row.legal_name,
    ranked: row.ranked,
    exclusionReason: row.exclusion_reason,
    rankPosition: row.rank_position,
    totalScore: Number.parseFloat(row.total_score),
    criterionScores: row.criterion_scores ?? [],
    compliance: row.compliance ?? [],
    complianceSummary: row.compliance_summary ?? {},
    missingInformation: row.missing_information ?? [],
    strengths: row.strengths ?? [],
    gaps: row.gaps ?? [],
    structuredSummary: row.structured_summary ?? {},
    createdAt: row.created_at.toISOString(),
  }));
}

export interface EvaluationResultWrite {
  responseId: string;
  vendorProfileId: string;
  ranked: boolean;
  exclusionReason: string | null;
  rankPosition: number | null;
  totalScore: number;
  criterionScores: unknown;
  compliance: unknown;
  complianceSummary: unknown;
  missingInformation: unknown;
  strengths: readonly string[];
  gaps: readonly string[];
  structuredSummary: unknown;
}

/**
 * Persists one evaluation run and every result in it, in one transaction.
 *
 * Excluded responses are stored alongside ranked ones, with the reason they
 * were left out. A department is entitled to ask which submissions were not
 * assessed and why, and dropping them silently would make that unanswerable —
 * the rule D68 established for the matching gate.
 */
export async function recordEvaluationRun(input: {
  workPackageId: string;
  projectId: string;
  organizationId: string;
  configId: string;
  scoringVersion: number;
  criteriaVersion: number;
  criteriaSnapshot: unknown;
  requestSnapshot: unknown;
  durationMs: number;
  requestedBy: string;
  results: readonly EvaluationResultWrite[];
}): Promise<string> {
  return withTransaction(async (execute) => {
    const ranked = input.results.filter((result) => result.ranked).length;

    const run = await execute<{ id: string }>(
      `INSERT INTO work_package_evaluation_runs
         (work_package_id, project_id, organization_id, config_id, scoring_version,
          criteria_version, criteria_snapshot, request_snapshot, evaluated_count,
          ranked_count, excluded_count, duration_ms, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        input.workPackageId,
        input.projectId,
        input.organizationId,
        input.configId,
        input.scoringVersion,
        input.criteriaVersion,
        JSON.stringify(input.criteriaSnapshot),
        JSON.stringify(input.requestSnapshot),
        input.results.length,
        ranked,
        input.results.length - ranked,
        input.durationMs,
        input.requestedBy,
      ],
    );

    const runId = run.rows[0]?.id;
    if (runId === undefined) throw new Error("The evaluation run could not be recorded.");

    for (const result of input.results) {
      await execute(
        `INSERT INTO work_package_evaluation_results
           (run_id, response_id, work_package_id, vendor_profile_id, ranked,
            exclusion_reason, rank_position, total_score, criterion_scores, compliance,
            compliance_summary, missing_information, strengths, gaps, structured_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
                 $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb)`,
        [
          runId,
          result.responseId,
          input.workPackageId,
          result.vendorProfileId,
          result.ranked,
          result.exclusionReason,
          result.rankPosition,
          result.totalScore,
          JSON.stringify(result.criterionScores),
          JSON.stringify(result.compliance),
          JSON.stringify(result.complianceSummary),
          JSON.stringify(result.missingInformation),
          JSON.stringify(result.strengths),
          JSON.stringify(result.gaps),
          JSON.stringify(result.structuredSummary),
        ],
      );
    }

    return runId;
  });
}

// ---------------------------------------------------------------------------
// AI advisory analyses
// ---------------------------------------------------------------------------

export interface AiAnalysisInsight {
  title: string;
  detail: string;
}

export interface AiAnalysisEvidence {
  section: string;
  quote: string;
}

export interface StoredAiAnalysis {
  id: string;
  responseId: string;
  vendorProfileId: string;
  evaluationRunId: string | null;
  summary: string;
  technicalFit: string | null;
  experienceRelevance: string | null;
  strengths: AiAnalysisInsight[];
  weaknesses: AiAnalysisInsight[];
  attentionPoints: AiAnalysisInsight[];
  evidence: AiAnalysisEvidence[];
  provider: string;
  model: string;
  promptVersion: string;
  responseTimeMs: number;
  generatedByName: string;
  createdAt: string;
}

interface AnalysisRow {
  id: string;
  response_id: string;
  vendor_profile_id: string;
  evaluation_run_id: string | null;
  summary: string;
  technical_fit: string | null;
  experience_relevance: string | null;
  strengths: AiAnalysisInsight[] | null;
  weaknesses: AiAnalysisInsight[] | null;
  attention_points: AiAnalysisInsight[] | null;
  evidence: AiAnalysisEvidence[] | null;
  provider: string;
  model: string;
  prompt_version: string;
  response_time_ms: number;
  generated_by_name: string;
  created_at: Date;
}

const ANALYSIS_SELECT = `
  SELECT a.id, a.response_id, a.vendor_profile_id, a.evaluation_run_id, a.summary,
         a.technical_fit, a.experience_relevance, a.strengths, a.weaknesses,
         a.attention_points, a.evidence, a.provider, a.model, a.prompt_version,
         a.response_time_ms, u.full_name AS generated_by_name, a.created_at
  FROM work_package_response_ai_analyses a
  JOIN users u ON u.id = a.generated_by
`;

function toAnalysis(row: AnalysisRow): StoredAiAnalysis {
  return {
    id: row.id,
    responseId: row.response_id,
    vendorProfileId: row.vendor_profile_id,
    evaluationRunId: row.evaluation_run_id,
    summary: row.summary,
    technicalFit: row.technical_fit,
    experienceRelevance: row.experience_relevance,
    strengths: row.strengths ?? [],
    weaknesses: row.weaknesses ?? [],
    attentionPoints: row.attention_points ?? [],
    evidence: row.evidence ?? [],
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    responseTimeMs: row.response_time_ms,
    generatedByName: row.generated_by_name,
    createdAt: row.created_at.toISOString(),
  };
}

export async function recordAiAnalysis(input: {
  responseId: string;
  workPackageId: string;
  organizationId: string;
  vendorProfileId: string;
  evaluationRunId: string | null;
  summary: string;
  technicalFit: string | null;
  experienceRelevance: string | null;
  strengths: readonly AiAnalysisInsight[];
  weaknesses: readonly AiAnalysisInsight[];
  attentionPoints: readonly AiAnalysisInsight[];
  evidence: readonly AiAnalysisEvidence[];
  provider: string;
  model: string;
  promptVersion: string;
  responseTimeMs: number;
  generatedBy: string;
}): Promise<StoredAiAnalysis> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO work_package_response_ai_analyses
       (response_id, work_package_id, organization_id, vendor_profile_id, evaluation_run_id,
        summary, technical_fit, experience_relevance, strengths, weaknesses,
        attention_points, evidence, provider, model, prompt_version, response_time_ms,
        generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb,
             $13, $14, $15, $16, $17)
     RETURNING id`,
    [
      input.responseId,
      input.workPackageId,
      input.organizationId,
      input.vendorProfileId,
      input.evaluationRunId,
      input.summary,
      input.technicalFit,
      input.experienceRelevance,
      JSON.stringify(input.strengths),
      JSON.stringify(input.weaknesses),
      JSON.stringify(input.attentionPoints),
      JSON.stringify(input.evidence),
      input.provider,
      input.model,
      input.promptVersion,
      input.responseTimeMs,
      input.generatedBy,
    ],
  );

  const id = inserted.rows[0]?.id;
  if (id === undefined) throw new Error("The AI analysis could not be recorded.");

  const result = await query<AnalysisRow>(`${ANALYSIS_SELECT} WHERE a.id = $1`, [id]);
  const row = result.rows[0];
  if (row === undefined) throw new Error("The AI analysis could not be read back.");
  return toAnalysis(row);
}

/** Every analysis generated for one response, newest first. Append-only. */
export async function listAiAnalyses(
  responseId: string,
  organizationId: string,
): Promise<StoredAiAnalysis[]> {
  const result = await query<AnalysisRow>(
    `${ANALYSIS_SELECT}
     WHERE a.response_id = $1 AND a.organization_id = $2
     ORDER BY a.created_at DESC`,
    [responseId, organizationId],
  );

  return result.rows.map(toAnalysis);
}

/** The latest analysis for every response on a work package, for the comparison. */
export async function latestAiAnalysesForWorkPackage(
  workPackageId: string,
  organizationId: string,
): Promise<Map<string, StoredAiAnalysis>> {
  const result = await query<AnalysisRow>(
    `${ANALYSIS_SELECT}
     WHERE a.work_package_id = $1 AND a.organization_id = $2
       AND a.id = (
         SELECT inner_a.id FROM work_package_response_ai_analyses inner_a
         WHERE inner_a.response_id = a.response_id
         ORDER BY inner_a.created_at DESC
         LIMIT 1
       )`,
    [workPackageId, organizationId],
  );

  const map = new Map<string, StoredAiAnalysis>();
  for (const row of result.rows) map.set(row.response_id, toAnalysis(row));
  return map;
}

// ---------------------------------------------------------------------------
// The human decision
// ---------------------------------------------------------------------------

export type DecisionType = "SELECTED" | "REJECTED";
export type DecisionStatus = "ACTIVE" | "REVOKED";

export interface ProcurementDecision {
  id: string;
  workPackageId: string;
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  decision: DecisionType;
  status: DecisionStatus;
  reason: string;
  evaluationRunId: string | null;
  rankAtDecision: number | null;
  scoreAtDecision: number | null;
  decidedByName: string;
  decidedAt: string;
  revokedByName: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

interface DecisionRow {
  id: string;
  work_package_id: string;
  response_id: string;
  vendor_profile_id: string;
  organization_name: string;
  legal_name: string | null;
  decision: DecisionType;
  status: DecisionStatus;
  reason: string;
  evaluation_run_id: string | null;
  rank_at_decision: number | null;
  score_at_decision: string | null;
  decided_by_name: string;
  decided_at: Date;
  revoked_by_name: string | null;
  revoked_at: Date | null;
  revocation_reason: string | null;
}

const DECISION_SELECT = `
  SELECT d.id, d.work_package_id, d.response_id, d.vendor_profile_id,
         o.name AS organization_name, p.legal_name, d.decision::text, d.status::text,
         d.reason, d.evaluation_run_id, d.rank_at_decision, d.score_at_decision::text,
         decider.full_name AS decided_by_name, d.decided_at,
         revoker.full_name AS revoked_by_name, d.revoked_at, d.revocation_reason
  FROM work_package_response_decisions d
  JOIN vendor_profiles p ON p.id = d.vendor_profile_id
  JOIN organizations o ON o.id = p.organization_id
  JOIN users decider ON decider.id = d.decided_by
  LEFT JOIN users revoker ON revoker.id = d.revoked_by
`;

function toDecision(row: DecisionRow): ProcurementDecision {
  const score = row.score_at_decision === null ? null : Number.parseFloat(row.score_at_decision);

  return {
    id: row.id,
    workPackageId: row.work_package_id,
    responseId: row.response_id,
    vendorProfileId: row.vendor_profile_id,
    organizationName: row.organization_name,
    legalName: row.legal_name,
    decision: row.decision,
    status: row.status,
    reason: row.reason,
    evaluationRunId: row.evaluation_run_id,
    rankAtDecision: row.rank_at_decision,
    scoreAtDecision: score === null || !Number.isFinite(score) ? null : score,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at.toISOString(),
    revokedByName: row.revoked_by_name,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    revocationReason: row.revocation_reason,
  };
}

export async function listDecisions(
  workPackageId: string,
  organizationId: string,
): Promise<ProcurementDecision[]> {
  const result = await query<DecisionRow>(
    `${DECISION_SELECT}
     WHERE d.work_package_id = $1 AND d.organization_id = $2
     ORDER BY d.decided_at DESC`,
    [workPackageId, organizationId],
  );

  return result.rows.map(toDecision);
}

export type DecisionRefusal =
  | "ALREADY_DECIDED"
  | "SELECTION_EXISTS"
  | "RESPONSE_NOT_FOUND";

/**
 * Records one human decision.
 *
 * The rank and the score are read out of the stored run inside this function
 * rather than accepted from the caller, so a decision can never assert a
 * position the system did not produce — the rule D69 set for shortlists,
 * applied to the decision that matters most.
 *
 * The two unique indexes do the refusing: one live decision per response, one
 * live selection per work package. Catching the violation rather than checking
 * first is what makes the write single-shot.
 */
export async function recordDecision(input: {
  workPackageId: string;
  projectId: string;
  organizationId: string;
  responseId: string;
  decision: DecisionType;
  reason: string;
  evaluationRunId: string | null;
  decidedBy: string;
}): Promise<{ decision: ProcurementDecision } | { refusal: DecisionRefusal }> {
  const response = await query<{ vendor_profile_id: string }>(
    `SELECT vendor_profile_id
     FROM work_package_responses
     WHERE id = $1 AND work_package_id = $2 AND organization_id = $3 AND status <> 'DRAFT'`,
    [input.responseId, input.workPackageId, input.organizationId],
  );

  const vendorProfileId = response.rows[0]?.vendor_profile_id;
  if (vendorProfileId === undefined) return { refusal: "RESPONSE_NOT_FOUND" };

  let rankAtDecision: number | null = null;
  let scoreAtDecision: number | null = null;

  if (input.evaluationRunId !== null) {
    const stored = await query<{ rank_position: number | null; total_score: string }>(
      `SELECT res.rank_position, res.total_score::text
       FROM work_package_evaluation_results res
       JOIN work_package_evaluation_runs run ON run.id = res.run_id
       WHERE res.run_id = $1 AND res.response_id = $2 AND run.organization_id = $3`,
      [input.evaluationRunId, input.responseId, input.organizationId],
    );

    const row = stored.rows[0];
    if (row !== undefined) {
      rankAtDecision = row.rank_position;
      const parsed = Number.parseFloat(row.total_score);
      scoreAtDecision = Number.isFinite(parsed) ? parsed : null;
    }
  }

  let insertedId: string;

  try {
    const inserted = await query<{ id: string }>(
      `INSERT INTO work_package_response_decisions
         (work_package_id, project_id, organization_id, response_id, vendor_profile_id,
          decision, reason, evaluation_run_id, rank_at_decision, score_at_decision, decided_by)
       VALUES ($1, $2, $3, $4, $5, $6::procurement_decision_type, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        input.workPackageId,
        input.projectId,
        input.organizationId,
        input.responseId,
        vendorProfileId,
        input.decision,
        input.reason,
        input.evaluationRunId,
        rankAtDecision,
        scoreAtDecision,
        input.decidedBy,
      ],
    );

    const id = inserted.rows[0]?.id;
    if (id === undefined) throw new Error("The decision could not be recorded.");
    insertedId = id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("work_package_response_decisions_one_selection")) {
      return { refusal: "SELECTION_EXISTS" };
    }
    if (message.includes("work_package_response_decisions_live_unique")) {
      return { refusal: "ALREADY_DECIDED" };
    }
    throw error;
  }

  const result = await query<DecisionRow>(`${DECISION_SELECT} WHERE d.id = $1`, [insertedId]);
  const row = result.rows[0];
  if (row === undefined) throw new Error("The decision could not be read back.");
  return { decision: toDecision(row) };
}

/**
 * Revokes a live decision.
 *
 * A conditional UPDATE carrying the ownership predicate and the permitted
 * source state, so revoking is single-shot and cannot be applied twice — the
 * pattern every transition in Milestones 7 and 8 follows (D75, D81). The
 * original reason is untouched: what the department first decided stays on the
 * record.
 */
export async function revokeDecision(input: {
  decisionId: string;
  workPackageId: string;
  organizationId: string;
  revocationReason: string;
  revokedBy: string;
}): Promise<ProcurementDecision | undefined> {
  const updated = await query<{ id: string }>(
    `UPDATE work_package_response_decisions
     SET status = 'REVOKED', revoked_by = $4, revoked_at = now(), revocation_reason = $5
     WHERE id = $1 AND work_package_id = $2 AND organization_id = $3 AND status = 'ACTIVE'
     RETURNING id`,
    [
      input.decisionId,
      input.workPackageId,
      input.organizationId,
      input.revokedBy,
      input.revocationReason,
    ],
  );

  if (updated.rows[0] === undefined) return undefined;

  const result = await query<DecisionRow>(`${DECISION_SELECT} WHERE d.id = $1`, [
    input.decisionId,
  ]);
  const row = result.rows[0];
  return row === undefined ? undefined : toDecision(row);
}
