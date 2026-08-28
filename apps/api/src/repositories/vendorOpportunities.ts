import { query } from "../db/pool.js";

/**
 * The vendor-facing view of a procurement project.
 *
 * Vendors are external parties, so this deliberately crosses organization
 * boundaries — an opportunity published by any department is visible to every
 * vendor — while exposing only the published subset: the title, the
 * opportunity summary, and the requirements the official has ACCEPTED.
 * Rejected suggestions, AI rationales, clarification threads and stage history
 * stay inside the department (D57).
 */
export interface VendorOpportunity {
  id: string;
  referenceNumber: string;
  title: string;
  summary: string;
  problemDescription: string;
  departmentName: string;
  status: string;
  publishedAt: string;
  responseDeadline: string | null;
  requirements: OpportunityRequirement[];
  saved: boolean;
  interestState: "NONE" | "SUBMITTED" | "WITHDRAWN";
  interestAt: string | null;
}

export interface OpportunityRequirement {
  kind: string;
  category: string;
  text: string;
}

interface OpportunityRow {
  id: string;
  reference_number: string;
  title: string;
  problem_description: string;
  opportunity_summary: string | null;
  department_name: string;
  status: string;
  published_at: Date;
  response_deadline: Date | null;
  saved: boolean | null;
  interest_state: "NONE" | "SUBMITTED" | "WITHDRAWN" | null;
  interest_at: Date | null;
}

const SELECT_OPPORTUNITY = `
  SELECT p.id, p.reference_number, p.title, p.problem_description, p.opportunity_summary,
         o.name AS department_name, p.status::text AS status, p.published_at, p.response_deadline,
         e.saved, e.interest_state, e.interest_at
  FROM procurement_projects p
  JOIN organizations o ON o.id = p.organization_id
  LEFT JOIN vendor_opportunity_engagements e
    ON e.project_id = p.id AND e.vendor_profile_id = $1
  WHERE p.published_at IS NOT NULL
`;

async function attachRequirements(rows: OpportunityRow[]): Promise<VendorOpportunity[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  // Only ACCEPTED requirements leave the department. A SUGGESTED item is an AI
  // proposal no official has approved, and publishing it would misrepresent the
  // department's position.
  const requirementRows = await query<{
    project_id: string;
    kind: string;
    category: string;
    text: string;
  }>(
    `SELECT project_id, kind::text AS kind, category::text AS category, text
     FROM project_requirements
     WHERE project_id = ANY($1::uuid[]) AND status = 'ACCEPTED'
     ORDER BY project_id, created_at`,
    [ids],
  );

  const byProject = new Map<string, OpportunityRequirement[]>();
  for (const row of requirementRows.rows) {
    const list = byProject.get(row.project_id) ?? [];
    list.push({ kind: row.kind, category: row.category, text: row.text });
    byProject.set(row.project_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    referenceNumber: row.reference_number,
    title: row.title,
    summary: row.opportunity_summary ?? row.problem_description.slice(0, 400),
    problemDescription: row.problem_description,
    departmentName: row.department_name,
    status: row.status,
    publishedAt: row.published_at.toISOString(),
    responseDeadline: row.response_deadline?.toISOString().slice(0, 10) ?? null,
    requirements: byProject.get(row.id) ?? [],
    saved: row.saved ?? false,
    interestState: row.interest_state ?? "NONE",
    interestAt: row.interest_at?.toISOString() ?? null,
  }));
}

export async function listOpportunities(vendorProfileId: string): Promise<VendorOpportunity[]> {
  const result = await query<OpportunityRow>(
    `${SELECT_OPPORTUNITY} ORDER BY p.published_at DESC`,
    [vendorProfileId],
  );
  return attachRequirements(result.rows);
}

export async function findOpportunity(
  vendorProfileId: string,
  projectId: string,
): Promise<VendorOpportunity | undefined> {
  const result = await query<OpportunityRow>(`${SELECT_OPPORTUNITY} AND p.id = $2`, [
    vendorProfileId,
    projectId,
  ]);
  const opportunities = await attachRequirements(result.rows);
  return opportunities[0];
}

export async function opportunityExists(projectId: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT true AS exists FROM procurement_projects
     WHERE id = $1 AND published_at IS NOT NULL`,
    [projectId],
  );
  return result.rows.length > 0;
}

export async function setSaved(
  vendorProfileId: string,
  projectId: string,
  saved: boolean,
): Promise<void> {
  await query(
    `INSERT INTO vendor_opportunity_engagements (vendor_profile_id, project_id, saved)
     VALUES ($1, $2, $3)
     ON CONFLICT (vendor_profile_id, project_id)
     DO UPDATE SET saved = EXCLUDED.saved, updated_at = now()`,
    [vendorProfileId, projectId, saved],
  );
}

export async function setInterest(input: {
  vendorProfileId: string;
  projectId: string;
  interestState: "SUBMITTED" | "WITHDRAWN";
  message: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO vendor_opportunity_engagements
       (vendor_profile_id, project_id, interest_state, interest_message, interest_at)
     VALUES ($1, $2, $3::vendor_interest_state, $4, now())
     ON CONFLICT (vendor_profile_id, project_id)
     DO UPDATE SET interest_state   = EXCLUDED.interest_state,
                   interest_message = EXCLUDED.interest_message,
                   interest_at      = now(),
                   updated_at       = now()`,
    [input.vendorProfileId, input.projectId, input.interestState, input.message],
  );
}

export interface EngagementSummary {
  savedCount: number;
  interestCount: number;
}

export async function summariseEngagements(vendorProfileId: string): Promise<EngagementSummary> {
  const result = await query<{ saved_count: string; interest_count: string }>(
    `SELECT COUNT(*) FILTER (WHERE saved) AS saved_count,
            COUNT(*) FILTER (WHERE interest_state = 'SUBMITTED') AS interest_count
     FROM vendor_opportunity_engagements WHERE vendor_profile_id = $1`,
    [vendorProfileId],
  );

  const row = result.rows[0];
  return {
    savedCount: Number.parseInt(row?.saved_count ?? "0", 10),
    interestCount: Number.parseInt(row?.interest_count ?? "0", 10),
  };
}

/**
 * Publication is an explicit act by an official, recorded against them. It is
 * separate from the workflow status so that confirming requirements internally
 * does not silently expose a project to every vendor on the platform.
 */
export async function publishOpportunity(input: {
  projectId: string;
  organizationId: string;
  publishedBy: string;
  summary: string;
  responseDeadline: string | null;
}): Promise<boolean> {
  const result = await query(
    `UPDATE procurement_projects
     SET published_at        = COALESCE(published_at, now()),
         published_by        = $3,
         opportunity_summary = $4,
         response_deadline   = $5,
         updated_at          = now()
     WHERE id = $1 AND organization_id = $2
       AND status IN ('REQUIREMENTS_CONFIRMED', 'WORK_PACKAGES_CONFIRMED', 'IN_DISCOVERY')`,
    [
      input.projectId,
      input.organizationId,
      input.publishedBy,
      input.summary,
      input.responseDeadline,
    ],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function withdrawOpportunity(
  projectId: string,
  organizationId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE procurement_projects
     SET published_at = NULL, published_by = NULL, updated_at = now()
     WHERE id = $1 AND organization_id = $2 AND published_at IS NOT NULL`,
    [projectId, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface OpportunityInterest {
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  headline: string | null;
  verificationState: string;
  message: string | null;
  submittedAt: string;
}

/** What a department sees: which vendors have declared interest in its project. */
export async function listInterestForProject(
  projectId: string,
  organizationId: string,
): Promise<OpportunityInterest[]> {
  const result = await query<{
    vendor_profile_id: string;
    organization_name: string;
    legal_name: string | null;
    headline: string | null;
    verification_state: string;
    interest_message: string | null;
    interest_at: Date;
  }>(
    `SELECT e.vendor_profile_id, o.name AS organization_name, vp.legal_name, vp.headline,
            vp.verification_state, e.interest_message, e.interest_at
     FROM vendor_opportunity_engagements e
     JOIN vendor_profiles vp ON vp.id = e.vendor_profile_id
     JOIN organizations o ON o.id = vp.organization_id
     JOIN procurement_projects p ON p.id = e.project_id
     WHERE e.project_id = $1 AND p.organization_id = $2 AND e.interest_state = 'SUBMITTED'
     ORDER BY e.interest_at DESC`,
    [projectId, organizationId],
  );

  return result.rows.map((row) => ({
    vendorProfileId: row.vendor_profile_id,
    organizationName: row.organization_name,
    legalName: row.legal_name,
    headline: row.headline,
    verificationState: row.verification_state,
    message: row.interest_message,
    submittedAt: row.interest_at.toISOString(),
  }));
}
