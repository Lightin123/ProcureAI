/**
 * Work-package invitations — the Milestone 7 engagement step.
 *
 * Two sides read this table and they are deliberately served by different
 * functions rather than by one function with a flag:
 *
 *  - The government side reads every invitation on one of its own work
 *    packages, and sees who responded and when.
 *  - The vendor side reads only invitations addressed to its own profile, and
 *    sees the package it was invited to and nothing about anyone else.
 *
 * Every function that a vendor can reach takes `vendorProfileId` as a
 * non-optional argument and applies it in the WHERE clause. There is no
 * "find by id" that a vendor route could call without it, which is what stops
 * an invitation id from the browser being enough to read another supplier's
 * invitation.
 */

import { query } from "../db/pool.js";
import { dayHasPassed, toIsoDay } from "./dates.js";

export type InvitationStatus = "INVITED" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

/** The government view: one invitation on a work package this department owns. */
export interface WorkPackageInvitation {
  id: string;
  workPackageId: string;
  projectId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  verificationState: string;
  status: InvitationStatus;
  message: string | null;
  responseDeadline: string | null;
  invitedByName: string;
  invitedAt: string;
  respondedByName: string | null;
  respondedAt: string | null;
  responseNote: string | null;
  withdrawnByName: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
}

interface GovernmentRow {
  id: string;
  work_package_id: string;
  project_id: string;
  vendor_profile_id: string;
  organization_name: string;
  legal_name: string | null;
  verification_state: string;
  status: InvitationStatus;
  message: string | null;
  response_deadline: Date | null;
  invited_by_name: string;
  invited_at: Date;
  responded_by_name: string | null;
  responded_at: Date | null;
  response_note: string | null;
  withdrawn_by_name: string | null;
  withdrawn_at: Date | null;
  withdrawal_reason: string | null;
}

function toGovernmentInvitation(row: GovernmentRow): WorkPackageInvitation {
  return {
    id: row.id,
    workPackageId: row.work_package_id,
    projectId: row.project_id,
    vendorProfileId: row.vendor_profile_id,
    organizationName: row.organization_name,
    legalName: row.legal_name,
    verificationState: row.verification_state,
    status: row.status,
    message: row.message,
    responseDeadline: toIsoDay(row.response_deadline),
    invitedByName: row.invited_by_name,
    invitedAt: row.invited_at.toISOString(),
    respondedByName: row.responded_by_name,
    respondedAt: row.responded_at?.toISOString() ?? null,
    responseNote: row.response_note,
    withdrawnByName: row.withdrawn_by_name,
    withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
    withdrawalReason: row.withdrawal_reason,
  };
}

const GOVERNMENT_SELECT = `
  SELECT i.id, i.work_package_id, i.project_id, i.vendor_profile_id,
         o.name AS organization_name, p.legal_name, p.verification_state,
         i.status, i.message, i.response_deadline,
         inviter.full_name AS invited_by_name, i.invited_at,
         responder.full_name AS responded_by_name, i.responded_at, i.response_note,
         withdrawer.full_name AS withdrawn_by_name, i.withdrawn_at, i.withdrawal_reason
  FROM work_package_invitations i
  JOIN vendor_profiles p ON p.id = i.vendor_profile_id
  JOIN organizations o ON o.id = p.organization_id
  JOIN users inviter ON inviter.id = i.invited_by
  LEFT JOIN users responder ON responder.id = i.responded_by
  LEFT JOIN users withdrawer ON withdrawer.id = i.withdrawn_by
`;

export async function listInvitationsForWorkPackage(
  workPackageId: string,
): Promise<WorkPackageInvitation[]> {
  const result = await query<GovernmentRow>(
    `${GOVERNMENT_SELECT}
     WHERE i.work_package_id = $1
     ORDER BY i.invited_at DESC`,
    [workPackageId],
  );

  return result.rows.map(toGovernmentInvitation);
}

/**
 * The invitation a department may still act on, if any.
 *
 * Matches the partial unique index: an invitation that has been withdrawn or
 * declined is history, and does not block a fresh one.
 */
export async function findOpenInvitation(
  workPackageId: string,
  vendorProfileId: string,
): Promise<WorkPackageInvitation | undefined> {
  const result = await query<GovernmentRow>(
    `${GOVERNMENT_SELECT}
     WHERE i.work_package_id = $1 AND i.vendor_profile_id = $2
       AND i.status IN ('INVITED', 'ACCEPTED')
     LIMIT 1`,
    [workPackageId, vendorProfileId],
  );

  const row = result.rows[0];
  return row === undefined ? undefined : toGovernmentInvitation(row);
}

/**
 * Resolves an invitation inside the caller's organization, or nothing.
 *
 * The organization is taken from the session by the route and applied here, so
 * an invitation id belonging to another department reads as absent rather than
 * as forbidden — the same 404-not-403 rule the rest of the API follows.
 */
export async function findScopedInvitation(
  invitationId: string,
  organizationId: string,
): Promise<WorkPackageInvitation | undefined> {
  const result = await query<GovernmentRow>(
    `${GOVERNMENT_SELECT}
     WHERE i.id = $1 AND i.organization_id = $2`,
    [invitationId, organizationId],
  );

  const row = result.rows[0];
  return row === undefined ? undefined : toGovernmentInvitation(row);
}

/**
 * Issues an invitation.
 *
 * The shortlist entry is resolved here rather than accepted from the caller:
 * "this supplier is shortlisted for this work package" is the precondition, and
 * a shortlist id supplied by the browser would be a claim about it rather than
 * a check of it. A supplier who is not on the shortlist gets no row.
 */
export type InvitationRefusal = "NOT_SHORTLISTED" | "ALREADY_INVITED";

export async function createInvitation(input: {
  workPackageId: string;
  projectId: string;
  organizationId: string;
  vendorProfileId: string;
  message: string | null;
  responseDeadline: string | null;
  invitedBy: string;
}): Promise<{ invitation?: WorkPackageInvitation; refusedBecause?: InvitationRefusal }> {
  const shortlist = await query<{ id: string }>(
    `SELECT id FROM work_package_shortlist
     WHERE work_package_id = $1 AND vendor_profile_id = $2`,
    [input.workPackageId, input.vendorProfileId],
  );

  const shortlistId = shortlist.rows[0]?.id;
  if (shortlistId === undefined) {
    return { refusedBecause: "NOT_SHORTLISTED" };
  }

  const open = await findOpenInvitation(input.workPackageId, input.vendorProfileId);
  if (open !== undefined) {
    return { refusedBecause: "ALREADY_INVITED" };
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO work_package_invitations
       (work_package_id, project_id, vendor_profile_id, organization_id, shortlist_id,
        status, message, response_deadline, invited_by)
     VALUES ($1, $2, $3, $4, $5, 'INVITED', $6, $7::date, $8)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      input.workPackageId,
      input.projectId,
      input.vendorProfileId,
      input.organizationId,
      shortlistId,
      input.message,
      input.responseDeadline,
      input.invitedBy,
    ],
  );

  const id = inserted.rows[0]?.id;
  // The unique index refused it, which means a concurrent request won the race.
  if (id === undefined) {
    return { refusedBecause: "ALREADY_INVITED" };
  }

  const result = await query<GovernmentRow>(`${GOVERNMENT_SELECT} WHERE i.id = $1`, [id]);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("The invitation could not be read back after it was created.");
  }

  return { invitation: toGovernmentInvitation(row) };
}

/**
 * Withdraws an open invitation. Only an invitation still awaiting a response
 * can be withdrawn: retracting one a supplier has already accepted would erase
 * a commitment the supplier made, which is not a withdrawal.
 */
export async function withdrawInvitation(input: {
  invitationId: string;
  organizationId: string;
  withdrawnBy: string;
  reason: string | null;
}): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE work_package_invitations
     SET status = 'WITHDRAWN', withdrawn_by = $3, withdrawn_at = now(),
         withdrawal_reason = $4, updated_at = now()
     WHERE id = $1 AND organization_id = $2 AND status = 'INVITED'
     RETURNING id`,
    [input.invitationId, input.organizationId, input.withdrawnBy, input.reason],
  );

  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Vendor side
// ---------------------------------------------------------------------------

/**
 * What a supplier is shown about an invitation addressed to them.
 *
 * Deliberately narrower than the government view. There is no rank, no score,
 * no dimension breakdown, no eligibility verdict, no count of who else was
 * invited and no shortlist reason — those are the department's internal
 * assessment, and a supplier who could read them would learn how it was ranked
 * against its competitors.
 */
export interface VendorInvitation {
  id: string;
  status: InvitationStatus;
  message: string | null;
  responseDeadline: string | null;
  invitedAt: string;
  respondedAt: string | null;
  responseNote: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;

  departmentName: string;
  projectId: string;
  projectTitle: string;
  projectReferenceNumber: string;

  workPackageId: string;
  packageNumber: string;
  packageTitle: string;
  packageDescription: string;
  packageScope: string;
  packageCategory: string;
  packageComplexity: string;
  packagePriority: string;
  deliverables: string[];

  /**
   * Milestone 8. What the department has asked for by way of a structured
   * response, and how far this supplier has got with it.
   *
   * Carried on the invitation because the invitation is where the supplier
   * looks next: an accepted invitation with an open response configuration is
   * the one place "respond now" belongs. It stays within the D76 boundary —
   * it says what is being asked of this supplier, and nothing about how the
   * supplier was assessed or about any other supplier.
   */
  response: VendorInvitationResponseState;
}

export interface VendorInvitationResponseState {
  /** Whether the department has configured a response for this work package. */
  configured: boolean;
  /** Whether that configuration is open for responses right now. */
  open: boolean;
  responseType: string | null;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  /** This supplier's own response, once it has opened one. */
  responseId: string | null;
  responseStatus: string | null;
}

interface VendorRow {
  id: string;
  status: InvitationStatus;
  message: string | null;
  response_deadline: Date | null;
  invited_at: Date;
  responded_at: Date | null;
  response_note: string | null;
  withdrawn_at: Date | null;
  withdrawal_reason: string | null;
  department_name: string;
  project_id: string;
  project_title: string;
  project_reference_number: string;
  work_package_id: string;
  package_number: string;
  package_title: string;
  package_description: string;
  package_scope: string;
  package_category: string;
  package_complexity: string;
  package_priority: string;
  deliverables: string[];
  config_status: string | null;
  config_response_type: string | null;
  config_deadline: Date | null;
  response_id: string | null;
  response_status: string | null;
}

function toVendorInvitation(row: VendorRow): VendorInvitation {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    responseDeadline: toIsoDay(row.response_deadline),
    invitedAt: row.invited_at.toISOString(),
    respondedAt: row.responded_at?.toISOString() ?? null,
    responseNote: row.response_note,
    withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
    withdrawalReason: row.withdrawal_reason,
    departmentName: row.department_name,
    projectId: row.project_id,
    projectTitle: row.project_title,
    projectReferenceNumber: row.project_reference_number,
    workPackageId: row.work_package_id,
    packageNumber: row.package_number,
    packageTitle: row.package_title,
    packageDescription: row.package_description,
    packageScope: row.package_scope,
    packageCategory: row.package_category,
    packageComplexity: row.package_complexity,
    packagePriority: row.package_priority,
    deliverables: row.deliverables ?? [],
    response: {
      configured: row.config_status !== null,
      open: row.config_status === "OPEN",
      responseType: row.config_response_type,
      responseDeadline: toIsoDay(row.config_deadline),
      deadlinePassed: dayHasPassed(toIsoDay(row.config_deadline)),
      responseId: row.response_id,
      responseStatus: row.response_status,
    },
  };
}

const VENDOR_SELECT = `
  SELECT i.id, i.status, i.message, i.response_deadline, i.invited_at,
         i.responded_at, i.response_note, i.withdrawn_at, i.withdrawal_reason,
         o.name AS department_name,
         pr.id AS project_id, pr.title AS project_title,
         pr.reference_number AS project_reference_number,
         wp.id AS work_package_id, wp.package_number, wp.title AS package_title,
         wp.description AS package_description, wp.scope AS package_scope,
         wp.estimated_category AS package_category,
         wp.complexity::text AS package_complexity,
         wp.priority::text AS package_priority,
         wp.deliverables,
         cfg.status::text AS config_status,
         cfg.response_type::text AS config_response_type,
         cfg.response_deadline AS config_deadline,
         resp.id AS response_id,
         resp.status::text AS response_status
  FROM work_package_invitations i
  JOIN work_packages wp ON wp.id = i.work_package_id
  JOIN procurement_projects pr ON pr.id = i.project_id
  JOIN organizations o ON o.id = i.organization_id
  LEFT JOIN work_package_response_configs cfg ON cfg.work_package_id = i.work_package_id
  LEFT JOIN work_package_responses resp ON resp.invitation_id = i.id
`;

/**
 * Every invitation addressed to this supplier.
 *
 * A soft-deleted work package is excluded: an invitation to a package the
 * department has since withdrawn from its own plan is not something a supplier
 * should be asked to respond to.
 */
export async function listInvitationsForVendor(
  vendorProfileId: string,
): Promise<VendorInvitation[]> {
  const result = await query<VendorRow>(
    `${VENDOR_SELECT}
     WHERE i.vendor_profile_id = $1 AND wp.is_deleted = false
     ORDER BY i.invited_at DESC`,
    [vendorProfileId],
  );

  return result.rows.map(toVendorInvitation);
}

export async function findInvitationForVendor(
  invitationId: string,
  vendorProfileId: string,
): Promise<VendorInvitation | undefined> {
  const result = await query<VendorRow>(
    `${VENDOR_SELECT}
     WHERE i.id = $1 AND i.vendor_profile_id = $2 AND wp.is_deleted = false`,
    [invitationId, vendorProfileId],
  );

  const row = result.rows[0];
  return row === undefined ? undefined : toVendorInvitation(row);
}

/**
 * Records a supplier's answer.
 *
 * The vendor profile is part of the WHERE clause rather than checked before it,
 * so the ownership test and the state transition are one statement: there is no
 * window in which the invitation could be verified as one supplier's and then
 * updated as another's. `status = 'INVITED'` makes the transition
 * single-shot — an answered or withdrawn invitation cannot be answered again.
 */
export type ResponseRefusal = "NOT_FOUND" | "NOT_OPEN";

export async function respondToInvitation(input: {
  invitationId: string;
  vendorProfileId: string;
  respondedBy: string;
  decision: "ACCEPTED" | "DECLINED";
  note: string | null;
}): Promise<
  | { invitation: VendorInvitation }
  | { refusedBecause: ResponseRefusal; current?: VendorInvitation }
> {
  const updated = await query<{ id: string }>(
    `UPDATE work_package_invitations
     SET status = $4::work_package_invitation_status, responded_by = $3,
         responded_at = now(), response_note = $5, updated_at = now()
     WHERE id = $1 AND vendor_profile_id = $2 AND status = 'INVITED'
     RETURNING id`,
    [
      input.invitationId,
      input.vendorProfileId,
      input.respondedBy,
      input.decision,
      input.note,
    ],
  );

  if (updated.rows.length === 0) {
    // Distinguishes "not yours / does not exist" from "yours, but already
    // answered". Both are refusals; only the second is worth explaining.
    const current = await findInvitationForVendor(input.invitationId, input.vendorProfileId);
    return current === undefined
      ? { refusedBecause: "NOT_FOUND" }
      : { refusedBecause: "NOT_OPEN", current };
  }

  const invitation = await findInvitationForVendor(input.invitationId, input.vendorProfileId);
  if (invitation === undefined) {
    throw new Error("The invitation could not be read back after it was answered.");
  }

  return { invitation };
}

export interface VendorInvitationCounts {
  total: number;
  awaitingResponse: number;
  accepted: number;
  declined: number;
}

export async function summariseInvitations(
  vendorProfileId: string,
): Promise<VendorInvitationCounts> {
  const result = await query<{
    total: string;
    awaiting: string;
    accepted: string;
    declined: string;
  }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE i.status = 'INVITED')::text  AS awaiting,
            COUNT(*) FILTER (WHERE i.status = 'ACCEPTED')::text AS accepted,
            COUNT(*) FILTER (WHERE i.status = 'DECLINED')::text AS declined
     FROM work_package_invitations i
     JOIN work_packages wp ON wp.id = i.work_package_id
     WHERE i.vendor_profile_id = $1 AND wp.is_deleted = false`,
    [vendorProfileId],
  );

  const row = result.rows[0];
  return {
    total: Number.parseInt(row?.total ?? "0", 10),
    awaitingResponse: Number.parseInt(row?.awaiting ?? "0", 10),
    accepted: Number.parseInt(row?.accepted ?? "0", 10),
    declined: Number.parseInt(row?.declined ?? "0", 10),
  };
}
