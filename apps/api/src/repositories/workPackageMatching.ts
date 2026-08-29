/**
 * Reads over stored matching runs, and the shortlist.
 *
 * The pipeline writes; this reads. Keeping them apart means a page that only
 * wants to show the last ranking never re-runs retrieval, which is what makes
 * revisiting a work package cheap.
 */

import { query } from "../db/pool.js";

export interface StoredMatchRun {
  runId: string;
  workPackageId: string;
  projectId: string;
  requestedByName: string;
  strategyVersion: number;
  normalizationVersion: number;
  eligibilityVersion: number;
  rankingVersion: number;
  weights: Record<string, number>;
  semanticEnabled: boolean;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  lexicalCandidates: number;
  semanticCandidates: number;
  poolSize: number;
  eligibleCount: number;
  excludedCount: number;
  durationMs: number;
  createdAt: string;
}

export async function findLatestMatchRun(
  workPackageId: string,
): Promise<StoredMatchRun | undefined> {
  const result = await query<{
    id: string;
    work_package_id: string;
    project_id: string;
    requested_by_name: string;
    strategy_version: number;
    normalization_version: number;
    eligibility_version: number;
    ranking_version: number;
    weights: Record<string, number>;
    semantic_enabled: boolean;
    embedding_model: string | null;
    embedding_dimensions: number | null;
    lexical_candidates: number;
    semantic_candidates: number;
    pool_size: number;
    eligible_count: number;
    excluded_count: number;
    duration_ms: number;
    created_at: Date;
  }>(
    `SELECT r.id, r.work_package_id, r.project_id, u.full_name AS requested_by_name,
            r.strategy_version, r.normalization_version, r.eligibility_version,
            r.ranking_version, r.weights, r.semantic_enabled, r.embedding_model,
            r.embedding_dimensions, r.lexical_candidates, r.semantic_candidates,
            r.pool_size, r.eligible_count, r.excluded_count, r.duration_ms, r.created_at
     FROM work_package_match_runs r
     JOIN users u ON u.id = r.requested_by
     WHERE r.work_package_id = $1
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [workPackageId],
  );

  const row = result.rows[0];
  if (row === undefined) return undefined;

  return {
    runId: row.id,
    workPackageId: row.work_package_id,
    projectId: row.project_id,
    requestedByName: row.requested_by_name,
    strategyVersion: row.strategy_version,
    normalizationVersion: row.normalization_version,
    eligibilityVersion: row.eligibility_version,
    rankingVersion: row.ranking_version,
    weights: row.weights ?? {},
    semanticEnabled: row.semantic_enabled,
    embeddingModel: row.embedding_model,
    embeddingDimensions: row.embedding_dimensions,
    lexicalCandidates: row.lexical_candidates,
    semanticCandidates: row.semantic_candidates,
    poolSize: row.pool_size,
    eligibleCount: row.eligible_count,
    excludedCount: row.excluded_count,
    durationMs: row.duration_ms,
    createdAt: row.created_at.toISOString(),
  };
}

export interface ShortlistEntry {
  id: string;
  workPackageId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  verificationState: string;
  rankAtShortlist: number | null;
  scoreAtShortlist: number | null;
  reason: string | null;
  addedByName: string;
  createdAt: string;

  /**
   * The engagement state of this shortlist entry: `null` until the supplier is
   * invited, then the status of the most recent invitation. Carried on the
   * shortlist rather than fetched separately because "shortlisted, not yet
   * invited" and "shortlisted and declined" are the two states the official is
   * deciding between when they look at this list.
   */
  invitationId: string | null;
  invitationStatus: string | null;
  invitedAt: string | null;
}

export async function listShortlist(workPackageId: string): Promise<ShortlistEntry[]> {
  const result = await query<{
    id: string;
    work_package_id: string;
    vendor_profile_id: string;
    organization_name: string;
    legal_name: string | null;
    verification_state: string;
    rank_at_shortlist: number | null;
    score_at_shortlist: number | null;
    reason: string | null;
    added_by_name: string;
    created_at: Date;
    invitation_id: string | null;
    invitation_status: string | null;
    invited_at: Date | null;
  }>(
    `SELECT s.id, s.work_package_id, s.vendor_profile_id, o.name AS organization_name,
            p.legal_name, p.verification_state, s.rank_at_shortlist, s.score_at_shortlist,
            s.reason, u.full_name AS added_by_name, s.created_at,
            i.id AS invitation_id, i.status::text AS invitation_status, i.invited_at
     FROM work_package_shortlist s
     JOIN vendor_profiles p ON p.id = s.vendor_profile_id
     JOIN organizations o ON o.id = p.organization_id
     JOIN users u ON u.id = s.added_by
     -- The most recent invitation for this supplier on this package. A lateral
     -- rather than a join on the shortlist id, because an invitation survives
     -- the shortlist entry it was issued from and a re-shortlisted supplier
     -- would otherwise appear never to have been invited.
     LEFT JOIN LATERAL (
       SELECT inv.id, inv.status, inv.invited_at
       FROM work_package_invitations inv
       WHERE inv.work_package_id = s.work_package_id
         AND inv.vendor_profile_id = s.vendor_profile_id
       ORDER BY inv.invited_at DESC
       LIMIT 1
     ) i ON true
     WHERE s.work_package_id = $1
     ORDER BY s.created_at DESC`,
    [workPackageId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    workPackageId: row.work_package_id,
    vendorProfileId: row.vendor_profile_id,
    organizationName: row.organization_name,
    legalName: row.legal_name,
    verificationState: row.verification_state,
    rankAtShortlist: row.rank_at_shortlist,
    scoreAtShortlist: row.score_at_shortlist,
    reason: row.reason,
    addedByName: row.added_by_name,
    createdAt: row.created_at.toISOString(),
    invitationId: row.invitation_id,
    invitationStatus: row.invitation_status,
    invitedAt: row.invited_at?.toISOString() ?? null,
  }));
}

/**
 * Adds a supplier to a work package's shortlist.
 *
 * The rank and score are read from the stored run rather than accepted from the
 * caller: a number the browser supplied is a claim about a server-side decision
 * and would make the shortlist record unfalsifiable.
 */
export type ShortlistRefusal = "NOT_ASSESSED" | "NOT_ELIGIBLE";

export async function addToShortlist(input: {
  workPackageId: string;
  vendorProfileId: string;
  reason: string | null;
  addedBy: string;
}): Promise<{ created: boolean; refusedBecause?: ShortlistRefusal }> {
  const latest = await query<{
    run_id: string;
    rank_position: number | null;
    overall_score: number;
    eligible: boolean;
  }>(
    `SELECT res.run_id, res.rank_position, res.overall_score, res.eligible
     FROM work_package_match_results res
     JOIN work_package_match_runs run ON run.id = res.run_id
     WHERE res.work_package_id = $1 AND res.vendor_profile_id = $2
     ORDER BY run.created_at DESC
     LIMIT 1`,
    [input.workPackageId, input.vendorProfileId],
  );

  const evidence = latest.rows[0];

  // The portal disables the control for an ineligible supplier; the rule is
  // enforced here too, because a rule that exists only in the browser is not a
  // rule. A supplier who cannot satisfy a mandatory requirement must not be
  // able to enter the shortlist that Milestone 7's invitations will read.
  if (evidence === undefined) return { created: false, refusedBecause: "NOT_ASSESSED" };
  if (!evidence.eligible) return { created: false, refusedBecause: "NOT_ELIGIBLE" };

  const result = await query<{ id: string }>(
    `INSERT INTO work_package_shortlist
       (work_package_id, vendor_profile_id, source_run_id, rank_at_shortlist,
        score_at_shortlist, reason, added_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (work_package_id, vendor_profile_id) DO NOTHING
     RETURNING id`,
    [
      input.workPackageId,
      input.vendorProfileId,
      evidence.run_id,
      evidence.rank_position,
      evidence.overall_score,
      input.reason,
      input.addedBy,
    ],
  );

  return { created: result.rows.length > 0 };
}

/**
 * Removes a supplier from a work package's shortlist.
 *
 * Refused while an invitation to that supplier is still live. The department
 * has told the supplier it is being invited; quietly dropping them from the
 * list the invitation was issued from would leave an invitation whose basis no
 * longer exists, and the supplier would still be looking at it. Withdrawing the
 * invitation first is the deliberate act, and it is separately audited.
 */
export type ShortlistRemovalRefusal = "NOT_ON_SHORTLIST" | "INVITATION_OPEN";

export async function removeFromShortlist(
  workPackageId: string,
  vendorProfileId: string,
): Promise<{ removed: boolean; refusedBecause?: ShortlistRemovalRefusal }> {
  const open = await query<{ id: string }>(
    `SELECT id FROM work_package_invitations
     WHERE work_package_id = $1 AND vendor_profile_id = $2
       AND status IN ('INVITED', 'ACCEPTED')
     LIMIT 1`,
    [workPackageId, vendorProfileId],
  );

  if (open.rows.length > 0) {
    return { removed: false, refusedBecause: "INVITATION_OPEN" };
  }

  const result = await query<{ id: string }>(
    `DELETE FROM work_package_shortlist
     WHERE work_package_id = $1 AND vendor_profile_id = $2
     RETURNING id`,
    [workPackageId, vendorProfileId],
  );

  return result.rows.length > 0
    ? { removed: true }
    : { removed: false, refusedBecause: "NOT_ON_SHORTLIST" };
}

/**
 * Confirms a work package belongs to the caller's organization.
 *
 * Returns the package's identity or nothing. Cross-organization access reads as
 * absent rather than forbidden, so this cannot be used to learn that another
 * department's package exists.
 */
export async function findScopedWorkPackage(
  workPackageId: string,
  organizationId: string,
): Promise<
  | {
      workPackageId: string;
      projectId: string;
      packageNumber: string;
      title: string;
      status: string;
      projectTitle: string;
    }
  | undefined
> {
  const result = await query<{
    id: string;
    project_id: string;
    package_number: string;
    title: string;
    status: string;
    project_title: string;
  }>(
    `SELECT wp.id, wp.project_id, wp.package_number, wp.title, wp.status,
            pr.title AS project_title
     FROM work_packages wp
     JOIN procurement_projects pr ON pr.id = wp.project_id
     WHERE wp.id = $1 AND pr.organization_id = $2 AND wp.is_deleted = false`,
    [workPackageId, organizationId],
  );

  const row = result.rows[0];
  if (row === undefined) return undefined;

  return {
    workPackageId: row.id,
    projectId: row.project_id,
    packageNumber: row.package_number,
    title: row.title,
    status: row.status,
    projectTitle: row.project_title,
  };
}

/**
 * The project fields work-package normalization reads as context. Scoping has
 * already happened by the time this is called — the caller resolved the package
 * through `findScopedWorkPackage`.
 */
export async function findProjectContext(
  projectId: string,
): Promise<{ title: string; problemDescription: string } | undefined> {
  const result = await query<{ title: string; problem_description: string }>(
    `SELECT title, problem_description FROM procurement_projects WHERE id = $1`,
    [projectId],
  );

  const row = result.rows[0];
  return row === undefined
    ? undefined
    : { title: row.title, problemDescription: row.problem_description };
}

/** Confirms a supplier profile exists before it can be shortlisted. */
export async function vendorProfileExists(vendorProfileId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id FROM vendor_profiles WHERE id = $1`,
    [vendorProfileId],
  );
  return result.rows.length > 0;
}
