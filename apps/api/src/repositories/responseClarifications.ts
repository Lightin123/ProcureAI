/**
 * The clarification thread on one response.
 *
 * Both directions live in one table because they are one conversation. What
 * separates them is `raised_by_side`, and that is what decides who may answer:
 * a department may only answer a question the supplier asked, and a supplier
 * may only answer one the department asked. Neither side can answer itself,
 * which is enforced in the UPDATE's WHERE clause rather than in a handler.
 *
 * Nothing here is editable. A question is written once and an answer is written
 * once, both with their actor and their timestamp, which is what makes the
 * thread a record rather than a pair of mutable fields.
 */

import { query } from "../db/pool.js";
import { toIsoDay } from "./dates.js";

export type ClarificationSide = "VENDOR" | "GOVERNMENT";
export type ClarificationStatus = "OPEN" | "ANSWERED";

export interface ResponseClarification {
  id: string;
  responseId: string;
  raisedBySide: ClarificationSide;
  status: ClarificationStatus;
  subject: string | null;
  question: string;
  askedByName: string;
  askedAt: string;
  respondBy: string | null;
  answer: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
}

interface ClarificationRow {
  id: string;
  response_id: string;
  raised_by_side: ClarificationSide;
  status: ClarificationStatus;
  subject: string | null;
  question: string;
  asked_by_name: string;
  asked_at: Date;
  respond_by: Date | null;
  answer: string | null;
  answered_by_name: string | null;
  answered_at: Date | null;
}

/**
 * Actor names are shown to both sides, and deliberately so: a clarification is
 * an official communication between two organisations, and "who asked this"
 * is part of what makes it one. Nothing else about either user is joined.
 */
const CLARIFICATION_SELECT = `
  SELECT cl.id, cl.response_id, cl.raised_by_side, cl.status, cl.subject, cl.question,
         asker.full_name AS asked_by_name, cl.asked_at, cl.respond_by,
         cl.answer, answerer.full_name AS answered_by_name, cl.answered_at
  FROM work_package_response_clarifications cl
  JOIN users asker ON asker.id = cl.asked_by
  LEFT JOIN users answerer ON answerer.id = cl.answered_by
`;

function toClarification(row: ClarificationRow): ResponseClarification {
  return {
    id: row.id,
    responseId: row.response_id,
    raisedBySide: row.raised_by_side,
    status: row.status,
    subject: row.subject,
    question: row.question,
    askedByName: row.asked_by_name,
    askedAt: row.asked_at.toISOString(),
    respondBy: toIsoDay(row.respond_by),
    answer: row.answer,
    answeredByName: row.answered_by_name,
    answeredAt: row.answered_at?.toISOString() ?? null,
  };
}

/**
 * The whole thread, oldest first.
 *
 * Ordering is deliberate and the opposite of every other list in this system: a
 * conversation is read forwards. The caller has already resolved the response
 * through its own side's ownership check, which is what scopes this.
 */
export async function listClarifications(responseId: string): Promise<ResponseClarification[]> {
  const result = await query<ClarificationRow>(
    `${CLARIFICATION_SELECT}
     WHERE cl.response_id = $1
     ORDER BY cl.asked_at ASC`,
    [responseId],
  );

  return result.rows.map(toClarification);
}

/**
 * Records a question from the department.
 *
 * The response is resolved inside the INSERT by organization, so a response id
 * belonging to another department produces no row. The supplier's profile and
 * the work package are copied from the response rather than accepted from the
 * caller, so the clarification cannot be filed against a different supplier
 * than the one whose response it is about.
 */
export async function createGovernmentClarification(input: {
  responseId: string;
  organizationId: string;
  subject: string | null;
  question: string;
  respondBy: string | null;
  askedBy: string;
}): Promise<ResponseClarification | undefined> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO work_package_response_clarifications
       (response_id, work_package_id, vendor_profile_id, organization_id,
        raised_by_side, subject, question, respond_by, asked_by)
     SELECT r.id, r.work_package_id, r.vendor_profile_id, r.organization_id,
            'GOVERNMENT', $3, $4, $5::date, $6
     FROM work_package_responses r
     WHERE r.id = $1 AND r.organization_id = $2
       AND r.status IN ('SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'CLARIFICATION_REQUESTED')
     RETURNING id`,
    [
      input.responseId,
      input.organizationId,
      input.subject,
      input.question,
      input.respondBy,
      input.askedBy,
    ],
  );

  const id = inserted.rows[0]?.id;
  return id === undefined ? undefined : await findClarification(id);
}

/**
 * Records a question from the supplier.
 *
 * Permitted only where the department allowed clarifications for this work
 * package, which is read from the configuration inside the statement rather
 * than checked in the handler — a flag the caller cannot see is a flag the
 * caller cannot bypass.
 */
export async function createVendorClarification(input: {
  responseId: string;
  vendorProfileId: string;
  subject: string | null;
  question: string;
  askedBy: string;
}): Promise<ResponseClarification | undefined> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO work_package_response_clarifications
       (response_id, work_package_id, vendor_profile_id, organization_id,
        raised_by_side, subject, question, asked_by)
     SELECT r.id, r.work_package_id, r.vendor_profile_id, r.organization_id,
            'VENDOR', $3, $4, $5
     FROM work_package_responses r
     JOIN work_package_response_configs c ON c.id = r.config_id
     WHERE r.id = $1 AND r.vendor_profile_id = $2
       AND c.allow_clarifications = true
       AND r.status <> 'WITHDRAWN'
     RETURNING id`,
    [input.responseId, input.vendorProfileId, input.subject, input.question, input.askedBy],
  );

  const id = inserted.rows[0]?.id;
  return id === undefined ? undefined : await findClarification(id);
}

async function findClarification(id: string): Promise<ResponseClarification | undefined> {
  const result = await query<ClarificationRow>(`${CLARIFICATION_SELECT} WHERE cl.id = $1`, [id]);
  const row = result.rows[0];
  return row === undefined ? undefined : toClarification(row);
}

/**
 * The department answers a question the supplier asked.
 *
 * `raised_by_side = 'VENDOR'` and `status = 'OPEN'` are both in the predicate,
 * so a department cannot answer its own clarification request and cannot
 * overwrite an answer already given.
 */
export async function answerAsGovernment(input: {
  clarificationId: string;
  responseId: string;
  organizationId: string;
  answer: string;
  answeredBy: string;
}): Promise<ResponseClarification | undefined> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_response_clarifications cl
     SET status = 'ANSWERED', answer = $4, answered_by = $5, answered_at = now()
     FROM work_package_responses r
     WHERE cl.id = $1 AND cl.response_id = $2 AND r.id = cl.response_id
       AND r.organization_id = $3
       AND cl.raised_by_side = 'VENDOR' AND cl.status = 'OPEN'
     RETURNING cl.id`,
    [
      input.clarificationId,
      input.responseId,
      input.organizationId,
      input.answer,
      input.answeredBy,
    ],
  );

  const id = result.rows[0]?.id;
  return id === undefined ? undefined : await findClarification(id);
}

/** The supplier answers a question the department asked. The mirror image. */
export async function answerAsVendor(input: {
  clarificationId: string;
  responseId: string;
  vendorProfileId: string;
  answer: string;
  answeredBy: string;
}): Promise<ResponseClarification | undefined> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_response_clarifications cl
     SET status = 'ANSWERED', answer = $4, answered_by = $5, answered_at = now()
     FROM work_package_responses r
     WHERE cl.id = $1 AND cl.response_id = $2 AND r.id = cl.response_id
       AND r.vendor_profile_id = $3
       AND cl.raised_by_side = 'GOVERNMENT' AND cl.status = 'OPEN'
     RETURNING cl.id`,
    [
      input.clarificationId,
      input.responseId,
      input.vendorProfileId,
      input.answer,
      input.answeredBy,
    ],
  );

  const id = result.rows[0]?.id;
  return id === undefined ? undefined : await findClarification(id);
}

/**
 * Whether the department is still waiting on the supplier for anything.
 *
 * Read before a resubmission is accepted: a supplier that resubmits while a
 * departmental question sits unanswered has not addressed what it was asked.
 */
export async function countOpenGovernmentClarifications(responseId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM work_package_response_clarifications
     WHERE response_id = $1 AND raised_by_side = 'GOVERNMENT' AND status = 'OPEN'`,
    [responseId],
  );

  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}
