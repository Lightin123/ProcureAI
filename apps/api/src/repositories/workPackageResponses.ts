/**
 * Vendor responses — the Milestone 8 collection step.
 *
 * The same rule Milestone 7 established for invitations applies here and is the
 * reason this file is arranged the way it is (D76): the two sides read this
 * table through different functions, never through one function with a flag.
 *
 *  - The government side reads every response on one of its own work packages,
 *    sees which supplier wrote each, and can move it through review.
 *  - The vendor side reads only its own response, applies `vendorProfileId` in
 *    the WHERE clause of every statement, and is never told which official is
 *    reviewing it or that any other supplier responded at all.
 *
 * Every state transition is a conditional UPDATE carrying both the ownership
 * predicate and the permitted source states, so a transition is single-shot and
 * ownership-safe in one statement — there is no window in which a response is
 * verified as one supplier's and written as another's (D75).
 */

import { query } from "../db/pool.js";
import { RESPONSE_FIELDS, type ResponseStatus, type ResponseType } from "../responses/schema.js";
import { dayHasPassed, toIsoDay } from "./dates.js";

/** The editable body of a response, keyed as the catalogue declares. */
export type ResponseValues = Record<string, string | number | boolean | null>;

export interface ResponseBody {
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
}

interface BodyRow {
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
  quoted_value_inr: string | number | null;
  price_validity_days: number | null;
  payment_terms: string | null;
  taxes_included: boolean | null;
}

/** `bigint` arrives as a string from node-postgres; nothing else needs coercing. */
function toBigIntNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBody(row: BodyRow): ResponseBody {
  return {
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
  };
}

const BODY_COLUMNS = `
  r.summary, r.technical_approach, r.technical_standards, r.execution_plan,
  r.team_composition, r.timeline_summary, r.estimated_duration_weeks,
  r.proposed_start_date, r.capacity_statement, r.committed_team_size,
  r.experience_summary, r.compliance_statement, r.compliance_confirmed,
  r.commercial_summary, r.quoted_value_inr, r.price_validity_days,
  r.payment_terms, r.taxes_included
`;

// ---------------------------------------------------------------------------
// Government side
// ---------------------------------------------------------------------------

/** One row of the department's response workspace. */
export interface GovernmentResponseSummary {
  id: string;
  workPackageId: string;
  projectId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  verificationState: string;
  responseType: ResponseType;
  status: ResponseStatus;
  submittedAt: string | null;
  submittedByName: string | null;
  submissionCount: number;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  openClarifications: number;
  documentCount: number;
  updatedAt: string;
}

interface GovernmentSummaryRow {
  id: string;
  work_package_id: string;
  project_id: string;
  vendor_profile_id: string;
  organization_name: string;
  legal_name: string | null;
  verification_state: string;
  response_type: ResponseType;
  status: ResponseStatus;
  submitted_at: Date | null;
  submitted_by_name: string | null;
  submission_count: number;
  response_deadline: Date | null;
  open_clarifications: string;
  document_count: string;
  updated_at: Date;
}

const GOVERNMENT_SUMMARY_SELECT = `
  SELECT r.id, r.work_package_id, r.project_id, r.vendor_profile_id,
         o.name AS organization_name, p.legal_name, p.verification_state,
         c.response_type, r.status, r.submitted_at,
         submitter.full_name AS submitted_by_name, r.submission_count,
         c.response_deadline, r.updated_at,
         (SELECT COUNT(*) FROM work_package_response_clarifications cl
           WHERE cl.response_id = r.id AND cl.status = 'OPEN')::text AS open_clarifications,
         (SELECT COUNT(*) FROM work_package_response_documents d
           WHERE d.response_id = r.id)::text AS document_count
  FROM work_package_responses r
  JOIN work_package_response_configs c ON c.id = r.config_id
  JOIN vendor_profiles p ON p.id = r.vendor_profile_id
  JOIN organizations o ON o.id = p.organization_id
  LEFT JOIN users submitter ON submitter.id = r.submitted_by
`;

function toGovernmentSummary(row: GovernmentSummaryRow): GovernmentResponseSummary {
  const responseDeadline = toIsoDay(row.response_deadline);

  return {
    id: row.id,
    workPackageId: row.work_package_id,
    projectId: row.project_id,
    vendorProfileId: row.vendor_profile_id,
    organizationName: row.organization_name,
    legalName: row.legal_name,
    verificationState: row.verification_state,
    responseType: row.response_type,
    status: row.status,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    submittedByName: row.submitted_by_name,
    submissionCount: row.submission_count,
    responseDeadline,
    deadlinePassed: dayHasPassed(responseDeadline),
    openClarifications: Number.parseInt(row.open_clarifications, 10),
    documentCount: Number.parseInt(row.document_count, 10),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Every response on one work package.
 *
 * Drafts a supplier has opened but not submitted are included, deliberately: an
 * official tracking a deadline needs to know the difference between a supplier
 * that has started and one that has not, and hiding drafts would make those two
 * look identical. What the official does not see is any of a draft's content —
 * that is served only by the detail read, and only once submitted.
 */
export async function listResponsesForWorkPackage(
  workPackageId: string,
): Promise<GovernmentResponseSummary[]> {
  const result = await query<GovernmentSummaryRow>(
    `${GOVERNMENT_SUMMARY_SELECT}
     WHERE r.work_package_id = $1
     ORDER BY r.updated_at DESC`,
    [workPackageId],
  );

  return result.rows.map(toGovernmentSummary);
}

export interface GovernmentResponseDetail extends GovernmentResponseSummary {
  configId: string;
  invitationId: string;
  body: ResponseBody;
  reviewStartedAt: string | null;
  reviewStartedByName: string | null;
  readiedAt: string | null;
  readiedByName: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  createdAt: string;
}

/**
 * One response, scoped to the caller's department.
 *
 * The organization is applied in SQL, so a response belonging to another
 * department reads as absent rather than as forbidden — the 404-not-403 rule
 * the rest of the API follows.
 */
export async function findGovernmentResponse(
  responseId: string,
  organizationId: string,
): Promise<GovernmentResponseDetail | undefined> {
  const result = await query<
    GovernmentSummaryRow &
      BodyRow & {
        config_id: string;
        invitation_id: string;
        review_started_at: Date | null;
        review_started_by_name: string | null;
        readied_at: Date | null;
        readied_by_name: string | null;
        withdrawn_at: Date | null;
        withdrawal_reason: string | null;
        created_at: Date;
      }
  >(
    `SELECT r.id, r.work_package_id, r.project_id, r.vendor_profile_id,
            o.name AS organization_name, p.legal_name, p.verification_state,
            c.response_type, r.status, r.submitted_at,
            submitter.full_name AS submitted_by_name, r.submission_count,
            c.response_deadline, r.updated_at, r.created_at,
            r.config_id, r.invitation_id,
            r.review_started_at, reviewer.full_name AS review_started_by_name,
            r.readied_at, readier.full_name AS readied_by_name,
            r.withdrawn_at, r.withdrawal_reason,
            (SELECT COUNT(*) FROM work_package_response_clarifications cl
              WHERE cl.response_id = r.id AND cl.status = 'OPEN')::text AS open_clarifications,
            (SELECT COUNT(*) FROM work_package_response_documents d
              WHERE d.response_id = r.id)::text AS document_count,
            ${BODY_COLUMNS}
     FROM work_package_responses r
     JOIN work_package_response_configs c ON c.id = r.config_id
     JOIN vendor_profiles p ON p.id = r.vendor_profile_id
     JOIN organizations o ON o.id = p.organization_id
     LEFT JOIN users submitter ON submitter.id = r.submitted_by
     LEFT JOIN users reviewer ON reviewer.id = r.review_started_by
     LEFT JOIN users readier ON readier.id = r.readied_by
     WHERE r.id = $1 AND r.organization_id = $2`,
    [responseId, organizationId],
  );

  const row = result.rows[0];
  if (row === undefined) return undefined;

  return {
    ...toGovernmentSummary(row),
    configId: row.config_id,
    invitationId: row.invitation_id,
    body: toBody(row),
    reviewStartedAt: row.review_started_at?.toISOString() ?? null,
    reviewStartedByName: row.review_started_by_name,
    readiedAt: row.readied_at?.toISOString() ?? null,
    readiedByName: row.readied_by_name,
    withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
    withdrawalReason: row.withdrawal_reason,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * SUBMITTED | RESUBMITTED -> UNDER_REVIEW.
 *
 * `review_started_at` is stamped only on the first opening, so the record shows
 * when the department began looking rather than when it last refreshed a page.
 */
export async function startReview(input: {
  responseId: string;
  organizationId: string;
  reviewedBy: string;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_responses
     SET status = 'UNDER_REVIEW',
         review_started_at = COALESCE(review_started_at, now()),
         review_started_by = COALESCE(review_started_by, $3),
         updated_at = now()
     WHERE id = $1 AND organization_id = $2 AND status IN ('SUBMITTED', 'RESUBMITTED')
     RETURNING id`,
    [input.responseId, input.organizationId, input.reviewedBy],
  );

  return result.rows.length > 0;
}

/**
 * UNDER_REVIEW -> READY_FOR_EVALUATION.
 *
 * The terminal state of Milestone 8 and the starting point of Milestone 9. It
 * records that the department considers the response complete enough to be
 * evaluated; it is not itself an evaluation, a score or a selection.
 */
export async function markReadyForEvaluation(input: {
  responseId: string;
  organizationId: string;
  readiedBy: string;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_responses
     SET status = 'READY_FOR_EVALUATION', readied_by = $3, readied_at = now(), updated_at = now()
     WHERE id = $1 AND organization_id = $2 AND status = 'UNDER_REVIEW'
     RETURNING id`,
    [input.responseId, input.organizationId, input.readiedBy],
  );

  return result.rows.length > 0;
}

/**
 * SUBMITTED | UNDER_REVIEW | RESUBMITTED -> CLARIFICATION_REQUESTED.
 *
 * Called by the clarification route after the question has been recorded, so
 * the state change and the question that caused it are never separated.
 */
export async function markClarificationRequested(input: {
  responseId: string;
  organizationId: string;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_responses
     SET status = 'CLARIFICATION_REQUESTED', updated_at = now()
     WHERE id = $1 AND organization_id = $2
       AND status IN ('SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED')
     RETURNING id`,
    [input.responseId, input.organizationId],
  );

  return result.rows.length > 0;
}

export interface WorkPackageResponseCounts {
  total: number;
  drafts: number;
  submitted: number;
  underReview: number;
  clarificationRequested: number;
  readyForEvaluation: number;
  withdrawn: number;
  openClarifications: number;
}

export async function summariseResponses(
  workPackageId: string,
): Promise<WorkPackageResponseCounts> {
  const result = await query<Record<string, string>>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE r.status = 'DRAFT')::text AS drafts,
            COUNT(*) FILTER (WHERE r.status = 'SUBMITTED')::text AS submitted,
            COUNT(*) FILTER (WHERE r.status = 'UNDER_REVIEW')::text AS under_review,
            COUNT(*) FILTER (WHERE r.status = 'CLARIFICATION_REQUESTED')::text AS clarification_requested,
            COUNT(*) FILTER (WHERE r.status = 'READY_FOR_EVALUATION')::text AS ready,
            COUNT(*) FILTER (WHERE r.status = 'WITHDRAWN')::text AS withdrawn,
            (SELECT COUNT(*) FROM work_package_response_clarifications cl
              WHERE cl.work_package_id = $1 AND cl.status = 'OPEN')::text AS open_clarifications
     FROM work_package_responses r
     WHERE r.work_package_id = $1`,
    [workPackageId],
  );

  const row = result.rows[0] ?? {};
  const count = (key: string): number => Number.parseInt(row[key] ?? "0", 10);

  return {
    total: count("total"),
    drafts: count("drafts"),
    submitted: count("submitted"),
    underReview: count("under_review"),
    clarificationRequested: count("clarification_requested"),
    readyForEvaluation: count("ready"),
    withdrawn: count("withdrawn"),
    openClarifications: count("open_clarifications"),
  };
}

// ---------------------------------------------------------------------------
// Vendor side
// ---------------------------------------------------------------------------

/**
 * What a supplier is shown about its own response.
 *
 * Narrower than the government view by construction rather than by filtering:
 * this SELECT never joins the reviewing official, never counts the other
 * suppliers, and carries no assessment of any kind. There is nothing to strip.
 */
export interface VendorResponseSummary {
  id: string;
  invitationId: string;
  workPackageId: string;
  projectId: string;
  status: ResponseStatus;
  responseType: ResponseType;
  configStatus: string;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  submittedAt: string | null;
  submissionCount: number;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  updatedAt: string;

  departmentName: string;
  projectTitle: string;
  projectReferenceNumber: string;
  packageNumber: string;
  packageTitle: string;

  openClarifications: number;
}

interface VendorSummaryRow {
  id: string;
  invitation_id: string;
  work_package_id: string;
  project_id: string;
  status: ResponseStatus;
  response_type: ResponseType;
  config_status: string;
  response_deadline: Date | null;
  submitted_at: Date | null;
  submission_count: number;
  withdrawn_at: Date | null;
  withdrawal_reason: string | null;
  updated_at: Date;
  department_name: string;
  project_title: string;
  project_reference_number: string;
  package_number: string;
  package_title: string;
  open_clarifications: string;
}

const VENDOR_SUMMARY_SELECT = `
  SELECT r.id, r.invitation_id, r.work_package_id, r.project_id, r.status,
         c.response_type, c.status::text AS config_status, c.response_deadline,
         r.submitted_at, r.submission_count, r.withdrawn_at, r.withdrawal_reason,
         r.updated_at,
         o.name AS department_name,
         pr.title AS project_title, pr.reference_number AS project_reference_number,
         wp.package_number, wp.title AS package_title,
         (SELECT COUNT(*) FROM work_package_response_clarifications cl
           WHERE cl.response_id = r.id AND cl.status = 'OPEN')::text AS open_clarifications
  FROM work_package_responses r
  JOIN work_package_response_configs c ON c.id = r.config_id
  JOIN work_packages wp ON wp.id = r.work_package_id
  JOIN procurement_projects pr ON pr.id = r.project_id
  JOIN organizations o ON o.id = r.organization_id
`;

function toVendorSummary(row: VendorSummaryRow): VendorResponseSummary {
  const responseDeadline = toIsoDay(row.response_deadline);

  return {
    id: row.id,
    invitationId: row.invitation_id,
    workPackageId: row.work_package_id,
    projectId: row.project_id,
    status: row.status,
    responseType: row.response_type,
    configStatus: row.config_status,
    responseDeadline,
    deadlinePassed: dayHasPassed(responseDeadline),
    submittedAt: row.submitted_at?.toISOString() ?? null,
    submissionCount: row.submission_count,
    withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
    withdrawalReason: row.withdrawal_reason,
    updatedAt: row.updated_at.toISOString(),
    departmentName: row.department_name,
    projectTitle: row.project_title,
    projectReferenceNumber: row.project_reference_number,
    packageNumber: row.package_number,
    packageTitle: row.package_title,
    openClarifications: Number.parseInt(row.open_clarifications, 10),
  };
}

export async function listResponsesForVendor(
  vendorProfileId: string,
): Promise<VendorResponseSummary[]> {
  const result = await query<VendorSummaryRow>(
    `${VENDOR_SUMMARY_SELECT}
     WHERE r.vendor_profile_id = $1 AND wp.is_deleted = false
     ORDER BY r.updated_at DESC`,
    [vendorProfileId],
  );

  return result.rows.map(toVendorSummary);
}

export interface VendorResponseDetail extends VendorResponseSummary {
  configId: string;
  body: ResponseBody;
  createdAt: string;
}

export async function findVendorResponse(
  responseId: string,
  vendorProfileId: string,
): Promise<VendorResponseDetail | undefined> {
  const result = await query<VendorSummaryRow & BodyRow & { config_id: string; created_at: Date }>(
    `SELECT r.id, r.invitation_id, r.work_package_id, r.project_id, r.status,
            c.response_type, c.status::text AS config_status, c.response_deadline,
            r.submitted_at, r.submission_count, r.withdrawn_at, r.withdrawal_reason,
            r.updated_at, r.created_at, r.config_id,
            o.name AS department_name,
            pr.title AS project_title, pr.reference_number AS project_reference_number,
            wp.package_number, wp.title AS package_title,
            (SELECT COUNT(*) FROM work_package_response_clarifications cl
              WHERE cl.response_id = r.id AND cl.status = 'OPEN')::text AS open_clarifications,
            ${BODY_COLUMNS}
     FROM work_package_responses r
     JOIN work_package_response_configs c ON c.id = r.config_id
     JOIN work_packages wp ON wp.id = r.work_package_id
     JOIN procurement_projects pr ON pr.id = r.project_id
     JOIN organizations o ON o.id = r.organization_id
     WHERE r.id = $1 AND r.vendor_profile_id = $2 AND wp.is_deleted = false`,
    [responseId, vendorProfileId],
  );

  const row = result.rows[0];
  if (row === undefined) return undefined;

  return {
    ...toVendorSummary(row),
    configId: row.config_id,
    body: toBody(row),
    createdAt: row.created_at.toISOString(),
  };
}

/** Why a supplier could not open a response. */
export type ResponseOpenRefusal =
  | "INVITATION_NOT_FOUND"
  | "INVITATION_NOT_ACCEPTED"
  | "NOT_CONFIGURED"
  | "NOT_OPEN";

/**
 * Opens the draft for an accepted invitation, or returns the existing one.
 *
 * Every precondition is inside the INSERT's own SELECT rather than checked
 * beforehand: the invitation must exist, belong to this supplier and be
 * ACCEPTED, the work package must not be deleted, and the department's response
 * configuration must be OPEN. A supplier that satisfies all of them gets a row;
 * one that does not gets nothing, and no combination of ids from the browser
 * changes that.
 *
 * `ON CONFLICT (invitation_id) DO NOTHING` makes a second call idempotent — the
 * supplier reopening the page resumes its draft rather than being refused.
 */
export async function openResponse(input: {
  invitationId: string;
  vendorProfileId: string;
  createdBy: string;
}): Promise<
  { response: VendorResponseDetail } | { refusedBecause: ResponseOpenRefusal }
> {
  await query(
    `INSERT INTO work_package_responses
       (config_id, invitation_id, work_package_id, project_id, vendor_profile_id,
        organization_id, created_by)
     SELECT c.id, i.id, i.work_package_id, i.project_id, i.vendor_profile_id,
            i.organization_id, $3
     FROM work_package_invitations i
     JOIN work_packages wp ON wp.id = i.work_package_id
     JOIN work_package_response_configs c ON c.work_package_id = i.work_package_id
     WHERE i.id = $1 AND i.vendor_profile_id = $2 AND i.status = 'ACCEPTED'
       AND wp.is_deleted = false AND c.status = 'OPEN'
     ON CONFLICT (invitation_id) DO NOTHING`,
    [input.invitationId, input.vendorProfileId, input.createdBy],
  );

  const existing = await query<{ id: string }>(
    `SELECT r.id FROM work_package_responses r
     WHERE r.invitation_id = $1 AND r.vendor_profile_id = $2`,
    [input.invitationId, input.vendorProfileId],
  );

  const id = existing.rows[0]?.id;
  if (id !== undefined) {
    const response = await findVendorResponse(id, input.vendorProfileId);
    if (response === undefined) {
      throw new Error("The response could not be read back after it was opened.");
    }
    return { response };
  }

  // Nothing was inserted. Work out which precondition failed, so the supplier
  // is told something it can act on rather than a bare refusal.
  const diagnosis = await query<{ invitation_status: string; config_status: string | null }>(
    `SELECT i.status::text AS invitation_status, c.status::text AS config_status
     FROM work_package_invitations i
     LEFT JOIN work_package_response_configs c ON c.work_package_id = i.work_package_id
     WHERE i.id = $1 AND i.vendor_profile_id = $2`,
    [input.invitationId, input.vendorProfileId],
  );

  const row = diagnosis.rows[0];
  if (row === undefined) return { refusedBecause: "INVITATION_NOT_FOUND" };
  if (row.invitation_status !== "ACCEPTED") return { refusedBecause: "INVITATION_NOT_ACCEPTED" };
  if (row.config_status === null) return { refusedBecause: "NOT_CONFIGURED" };
  return { refusedBecause: "NOT_OPEN" };
}

/**
 * Saves part of a draft.
 *
 * The column list is built from the catalogue, never from the request: a key
 * the request supplies is looked up in `RESPONSE_FIELDS` and dropped if it is
 * not there, so no request can name a column. The editable-state predicate is
 * in the same statement as the ownership predicate, which is the whole of
 * "a submitted response cannot be modified".
 */
export async function saveResponseDraft(input: {
  responseId: string;
  vendorProfileId: string;
  values: ResponseValues;
}): Promise<boolean> {
  const assignments: string[] = [];
  const parameters: unknown[] = [input.responseId, input.vendorProfileId];

  for (const [key, value] of Object.entries(input.values)) {
    const field = RESPONSE_FIELDS.get(key);
    if (field === undefined) continue;

    const cast =
      field.type === "NUMBER"
        ? "::integer"
        : field.type === "MONEY"
          ? "::bigint"
          : field.type === "DATE"
            ? "::date"
            : field.type === "BOOLEAN"
              ? "::boolean"
              : "::text";

    parameters.push(field.notNull === true && value === null ? false : value);
    assignments.push(`${field.column} = $${parameters.length}${cast}`);
  }

  if (assignments.length === 0) return true;

  const result = await query<{ id: string }>(
    `UPDATE work_package_responses
     SET ${assignments.join(", ")}, updated_at = now()
     WHERE id = $1 AND vendor_profile_id = $2
       AND status IN ('DRAFT', 'CLARIFICATION_REQUESTED')
     RETURNING id`,
    parameters,
  );

  return result.rows.length > 0;
}

/**
 * DRAFT -> SUBMITTED, or CLARIFICATION_REQUESTED -> RESUBMITTED.
 *
 * One statement decides which, from the state the row is actually in, so the
 * caller cannot assert that a first submission is a resubmission or the
 * reverse. Completeness is checked by the route before this runs; what this
 * guarantees is that the transition happens once.
 */
export async function submitResponse(input: {
  responseId: string;
  vendorProfileId: string;
  submittedBy: string;
}): Promise<ResponseStatus | undefined> {
  const result = await query<{ status: ResponseStatus }>(
    `UPDATE work_package_responses
     SET status = (CASE WHEN status = 'DRAFT' THEN 'SUBMITTED' ELSE 'RESUBMITTED' END)
                    ::work_package_response_status,
         submitted_at = now(),
         submitted_by = $3,
         submission_count = submission_count + 1,
         updated_at = now()
     WHERE id = $1 AND vendor_profile_id = $2
       AND status IN ('DRAFT', 'CLARIFICATION_REQUESTED')
     RETURNING status::text AS status`,
    [input.responseId, input.vendorProfileId, input.submittedBy],
  );

  return result.rows[0]?.status;
}

/**
 * Withdraws a response the supplier no longer wishes to stand behind.
 *
 * Not a delete: what was submitted stays on the record, and the department sees
 * that it was withdrawn and why. A response already marked ready for evaluation
 * cannot be withdrawn — by then the department is acting on it.
 */
export async function withdrawResponse(input: {
  responseId: string;
  vendorProfileId: string;
  withdrawnBy: string;
  reason: string;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_responses
     SET status = 'WITHDRAWN', withdrawn_by = $3, withdrawn_at = now(),
         withdrawal_reason = $4, updated_at = now()
     WHERE id = $1 AND vendor_profile_id = $2
       AND status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CLARIFICATION_REQUESTED',
                      'RESUBMITTED')
     RETURNING id`,
    [input.responseId, input.vendorProfileId, input.withdrawnBy, input.reason],
  );

  return result.rows.length > 0;
}

/** Touches `updated_at` so the workspace's ordering reflects real activity. */
export async function touchResponse(responseId: string): Promise<void> {
  await query(`UPDATE work_package_responses SET updated_at = now() WHERE id = $1`, [
    responseId,
  ]);
}

// ---------------------------------------------------------------------------
// Requirement answers
// ---------------------------------------------------------------------------

export interface RequirementAnswer {
  requirementId: string;
  compliance: string;
  answer: string | null;
  notes: string | null;
  updatedAt: string;
}

export async function listRequirementAnswers(responseId: string): Promise<RequirementAnswer[]> {
  const result = await query<{
    requirement_id: string;
    compliance: string;
    answer: string | null;
    notes: string | null;
    updated_at: Date;
  }>(
    `SELECT requirement_id, compliance::text, answer, notes, updated_at
     FROM work_package_response_requirement_answers
     WHERE response_id = $1`,
    [responseId],
  );

  return result.rows.map((row) => ({
    requirementId: row.requirement_id,
    compliance: row.compliance,
    answer: row.answer,
    notes: row.notes,
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Records one requirement answer.
 *
 * The response is re-checked in the same statement through a subquery: the
 * answer is written only where the response is this supplier's and still
 * editable. Checking ownership on a preceding SELECT would leave a window in
 * which the response was submitted between the check and the write.
 */
export async function upsertRequirementAnswer(input: {
  responseId: string;
  vendorProfileId: string;
  requirementId: string;
  compliance: string;
  answer: string | null;
  notes: string | null;
  updatedBy: string;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `INSERT INTO work_package_response_requirement_answers
       (response_id, requirement_id, compliance, answer, notes, updated_by)
     SELECT r.id, wpr.requirement_id, $4::work_package_requirement_compliance, $5, $6, $7
     FROM work_package_responses r
     JOIN work_package_requirements wpr
       ON wpr.work_package_id = r.work_package_id AND wpr.requirement_id = $3
     WHERE r.id = $1 AND r.vendor_profile_id = $2
       AND r.status IN ('DRAFT', 'CLARIFICATION_REQUESTED')
     ON CONFLICT (response_id, requirement_id) DO UPDATE
       SET compliance = EXCLUDED.compliance,
           answer     = EXCLUDED.answer,
           notes      = EXCLUDED.notes,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
     RETURNING id`,
    [
      input.responseId,
      input.vendorProfileId,
      input.requirementId,
      input.compliance,
      input.answer,
      input.notes,
      input.updatedBy,
    ],
  );

  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Custom question answers
// ---------------------------------------------------------------------------

export interface QuestionAnswer {
  questionId: string;
  value: unknown;
  updatedAt: string;
}

export async function listQuestionAnswers(responseId: string): Promise<QuestionAnswer[]> {
  const result = await query<{ question_id: string; value: unknown; updated_at: Date }>(
    `SELECT question_id, value, updated_at
     FROM work_package_response_question_answers
     WHERE response_id = $1`,
    [responseId],
  );

  return result.rows.map((row) => ({
    questionId: row.question_id,
    value: row.value,
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Records one custom-question answer.
 *
 * The question is resolved through the response's own configuration inside the
 * statement, so a question id belonging to another work package's configuration
 * matches nothing and writes nothing.
 */
export async function upsertQuestionAnswer(input: {
  responseId: string;
  vendorProfileId: string;
  questionId: string;
  value: unknown;
  updatedBy: string;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `INSERT INTO work_package_response_question_answers
       (response_id, question_id, value, updated_by)
     SELECT r.id, q.id, $4::jsonb, $5
     FROM work_package_responses r
     JOIN work_package_response_questions q ON q.config_id = r.config_id AND q.id = $3
     WHERE r.id = $1 AND r.vendor_profile_id = $2
       AND r.status IN ('DRAFT', 'CLARIFICATION_REQUESTED')
     ON CONFLICT (response_id, question_id) DO UPDATE
       SET value      = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
     RETURNING id`,
    [
      input.responseId,
      input.vendorProfileId,
      input.questionId,
      JSON.stringify(input.value ?? null),
      input.updatedBy,
    ],
  );

  return result.rows.length > 0;
}

/**
 * The supplier-facing counts the portal badges.
 *
 * Scoped to one supplier profile, like everything else on this side.
 */
export interface VendorResponseCounts {
  total: number;
  drafts: number;
  awaitingAction: number;
  submitted: number;
}

export async function summariseVendorResponses(
  vendorProfileId: string,
): Promise<VendorResponseCounts> {
  const result = await query<Record<string, string>>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE r.status = 'DRAFT')::text AS drafts,
            COUNT(*) FILTER (WHERE r.status IN ('DRAFT', 'CLARIFICATION_REQUESTED'))::text
              AS awaiting_action,
            COUNT(*) FILTER (WHERE r.status IN ('SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED',
                                                'READY_FOR_EVALUATION'))::text AS submitted
     FROM work_package_responses r
     JOIN work_packages wp ON wp.id = r.work_package_id
     WHERE r.vendor_profile_id = $1 AND wp.is_deleted = false`,
    [vendorProfileId],
  );

  const row = result.rows[0] ?? {};
  const count = (key: string): number => Number.parseInt(row[key] ?? "0", 10);

  return {
    total: count("total"),
    drafts: count("drafts"),
    awaitingAction: count("awaiting_action"),
    submitted: count("submitted"),
  };
}
