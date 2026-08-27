import { query } from "../db/pool.js";

export interface ProcurementProject {
  id: string;
  referenceNumber: string;
  title: string;
  problemDescription: string;
  status: string;
  organizationName: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  reference_number: string;
  title: string;
  problem_description: string;
  status: string;
  organization_name: string;
  created_by_name: string;
  created_at: Date;
  updated_at: Date;
}

const SELECT_PROJECT = `
  SELECT p.id, p.reference_number, p.title, p.problem_description, p.status,
         o.name AS organization_name, u.full_name AS created_by_name,
         p.created_at, p.updated_at
  FROM procurement_projects p
  JOIN organizations o ON o.id = p.organization_id
  JOIN users u ON u.id = p.created_by
`;

function toProject(row: ProjectRow): ProcurementProject {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    title: row.title,
    problemDescription: row.problem_description,
    status: row.status,
    organizationName: row.organization_name,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function nextReferenceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PRJ-${year}-`;

  const result = await query<{ max_sequence: string | null }>(
    `SELECT MAX(split_part(reference_number, '-', 3)::integer)::text AS max_sequence
     FROM procurement_projects
     WHERE reference_number LIKE $1
       AND split_part(reference_number, '-', 3) ~ '^[0-9]+$'`,
    [`${prefix}%`],
  );

  const current = Number.parseInt(result.rows[0]?.max_sequence ?? "0", 10);
  const next = (Number.isNaN(current) ? 0 : current) + 1;

  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function listProjects(organizationId: string): Promise<ProcurementProject[]> {
  const result = await query<ProjectRow>(
    `${SELECT_PROJECT} WHERE p.organization_id = $1 ORDER BY p.created_at DESC`,
    [organizationId],
  );
  return result.rows.map(toProject);
}

export async function findProjectById(
  id: string,
  organizationId: string,
): Promise<ProcurementProject | undefined> {
  const result = await query<ProjectRow>(
    `${SELECT_PROJECT} WHERE p.id = $1 AND p.organization_id = $2`,
    [id, organizationId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : toProject(row);
}

export async function createProject(input: {
  title: string;
  problemDescription: string;
  organizationId: string;
  createdBy: string;
}): Promise<ProcurementProject> {
  const referenceNumber = await nextReferenceNumber();

  const inserted = await query<{ id: string }>(
    `INSERT INTO procurement_projects
       (reference_number, organization_id, created_by, title, problem_description, status)
     VALUES ($1, $2, $3, $4, $5, 'DRAFT')
     RETURNING id`,
    [
      referenceNumber,
      input.organizationId,
      input.createdBy,
      input.title,
      input.problemDescription,
    ],
  );

  const id = inserted.rows[0]?.id;
  if (id === undefined) {
    throw new Error("Failed to create procurement project.");
  }

  const project = await findProjectById(id, input.organizationId);
  if (project === undefined) {
    throw new Error("Created project could not be read back.");
  }

  return project;
}
