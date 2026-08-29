import type { PoolClient } from "pg";

import { getPool, query } from "../db/pool.js";
import { ApiError } from "../middleware/errors.js";
import { recordWorkPackageHistory } from "./workPackageHistory.js";
import { type SuggestedWorkPackageAi } from "../services/aiClient.js";

export type WorkPackageStatus =
  | "AI_GENERATED"
  | "UNDER_REVIEW"
  | "EDITED"
  | "ACCEPTED"
  | "REJECTED"
  | "MANUAL"
  | "CONFIRMED"
  | "ARCHIVED"
  | "DELETED";

export type WorkPackageSource =
  | "AI_GENERATED"
  | "MANUAL"
  | "MERGED"
  | "SPLIT"
  | "SINGLE_PROJECT";

export type WorkPackagePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type WorkPackageComplexity = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface RequirementRef {
  id: string;
  kind: string;
  category: string;
  text: string;
  rationale: string | null;
  status: string;
}

export interface WorkPackageDependencyInfo {
  id: string;
  packageNumber: string;
  title: string;
}

export interface WorkPackageVersionSnapshot {
  id: string;
  versionType: string;
  title: string;
  description: string;
  scope: string;
  complexity: WorkPackageComplexity;
  priority: WorkPackagePriority;
  estimatedCategory: string;
  deliverables: string[];
  notes: string | null;
  requirementIds: string[];
  dependencyIds: string[];
  createdBy: string | null;
  createdAt: string;
}

export interface WorkPackageDetail {
  id: string;
  projectId: string;
  analysisId: string | null;
  packageNumber: string;
  title: string;
  description: string;
  scope: string;
  complexity: WorkPackageComplexity;
  priority: WorkPackagePriority;
  estimatedCategory: string;
  deliverables: string[];
  notes: string | null;
  aiReasoning: string | null;
  confidenceScore: number | null;
  status: WorkPackageStatus;
  source: WorkPackageSource;
  displayOrder: number;
  isDeleted: boolean;
  deletedAt: string | null;
  rejectionReason: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requirements: RequirementRef[];
  dependencies: WorkPackageDependencyInfo[];
  versions: WorkPackageVersionSnapshot[];
}

export interface WorkPackagesSummary {
  total: number;
  active: number;
  accepted: number;
  underReview: number;
  edited: number;
  rejected: number;
  manual: number;
  confirmed: number;
  deleted: number;
}

export async function listWorkPackages(
  projectId: string,
  includeDeleted = true,
): Promise<{ packages: WorkPackageDetail[]; summary: WorkPackagesSummary }> {
  const whereClause = includeDeleted
    ? "WHERE wp.project_id = $1"
    : "WHERE wp.project_id = $1 AND wp.is_deleted = false";

  const result = await query<{
    id: string;
    project_id: string;
    analysis_id: string | null;
    package_number: string;
    title: string;
    description: string;
    scope: string;
    complexity: WorkPackageComplexity;
    priority: WorkPackagePriority;
    estimated_category: string;
    deliverables: string[];
    notes: string | null;
    ai_reasoning: string | null;
    confidence_score: number | null;
    status: WorkPackageStatus;
    source: WorkPackageSource;
    display_order: number;
    is_deleted: boolean;
    deleted_at: string | null;
    rejection_reason: string | null;
    decided_by: string | null;
    decided_by_name: string | null;
    decided_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT wp.id, wp.project_id, wp.analysis_id, wp.package_number, wp.title,
            wp.description, wp.scope, wp.complexity, wp.priority, wp.estimated_category,
            wp.deliverables, wp.notes, wp.ai_reasoning, wp.confidence_score,
            wp.status, wp.source, wp.display_order, wp.is_deleted, wp.deleted_at,
            wp.rejection_reason, wp.decided_by, u.full_name AS decided_by_name,
            wp.decided_at, wp.created_at, wp.updated_at
     FROM work_packages wp
     LEFT JOIN users u ON u.id = wp.decided_by
     ${whereClause}
     ORDER BY wp.display_order ASC, wp.created_at ASC`,
    [projectId],
  );

  const packagesRaw = result.rows;
  const packageIds = packagesRaw.map((p) => p.id);

  const requirementsByPackage: Record<string, RequirementRef[]> = {};
  const dependenciesByPackage: Record<string, WorkPackageDependencyInfo[]> = {};
  const versionsByPackage: Record<string, WorkPackageVersionSnapshot[]> = {};

  if (packageIds.length > 0) {
    // Requirements junction
    const reqRes = await query<{
      work_package_id: string;
      id: string;
      kind: string;
      category: string;
      text: string;
      rationale: string | null;
      status: string;
    }>(
      `SELECT wpr.work_package_id, r.id, r.kind, r.category, r.text, r.rationale, r.status
       FROM work_package_requirements wpr
       JOIN project_requirements r ON r.id = wpr.requirement_id
       WHERE wpr.work_package_id = ANY($1::uuid[])
       ORDER BY r.created_at ASC`,
      [packageIds],
    );
    for (const row of reqRes.rows) {
      const list = requirementsByPackage[row.work_package_id] ?? [];
      list.push({
        id: row.id,
        kind: row.kind,
        category: row.category,
        text: row.text,
        rationale: row.rationale,
        status: row.status,
      });
      requirementsByPackage[row.work_package_id] = list;
    }

    // Dependencies
    const depRes = await query<{
      work_package_id: string;
      id: string;
      package_number: string;
      title: string;
    }>(
      `SELECT wpd.work_package_id, dep.id, dep.package_number, dep.title
       FROM work_package_dependencies wpd
       JOIN work_packages dep ON dep.id = wpd.depends_on_work_package_id
       WHERE wpd.work_package_id = ANY($1::uuid[])`,
      [packageIds],
    );
    for (const row of depRes.rows) {
      const list = dependenciesByPackage[row.work_package_id] ?? [];
      list.push({
        id: row.id,
        packageNumber: row.package_number,
        title: row.title,
      });
      dependenciesByPackage[row.work_package_id] = list;
    }

    // Versions
    const verRes = await query<{
      id: string;
      work_package_id: string;
      version_type: string;
      title: string;
      description: string;
      scope: string;
      complexity: WorkPackageComplexity;
      priority: WorkPackagePriority;
      estimated_category: string;
      deliverables: string[];
      notes: string | null;
      requirement_ids: string[];
      dependency_ids: string[];
      created_by: string | null;
      created_at: string;
    }>(
      `SELECT v.id, v.work_package_id, v.version_type, v.title, v.description,
              v.scope, v.complexity, v.priority, v.estimated_category,
              v.deliverables, v.notes, v.requirement_ids, v.dependency_ids,
              v.created_by, v.created_at
       FROM work_package_versions v
       WHERE v.work_package_id = ANY($1::uuid[])
       ORDER BY v.created_at DESC`,
      [packageIds],
    );
    for (const row of verRes.rows) {
      const list = versionsByPackage[row.work_package_id] ?? [];
      list.push({
        id: row.id,
        versionType: row.version_type,
        title: row.title,
        description: row.description,
        scope: row.scope,
        complexity: row.complexity,
        priority: row.priority,
        estimatedCategory: row.estimated_category,
        deliverables: row.deliverables ?? [],
        notes: row.notes,
        requirementIds: row.requirement_ids ?? [],
        dependencyIds: row.dependency_ids ?? [],
        createdBy: row.created_by,
        createdAt: row.created_at,
      });
      versionsByPackage[row.work_package_id] = list;
    }
  }

  const packages: WorkPackageDetail[] = packagesRaw.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    analysisId: row.analysis_id,
    packageNumber: row.package_number,
    title: row.title,
    description: row.description,
    scope: row.scope,
    complexity: row.complexity,
    priority: row.priority,
    estimatedCategory: row.estimated_category,
    deliverables: row.deliverables ?? [],
    notes: row.notes,
    aiReasoning: row.ai_reasoning,
    confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
    status: row.status,
    source: row.source,
    displayOrder: row.display_order,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
    rejectionReason: row.rejection_reason,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requirements: requirementsByPackage[row.id] ?? [],
    dependencies: dependenciesByPackage[row.id] ?? [],
    versions: versionsByPackage[row.id] ?? [],
  }));

  const activePackages = packages.filter((p) => !p.isDeleted && p.status !== "ARCHIVED");
  const summary: WorkPackagesSummary = {
    total: packages.length,
    active: activePackages.length,
    accepted: activePackages.filter((p) => p.status === "ACCEPTED").length,
    underReview: activePackages.filter((p) => p.status === "UNDER_REVIEW" || p.status === "AI_GENERATED").length,
    edited: activePackages.filter((p) => p.status === "EDITED").length,
    rejected: activePackages.filter((p) => p.status === "REJECTED").length,
    manual: activePackages.filter((p) => p.status === "MANUAL").length,
    confirmed: activePackages.filter((p) => p.status === "CONFIRMED").length,
    deleted: packages.filter((p) => p.isDeleted).length,
  };

  return { packages, summary };
}

export async function findWorkPackageById(
  id: string,
  projectId?: string,
): Promise<WorkPackageDetail | undefined> {
  const whereClause = projectId
    ? "WHERE wp.id = $1 AND wp.project_id = $2"
    : "WHERE wp.id = $1";
  const params = projectId ? [id, projectId] : [id];

  const result = await query<{
    id: string;
    project_id: string;
    analysis_id: string | null;
    package_number: string;
    title: string;
    description: string;
    scope: string;
    complexity: WorkPackageComplexity;
    priority: WorkPackagePriority;
    estimated_category: string;
    deliverables: string[];
    notes: string | null;
    ai_reasoning: string | null;
    confidence_score: number | null;
    status: WorkPackageStatus;
    source: WorkPackageSource;
    display_order: number;
    is_deleted: boolean;
    deleted_at: string | null;
    rejection_reason: string | null;
    decided_by: string | null;
    decided_by_name: string | null;
    decided_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT wp.id, wp.project_id, wp.analysis_id, wp.package_number, wp.title,
            wp.description, wp.scope, wp.complexity, wp.priority, wp.estimated_category,
            wp.deliverables, wp.notes, wp.ai_reasoning, wp.confidence_score,
            wp.status, wp.source, wp.display_order, wp.is_deleted, wp.deleted_at,
            wp.rejection_reason, wp.decided_by, u.full_name AS decided_by_name,
            wp.decided_at, wp.created_at, wp.updated_at
     FROM work_packages wp
     LEFT JOIN users u ON u.id = wp.decided_by
     ${whereClause}`,
    params,
  );

  const row = result.rows[0];
  if (!row) return undefined;

  // Requirements
  const reqRes = await query<{
    id: string;
    kind: string;
    category: string;
    text: string;
    rationale: string | null;
    status: string;
  }>(
    `SELECT r.id, r.kind, r.category, r.text, r.rationale, r.status
     FROM work_package_requirements wpr
     JOIN project_requirements r ON r.id = wpr.requirement_id
     WHERE wpr.work_package_id = $1
     ORDER BY r.created_at ASC`,
    [row.id],
  );

  // Dependencies
  const depRes = await query<{
    id: string;
    package_number: string;
    title: string;
  }>(
    `SELECT dep.id, dep.package_number, dep.title
     FROM work_package_dependencies wpd
     JOIN work_packages dep ON dep.id = wpd.depends_on_work_package_id
     WHERE wpd.work_package_id = $1`,
    [row.id],
  );

  // Versions
  const verRes = await query<{
    id: string;
    version_type: string;
    title: string;
    description: string;
    scope: string;
    complexity: WorkPackageComplexity;
    priority: WorkPackagePriority;
    estimated_category: string;
    deliverables: string[];
    notes: string | null;
    requirement_ids: string[];
    dependency_ids: string[];
    created_by: string | null;
    created_at: string;
  }>(
    `SELECT v.id, v.version_type, v.title, v.description,
            v.scope, v.complexity, v.priority, v.estimated_category,
            v.deliverables, v.notes, v.requirement_ids, v.dependency_ids,
            v.created_by, v.created_at
     FROM work_package_versions v
     WHERE v.work_package_id = $1
     ORDER BY v.created_at DESC`,
    [row.id],
  );

  return {
    id: row.id,
    projectId: row.project_id,
    analysisId: row.analysis_id,
    packageNumber: row.package_number,
    title: row.title,
    description: row.description,
    scope: row.scope,
    complexity: row.complexity,
    priority: row.priority,
    estimatedCategory: row.estimated_category,
    deliverables: row.deliverables ?? [],
    notes: row.notes,
    aiReasoning: row.ai_reasoning,
    confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
    status: row.status,
    source: row.source,
    displayOrder: row.display_order,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
    rejectionReason: row.rejection_reason,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requirements: reqRes.rows,
    dependencies: depRes.rows.map((d) => ({
      id: d.id,
      packageNumber: d.package_number,
      title: d.title,
    })),
    versions: verRes.rows.map((v) => ({
      id: v.id,
      versionType: v.version_type,
      title: v.title,
      description: v.description,
      scope: v.scope,
      complexity: v.complexity,
      priority: v.priority,
      estimatedCategory: v.estimated_category,
      deliverables: v.deliverables ?? [],
      notes: v.notes,
      requirementIds: v.requirement_ids ?? [],
      dependencyIds: v.dependency_ids ?? [],
      createdBy: v.created_by,
      createdAt: v.created_at,
    })),
  };
}

export async function createAiGeneratedWorkPackages(
  projectId: string,
  analysisId: string,
  officialId: string,
  suggestedPackages: SuggestedWorkPackageAi[],
): Promise<WorkPackageDetail[]> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Fetch existing highest package number
    const maxNumberRes = await client.query<{ max_num: number | null }>(
      `SELECT MAX(NULLIF(regexp_replace(package_number, '[^0-9]', '', 'g'), '')::int) AS max_num
       FROM work_packages WHERE project_id = $1`,
      [projectId],
    );
    let nextNum = (maxNumberRes.rows[0]?.max_num ?? 0) + 1;

    // Fetch confirmed requirements for mapping
    const reqRes = await client.query<{ id: string }>(
      `SELECT id FROM project_requirements WHERE project_id = $1 AND status = 'ACCEPTED'`,
      [projectId],
    );
    const validReqIds = new Set(reqRes.rows.map((r) => r.id));

    const createdPackageMap: Map<string, string> = new Map(); // title -> id
    const insertedIds: string[] = [];

    for (let i = 0; i < suggestedPackages.length; i++) {
      const sp = suggestedPackages[i]!;
      const pkgNumber = `WP-${String(nextNum++).padStart(2, "0")}`;

      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO work_packages (
          project_id, analysis_id, package_number, title, description, scope,
          complexity, priority, estimated_category, deliverables,
          ai_reasoning, confidence_score, status, source, display_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'UNDER_REVIEW', 'AI_GENERATED', $13
        ) RETURNING id`,
        [
          projectId,
          analysisId,
          pkgNumber,
          sp.title,
          sp.description,
          sp.scope,
          sp.complexity,
          sp.priority,
          sp.estimated_procurement_category,
          sp.deliverables,
          sp.ai_reasoning,
          sp.confidence_score,
          i,
        ],
      );
      const pkgId = insertRes.rows[0]!.id;
      createdPackageMap.set(sp.title.toLowerCase().trim(), pkgId);
      insertedIds.push(pkgId);

      // Filter and insert requirements
      const matchedReqIds = sp.included_requirement_ids.filter((rid) => validReqIds.has(rid));
      for (const reqId of matchedReqIds) {
        await client.query(
          `INSERT INTO work_package_requirements (work_package_id, requirement_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [pkgId, reqId],
        );
      }

      // Record immutable AI_INITIAL version
      await client.query(
        `INSERT INTO work_package_versions (
          work_package_id, version_type, title, description, scope,
          complexity, priority, estimated_category, deliverables, requirement_ids
        ) VALUES ($1, 'AI_INITIAL', $2, $3, $4, $5, $6, $7, $8, $9::uuid[])`,
        [
          pkgId,
          sp.title,
          sp.description,
          sp.scope,
          sp.complexity,
          sp.priority,
          sp.estimated_procurement_category,
          sp.deliverables,
          matchedReqIds,
        ],
      );

      // Record audit history
      await client.query(
        `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, new_value, reason)
         VALUES ($1, $2, $3, 'GENERATED', $4, 'Generated by AI Requirement Decomposition Pipeline')`,
        [
          projectId,
          pkgId,
          officialId,
          JSON.stringify({
            packageNumber: pkgNumber,
            title: sp.title,
            complexity: sp.complexity,
            priority: sp.priority,
            requirementsCount: matchedReqIds.length,
          }),
        ],
      );
    }

    // Process dependencies
    for (let i = 0; i < suggestedPackages.length; i++) {
      const sp = suggestedPackages[i]!;
      const pkgId = insertedIds[i]!;
      const depIds: string[] = [];

      for (const depTitle of sp.dependencies) {
        const targetId = createdPackageMap.get(depTitle.toLowerCase().trim());
        if (targetId && targetId !== pkgId) {
          await client.query(
            `INSERT INTO work_package_dependencies (work_package_id, depends_on_work_package_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [pkgId, targetId],
          );
          depIds.push(targetId);
        }
      }

      if (depIds.length > 0) {
        await client.query(
          `UPDATE work_package_versions SET dependency_ids = $1::uuid[] WHERE work_package_id = $2 AND version_type = 'AI_INITIAL'`,
          [depIds, pkgId],
        );
      }
    }

    // Update project stage if in REQUIREMENTS_CONFIRMED
    const prjRes = await client.query<{ status: string }>(
      `SELECT status FROM procurement_projects WHERE id = $1`,
      [projectId],
    );
    if (prjRes.rows[0]?.status === "REQUIREMENTS_CONFIRMED") {
      await client.query(
        `UPDATE procurement_projects SET status = 'WORK_PACKAGES_UNDER_REVIEW', updated_at = now() WHERE id = $1`,
        [projectId],
      );
      await client.query(
        `INSERT INTO project_stage_history (project_id, from_status, to_status, actor_id, reason)
         VALUES ($1, 'REQUIREMENTS_CONFIRMED', 'WORK_PACKAGES_UNDER_REVIEW', $2, 'AI work package decomposition executed')`,
        [projectId, officialId],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const { packages } = await listWorkPackages(projectId);
  return packages;
}

export async function createManualWorkPackage(
  projectId: string,
  officialId: string,
  data: {
    title: string;
    description: string;
    scope: string;
    complexity?: WorkPackageComplexity;
    priority?: WorkPackagePriority;
    estimatedCategory?: string;
    deliverables?: string[];
    notes?: string;
    requirementIds?: string[];
    dependencyIds?: string[];
  },
): Promise<WorkPackageDetail> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const maxNumberRes = await client.query<{ max_num: number | null }>(
      `SELECT MAX(NULLIF(regexp_replace(package_number, '[^0-9]', '', 'g'), '')::int) AS max_num
       FROM work_packages WHERE project_id = $1`,
      [projectId],
    );
    const nextNum = (maxNumberRes.rows[0]?.max_num ?? 0) + 1;
    const pkgNumber = `WP-${String(nextNum).padStart(2, "0")}`;

    const maxOrderRes = await client.query<{ max_order: number | null }>(
      `SELECT MAX(display_order) AS max_order FROM work_packages WHERE project_id = $1`,
      [projectId],
    );
    const displayOrder = (maxOrderRes.rows[0]?.max_order ?? 0) + 1;

    const insertRes = await client.query<{ id: string }>(
      `INSERT INTO work_packages (
        project_id, package_number, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes,
        status, source, display_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'MANUAL', 'MANUAL', $11
      ) RETURNING id`,
      [
        projectId,
        pkgNumber,
        data.title,
        data.description,
        data.scope,
        data.complexity ?? "MEDIUM",
        data.priority ?? "MEDIUM",
        data.estimatedCategory ?? "General Procurement",
        data.deliverables ?? [],
        data.notes ?? null,
        displayOrder,
      ],
    );
    const pkgId = insertRes.rows[0]!.id;

    // Requirements
    if (data.requirementIds && data.requirementIds.length > 0) {
      for (const reqId of data.requirementIds) {
        await client.query(
          `INSERT INTO work_package_requirements (work_package_id, requirement_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [pkgId, reqId],
        );
      }
    }

    // Dependencies
    if (data.dependencyIds && data.dependencyIds.length > 0) {
      for (const depId of data.dependencyIds) {
        if (depId !== pkgId) {
          await client.query(
            `INSERT INTO work_package_dependencies (work_package_id, depends_on_work_package_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [pkgId, depId],
          );
        }
      }
    }

    // Version
    await client.query(
      `INSERT INTO work_package_versions (
        work_package_id, version_type, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes,
        requirement_ids, dependency_ids, created_by
      ) VALUES ($1, 'OFFICIAL_CURRENT', $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[], $11::uuid[], $12)`,
      [
        pkgId,
        data.title,
        data.description,
        data.scope,
        data.complexity ?? "MEDIUM",
        data.priority ?? "MEDIUM",
        data.estimatedCategory ?? "General Procurement",
        data.deliverables ?? [],
        data.notes ?? null,
        data.requirementIds ?? [],
        data.dependencyIds ?? [],
        officialId,
      ],
    );

    // History
    await client.query(
      `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, new_value, reason)
       VALUES ($1, $2, $3, 'GENERATED', $4, 'Created manually by procurement official')`,
      [
        projectId,
        pkgId,
        officialId,
        JSON.stringify({
          packageNumber: pkgNumber,
          title: data.title,
          source: "MANUAL",
        }),
      ],
    );

    // Update project stage if in REQUIREMENTS_CONFIRMED
    const prjRes = await client.query<{ status: string }>(
      `SELECT status FROM procurement_projects WHERE id = $1`,
      [projectId],
    );
    if (prjRes.rows[0]?.status === "REQUIREMENTS_CONFIRMED") {
      await client.query(
        `UPDATE procurement_projects SET status = 'WORK_PACKAGES_UNDER_REVIEW', updated_at = now() WHERE id = $1`,
        [projectId],
      );
      await client.query(
        `INSERT INTO project_stage_history (project_id, from_status, to_status, actor_id, reason)
         VALUES ($1, 'REQUIREMENTS_CONFIRMED', 'WORK_PACKAGES_UNDER_REVIEW', $2, 'Manual work package created')`,
        [projectId, officialId],
      );
    }

    await client.query("COMMIT");

    const created = await findWorkPackageById(pkgId);
    if (!created) throw new Error("Failed to load created work package");
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createNoDecompositionWorkPackage(
  projectId: string,
  officialId: string,
): Promise<WorkPackageDetail> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Fetch project details
    const prjRes = await client.query<{ title: string; problem_description: string; status: string }>(
      `SELECT title, problem_description, status FROM procurement_projects WHERE id = $1`,
      [projectId],
    );
    const project = prjRes.rows[0];
    if (!project) throw new ApiError(404, "NOT_FOUND", "Project not found");

    // Fetch all accepted requirements
    const reqRes = await client.query<{ id: string }>(
      `SELECT id FROM project_requirements WHERE project_id = $1 AND status = 'ACCEPTED'`,
      [projectId],
    );
    const reqIds = reqRes.rows.map((r) => r.id);

    // Soft delete / archive any previous packages
    await client.query(
      `UPDATE work_packages SET status = 'ARCHIVED', is_deleted = true, deleted_at = now()
       WHERE project_id = $1`,
      [projectId],
    );

    const pkgNumber = "WP-01";
    const title = `Comprehensive Implementation Package – ${project.title}`;
    const description = `Full project delivery package encompassing the end-to-end scope, specifications, and objectives of ${project.title}.`;
    const scope = project.problem_description;
    const deliverables = [
      "Complete Solution Architecture and Design Documentation",
      "End-to-End System Deployment and Infrastructure Commissioning",
      "Testing, Quality Assurance & Security Compliance Certification",
      "Operational Handover, Institutional Training & User Manuals",
    ];

    const insertRes = await client.query<{ id: string }>(
      `INSERT INTO work_packages (
        project_id, package_number, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes,
        status, source, display_order, decided_by, decided_at
      ) VALUES (
        $1, $2, $3, $4, $5, 'HIGH', 'HIGH', 'Turnkey Solution', $6,
        'Proceeded without decomposition under single procurement package rule.',
        'CONFIRMED', 'SINGLE_PROJECT', 0, $7, now()
      ) RETURNING id`,
      [projectId, pkgNumber, title, description, scope, deliverables, officialId],
    );
    const pkgId = insertRes.rows[0]!.id;

    for (const reqId of reqIds) {
      await client.query(
        `INSERT INTO work_package_requirements (work_package_id, requirement_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [pkgId, reqId],
      );
    }

    // Version
    await client.query(
      `INSERT INTO work_package_versions (
        work_package_id, version_type, title, description, scope,
        complexity, priority, estimated_category, deliverables,
        requirement_ids, created_by
      ) VALUES ($1, 'OFFICIAL_CURRENT', $2, $3, $4, 'HIGH', 'HIGH', 'Turnkey Solution', $5, $6::uuid[], $7)`,
      [pkgId, title, description, scope, deliverables, reqIds, officialId],
    );

    // History
    await client.query(
      `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, new_value, reason)
       VALUES ($1, $2, $3, 'CONFIRMED', $4, 'Single comprehensive work package created under no-decomposition workflow')`,
      [
        projectId,
        pkgId,
        officialId,
        JSON.stringify({
          packageNumber: pkgNumber,
          title,
          source: "SINGLE_PROJECT",
          status: "CONFIRMED",
        }),
      ],
    );

    // Transition project status to WORK_PACKAGES_CONFIRMED
    const oldStatus = project.status;
    await client.query(
      `UPDATE procurement_projects SET status = 'WORK_PACKAGES_CONFIRMED', updated_at = now() WHERE id = $1`,
      [projectId],
    );
    await client.query(
      `INSERT INTO project_stage_history (project_id, from_status, to_status, actor_id, reason)
       VALUES ($1, $2, 'WORK_PACKAGES_CONFIRMED', $3, 'Proceeded without decomposition; single package confirmed')`,
      [projectId, oldStatus, officialId],
    );

    await client.query("COMMIT");

    const created = await findWorkPackageById(pkgId);
    if (!created) throw new Error("Failed to load created package");
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateWorkPackage(
  id: string,
  officialId: string,
  data: {
    title?: string;
    description?: string;
    scope?: string;
    complexity?: WorkPackageComplexity;
    priority?: WorkPackagePriority;
    estimatedCategory?: string;
    deliverables?: string[];
    notes?: string | null;
    requirementIds?: string[];
    dependencyIds?: string[];
  },
): Promise<WorkPackageDetail> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const existingRes = await client.query<{
      id: string;
      project_id: string;
      title: string;
      description: string;
      scope: string;
      complexity: WorkPackageComplexity;
      priority: WorkPackagePriority;
      estimated_category: string;
      deliverables: string[];
      notes: string | null;
      status: WorkPackageStatus;
      source: WorkPackageSource;
    }>(`SELECT * FROM work_packages WHERE id = $1 AND is_deleted = false`, [id]);

    const current = existingRes.rows[0];
    if (!current) throw new ApiError(404, "NOT_FOUND", "Work package not found");

    if (current.status === "CONFIRMED") {
      throw new ApiError(409, "INVALID_STATE", "Confirmed work packages cannot be edited directly.");
    }

    const title = data.title ?? current.title;
    const description = data.description ?? current.description;
    const scope = data.scope ?? current.scope;
    const complexity = data.complexity ?? current.complexity;
    const priority = data.priority ?? current.priority;
    const estimatedCategory = data.estimatedCategory ?? current.estimated_category;
    const deliverables = data.deliverables ?? current.deliverables;
    const notes = data.notes !== undefined ? data.notes : current.notes;

    // Status: if it was AI_GENERATED or UNDER_REVIEW, mark as EDITED
    const newStatus: WorkPackageStatus =
      current.status === "MANUAL" ? "MANUAL" : "EDITED";

    // Cycle check if dependencies are provided
    if (data.dependencyIds) {
      for (const depId of data.dependencyIds) {
        if (depId === id) {
          throw new ApiError(400, "CIRCULAR_DEPENDENCY", "A work package cannot depend upon itself.");
        }
        const hasCycle = await checkCircularDependencyInternal(client, id, depId);
        if (hasCycle) {
          throw new ApiError(
            400,
            "CIRCULAR_DEPENDENCY",
            "Adding this dependency creates a circular cycle in the work package graph.",
          );
        }
      }
    }

    await client.query(
      `UPDATE work_packages
       SET title = $1, description = $2, scope = $3, complexity = $4,
           priority = $5, estimated_category = $6, deliverables = $7,
           notes = $8, status = $9, updated_at = now()
       WHERE id = $10`,
      [
        title,
        description,
        scope,
        complexity,
        priority,
        estimatedCategory,
        deliverables,
        notes,
        newStatus,
        id,
      ],
    );

    // Update requirements
    if (data.requirementIds !== undefined) {
      await client.query(`DELETE FROM work_package_requirements WHERE work_package_id = $1`, [id]);
      for (const reqId of data.requirementIds) {
        await client.query(
          `INSERT INTO work_package_requirements (work_package_id, requirement_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, reqId],
        );
      }
    }

    // Update dependencies
    if (data.dependencyIds !== undefined) {
      await client.query(`DELETE FROM work_package_dependencies WHERE work_package_id = $1`, [id]);
      for (const depId of data.dependencyIds) {
        await client.query(
          `INSERT INTO work_package_dependencies (work_package_id, depends_on_work_package_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, depId],
        );
      }
    }

    // Create OFFICIAL_CURRENT version
    await client.query(
      `INSERT INTO work_package_versions (
        work_package_id, version_type, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes,
        requirement_ids, dependency_ids, created_by
      ) VALUES ($1, 'OFFICIAL_CURRENT', $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[], $11::uuid[], $12)`,
      [
        id,
        title,
        description,
        scope,
        complexity,
        priority,
        estimatedCategory,
        deliverables,
        notes,
        data.requirementIds ?? [],
        data.dependencyIds ?? [],
        officialId,
      ],
    );

    // Record audit history
    await client.query(
      `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, old_value, new_value, reason)
       VALUES ($1, $2, $3, 'EDITED', $4, $5, 'Updated official specifications')`,
      [
        current.project_id,
        id,
        officialId,
        JSON.stringify({
          title: current.title,
          complexity: current.complexity,
          priority: current.priority,
          status: current.status,
        }),
        JSON.stringify({
          title,
          complexity,
          priority,
          status: newStatus,
        }),
      ],
    );

    await client.query("COMMIT");

    const updated = await findWorkPackageById(id);
    if (!updated) throw new Error("Failed to load updated work package");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function acceptWorkPackage(
  id: string,
  officialId: string,
): Promise<WorkPackageDetail> {
  const current = await findWorkPackageById(id);
  if (!current) throw new ApiError(404, "NOT_FOUND", "Work package not found");
  if (current.isDeleted) throw new ApiError(409, "INVALID_STATE", "Cannot accept a deleted package.");

  await query(
    `UPDATE work_packages
     SET status = 'ACCEPTED', rejection_reason = NULL, decided_by = $1, decided_at = now(), updated_at = now()
     WHERE id = $2`,
    [officialId, id],
  );

  await recordWorkPackageHistory(
    current.projectId,
    id,
    officialId,
    "ACCEPTED",
    { status: current.status },
    { status: "ACCEPTED" },
    "Approved by procurement official",
  );

  const updated = await findWorkPackageById(id);
  return updated!;
}

export async function rejectWorkPackage(
  id: string,
  officialId: string,
  reason: string,
): Promise<WorkPackageDetail> {
  const current = await findWorkPackageById(id);
  if (!current) throw new ApiError(404, "NOT_FOUND", "Work package not found");
  if (current.isDeleted) throw new ApiError(409, "INVALID_STATE", "Cannot reject a deleted package.");

  await query(
    `UPDATE work_packages
     SET status = 'REJECTED', rejection_reason = $1, decided_by = $2, decided_at = now(), updated_at = now()
     WHERE id = $3`,
    [reason, officialId, id],
  );

  await recordWorkPackageHistory(
    current.projectId,
    id,
    officialId,
    "REJECTED",
    { status: current.status },
    { status: "REJECTED", reason },
    reason,
  );

  const updated = await findWorkPackageById(id);
  return updated!;
}

export async function softDeleteWorkPackage(
  id: string,
  officialId: string,
  reason?: string,
): Promise<void> {
  const current = await findWorkPackageById(id);
  if (!current) throw new ApiError(404, "NOT_FOUND", "Work package not found");

  await query(
    `UPDATE work_packages
     SET is_deleted = true, deleted_at = now(), updated_at = now()
     WHERE id = $1`,
    [id],
  );

  await recordWorkPackageHistory(
    current.projectId,
    id,
    officialId,
    "DELETED",
    { isDeleted: false, status: current.status },
    { isDeleted: true, status: "DELETED" },
    reason ?? "Soft-deleted by procurement official",
  );
}

export async function restoreWorkPackage(
  id: string,
  officialId: string,
): Promise<WorkPackageDetail> {
  const current = await findWorkPackageById(id);
  if (!current) throw new ApiError(404, "NOT_FOUND", "Work package not found");
  if (!current.isDeleted) throw new ApiError(409, "INVALID_STATE", "Package is not deleted.");

  await query(
    `UPDATE work_packages
     SET is_deleted = false, deleted_at = NULL, updated_at = now()
     WHERE id = $1`,
    [id],
  );

  await recordWorkPackageHistory(
    current.projectId,
    id,
    officialId,
    "RESTORED",
    { isDeleted: true },
    { isDeleted: false, status: current.status },
    "Restored from deleted packages",
  );

  const updated = await findWorkPackageById(id);
  return updated!;
}

export async function duplicateWorkPackage(
  id: string,
  officialId: string,
): Promise<WorkPackageDetail> {
  const current = await findWorkPackageById(id);
  if (!current) throw new ApiError(404, "NOT_FOUND", "Work package not found");

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const maxNumberRes = await client.query<{ max_num: number | null }>(
      `SELECT MAX(NULLIF(regexp_replace(package_number, '[^0-9]', '', 'g'), '')::int) AS max_num
       FROM work_packages WHERE project_id = $1`,
      [current.projectId],
    );
    const nextNum = (maxNumberRes.rows[0]?.max_num ?? 0) + 1;
    const pkgNumber = `WP-${String(nextNum).padStart(2, "0")}`;

    const maxOrderRes = await client.query<{ max_order: number | null }>(
      `SELECT MAX(display_order) AS max_order FROM work_packages WHERE project_id = $1`,
      [current.projectId],
    );
    const displayOrder = (maxOrderRes.rows[0]?.max_order ?? 0) + 1;

    const newTitle = `${current.title} (Copy)`;
    const insertRes = await client.query<{ id: string }>(
      `INSERT INTO work_packages (
        project_id, package_number, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes,
        status, source, display_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'MANUAL', 'MANUAL', $11
      ) RETURNING id`,
      [
        current.projectId,
        pkgNumber,
        newTitle,
        current.description,
        current.scope,
        current.complexity,
        current.priority,
        current.estimatedCategory,
        current.deliverables,
        current.notes,
        displayOrder,
      ],
    );
    const newPkgId = insertRes.rows[0]!.id;

    // Copy requirements
    for (const req of current.requirements) {
      await client.query(
        `INSERT INTO work_package_requirements (work_package_id, requirement_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [newPkgId, req.id],
      );
    }

    // Version
    await client.query(
      `INSERT INTO work_package_versions (
        work_package_id, version_type, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes,
        requirement_ids, created_by
      ) VALUES ($1, 'OFFICIAL_CURRENT', $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[], $11)`,
      [
        newPkgId,
        newTitle,
        current.description,
        current.scope,
        current.complexity,
        current.priority,
        current.estimatedCategory,
        current.deliverables,
        current.notes,
        current.requirements.map((r) => r.id),
        officialId,
      ],
    );

    // History
    await client.query(
      `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, new_value, reason)
       VALUES ($1, $2, $3, 'DUPLICATED', $4, $5)`,
      [
        current.projectId,
        newPkgId,
        officialId,
        JSON.stringify({ originalPackageId: id, newPackageNumber: pkgNumber }),
        `Duplicated from ${current.packageNumber} (${current.title})`,
      ],
    );

    await client.query("COMMIT");

    const created = await findWorkPackageById(newPkgId);
    return created!;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reorderWorkPackages(
  projectId: string,
  orderedIds: string[],
  officialId: string,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE work_packages SET display_order = $1, updated_at = now()
         WHERE id = $2 AND project_id = $3`,
        [i, orderedIds[i], projectId],
      );
    }

    await client.query(
      `INSERT INTO work_package_history (project_id, actor_id, action, new_value, reason)
       VALUES ($1, $2, 'REORDERED', $3, 'Work packages display order re-arranged')`,
      [projectId, officialId, JSON.stringify({ orderedIds })],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function mergeWorkPackages(
  projectId: string,
  packageIds: string[],
  officialId: string,
  mergeData: {
    title: string;
    description: string;
    scope: string;
    complexity: WorkPackageComplexity;
    priority: WorkPackagePriority;
    estimatedCategory: string;
    deliverables: string[];
    notes?: string;
  },
): Promise<WorkPackageDetail> {
  if (packageIds.length < 2) {
    throw new ApiError(400, "INVALID_ARGUMENT", "At least 2 work packages are required to merge.");
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Fetch existing source packages
    const pkgsRes = await client.query<{
      id: string;
      package_number: string;
      title: string;
      description: string;
      scope: string;
      complexity: WorkPackageComplexity;
      priority: WorkPackagePriority;
      estimated_category: string;
      deliverables: string[];
      notes: string | null;
    }>(
      `SELECT * FROM work_packages
       WHERE id = ANY($1::uuid[]) AND project_id = $2 AND is_deleted = false AND status <> 'ARCHIVED'`,
      [packageIds, projectId],
    );

    if (pkgsRes.rows.length !== packageIds.length) {
      throw new ApiError(400, "INVALID_PACKAGES", "One or more selected packages were not found or already archived.");
    }

    // Collect all requirements & dependencies from source packages
    const reqRes = await client.query<{ requirement_id: string }>(
      `SELECT DISTINCT requirement_id FROM work_package_requirements WHERE work_package_id = ANY($1::uuid[])`,
      [packageIds],
    );
    const mergedReqIds = reqRes.rows.map((r) => r.requirement_id);

    const depRes = await client.query<{ depends_on_work_package_id: string }>(
      `SELECT DISTINCT depends_on_work_package_id FROM work_package_dependencies
       WHERE work_package_id = ANY($1::uuid[])
         AND depends_on_work_package_id <> ALL($1::uuid[])`,
      [packageIds],
    );
    const mergedDepIds = depRes.rows.map((d) => d.depends_on_work_package_id);

    // Allocate new package number
    const maxNumberRes = await client.query<{ max_num: number | null }>(
      `SELECT MAX(NULLIF(regexp_replace(package_number, '[^0-9]', '', 'g'), '')::int) AS max_num
       FROM work_packages WHERE project_id = $1`,
      [projectId],
    );
    const nextNum = (maxNumberRes.rows[0]?.max_num ?? 0) + 1;
    const pkgNumber = `WP-${String(nextNum).padStart(2, "0")}`;

    // Create merged package
    const insertRes = await client.query<{ id: string }>(
      `INSERT INTO work_packages (
        project_id, package_number, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes,
        status, source, display_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'UNDER_REVIEW', 'MERGED', 0
      ) RETURNING id`,
      [
        projectId,
        pkgNumber,
        mergeData.title,
        mergeData.description,
        mergeData.scope,
        mergeData.complexity,
        mergeData.priority,
        mergeData.estimatedCategory,
        mergeData.deliverables,
        mergeData.notes ?? null,
      ],
    );
    const newPkgId = insertRes.rows[0]!.id;

    // Attach requirements
    for (const reqId of mergedReqIds) {
      await client.query(
        `INSERT INTO work_package_requirements (work_package_id, requirement_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [newPkgId, reqId],
      );
    }

    // Attach dependencies
    for (const depId of mergedDepIds) {
      await client.query(
        `INSERT INTO work_package_dependencies (work_package_id, depends_on_work_package_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [newPkgId, depId],
      );
    }

    // Re-point other packages that depended on the old packages to the new merged package
    await client.query(
      `INSERT INTO work_package_dependencies (work_package_id, depends_on_work_package_id)
       SELECT DISTINCT work_package_id, $1::uuid
       FROM work_package_dependencies
       WHERE depends_on_work_package_id = ANY($2::uuid[]) 
         AND work_package_id <> $1::uuid
         AND work_package_id <> ALL($2::uuid[])
       ON CONFLICT (work_package_id, depends_on_work_package_id) DO NOTHING`,
      [newPkgId, packageIds],
    );

    await client.query(
      `DELETE FROM work_package_dependencies
       WHERE depends_on_work_package_id = ANY($1::uuid[]) OR work_package_id = ANY($1::uuid[])`,
      [packageIds],
    );

    // Archive source packages and preserve PRE_MERGE snapshot
    for (const p of pkgsRes.rows) {
      await client.query(
        `INSERT INTO work_package_versions (
          work_package_id, version_type, title, description, scope,
          complexity, priority, estimated_category, deliverables, notes, created_by
        ) VALUES ($1, 'ARCHIVED_PRE_MERGE', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          p.id,
          p.title,
          p.description,
          p.scope,
          p.complexity,
          p.priority,
          p.estimated_category,
          p.deliverables ?? [],
          p.notes,
          officialId,
        ],
      );

      await client.query(
        `UPDATE work_packages SET status = 'ARCHIVED', updated_at = now() WHERE id = $1`,
        [p.id],
      );

      await client.query(
        `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, new_value, reason)
         VALUES ($1, $2, $3, 'MERGED', $4, $5)`,
        [
          projectId,
          p.id,
          officialId,
          JSON.stringify({ mergedIntoPackageId: newPkgId, mergedPackageNumber: pkgNumber }),
          `Merged into ${pkgNumber} (${mergeData.title})`,
        ],
      );
    }

    // Record version & history for new package
    await client.query(
      `INSERT INTO work_package_versions (
        work_package_id, version_type, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes,
        requirement_ids, dependency_ids, created_by
      ) VALUES ($1, 'OFFICIAL_CURRENT', $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[], $11::uuid[], $12)`,
      [
        newPkgId,
        mergeData.title,
        mergeData.description,
        mergeData.scope,
        mergeData.complexity,
        mergeData.priority,
        mergeData.estimatedCategory,
        mergeData.deliverables,
        mergeData.notes ?? null,
        mergedReqIds,
        mergedDepIds,
        officialId,
      ],
    );

    await client.query(
      `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, new_value, reason)
       VALUES ($1, $2, $3, 'MERGED', $4, $5)`,
      [
        projectId,
        newPkgId,
        officialId,
        JSON.stringify({
          sourcePackageIds: packageIds,
          sourcePackageNumbers: pkgsRes.rows.map((r) => r.package_number),
        }),
        `Formed by merging ${pkgsRes.rows.map((r) => r.package_number).join(", ")}`,
      ],
    );

    await client.query("COMMIT");

    const created = await findWorkPackageById(newPkgId);
    return created!;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function splitWorkPackage(
  sourceId: string,
  officialId: string,
  splits: Array<{
    title: string;
    description: string;
    scope: string;
    complexity: WorkPackageComplexity;
    priority: WorkPackagePriority;
    estimatedCategory: string;
    deliverables: string[];
    requirementIds: string[];
    dependencyIds?: string[];
  }>,
): Promise<WorkPackageDetail[]> {
  if (splits.length < 2) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Splitting requires at least 2 target work packages.");
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const srcRes = await client.query<{
      id: string;
      project_id: string;
      package_number: string;
      title: string;
      description: string;
      scope: string;
      complexity: WorkPackageComplexity;
      priority: WorkPackagePriority;
      estimated_category: string;
      deliverables: string[];
      notes: string | null;
      status: WorkPackageStatus;
    }>(`SELECT * FROM work_packages WHERE id = $1 AND is_deleted = false AND status <> 'ARCHIVED'`, [sourceId]);

    const source = srcRes.rows[0];
    if (!source) throw new ApiError(404, "NOT_FOUND", "Source work package not found or archived");

    // Fetch existing highest number
    const maxNumberRes = await client.query<{ max_num: number | null }>(
      `SELECT MAX(NULLIF(regexp_replace(package_number, '[^0-9]', '', 'g'), '')::int) AS max_num
       FROM work_packages WHERE project_id = $1`,
      [source.project_id],
    );
    let nextNum = (maxNumberRes.rows[0]?.max_num ?? 0) + 1;

    // Snapshot source before split
    await client.query(
      `INSERT INTO work_package_versions (
        work_package_id, version_type, title, description, scope,
        complexity, priority, estimated_category, deliverables, notes, created_by
      ) VALUES ($1, 'ARCHIVED_PRE_SPLIT', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        source.id,
        source.title,
        source.description,
        source.scope,
        source.complexity,
        source.priority,
        source.estimated_category,
        source.deliverables,
        source.notes,
        officialId,
      ],
    );

    // Mark source as ARCHIVED
    await client.query(
      `UPDATE work_packages SET status = 'ARCHIVED', updated_at = now() WHERE id = $1`,
      [sourceId],
    );

    await client.query(
      `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, new_value, reason)
       VALUES ($1, $2, $3, 'SPLIT', $4, $5)`,
      [
        source.project_id,
        sourceId,
        officialId,
        JSON.stringify({ splitCount: splits.length }),
        `Split into ${splits.length} child packages`,
      ],
    );

    const createdIds: string[] = [];

    for (const split of splits) {
      const pkgNumber = `WP-${String(nextNum++).padStart(2, "0")}`;

      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO work_packages (
          project_id, package_number, title, description, scope,
          complexity, priority, estimated_category, deliverables,
          status, source, display_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'UNDER_REVIEW', 'SPLIT', 0
        ) RETURNING id`,
        [
          source.project_id,
          pkgNumber,
          split.title,
          split.description,
          split.scope,
          split.complexity,
          split.priority,
          split.estimatedCategory,
          split.deliverables,
        ],
      );
      const childId = insertRes.rows[0]!.id;
      createdIds.push(childId);

      // Requirements
      for (const reqId of split.requirementIds) {
        await client.query(
          `INSERT INTO work_package_requirements (work_package_id, requirement_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [childId, reqId],
        );
      }

      // Dependencies
      if (split.dependencyIds) {
        for (const depId of split.dependencyIds) {
          if (depId !== childId && depId !== sourceId) {
            await client.query(
              `INSERT INTO work_package_dependencies (work_package_id, depends_on_work_package_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [childId, depId],
            );
          }
        }
      }

      // Version
      await client.query(
        `INSERT INTO work_package_versions (
          work_package_id, version_type, title, description, scope,
          complexity, priority, estimated_category, deliverables,
          requirement_ids, dependency_ids, created_by
        ) VALUES ($1, 'OFFICIAL_CURRENT', $2, $3, $4, $5, $6, $7, $8, $9::uuid[], $10::uuid[], $11)`,
        [
          childId,
          split.title,
          split.description,
          split.scope,
          split.complexity,
          split.priority,
          split.estimatedCategory,
          split.deliverables,
          split.requirementIds,
          split.dependencyIds ?? [],
          officialId,
        ],
      );

      // History
      await client.query(
        `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, new_value, reason)
         VALUES ($1, $2, $3, 'SPLIT', $4, $5)`,
        [
          source.project_id,
          childId,
          officialId,
          JSON.stringify({
            sourcePackageId: sourceId,
            sourcePackageNumber: source.package_number,
            newPackageNumber: pkgNumber,
          }),
          `Created from split of ${source.package_number} (${source.title})`,
        ],
      );
    }

    await client.query("COMMIT");

    const resultPkgs: WorkPackageDetail[] = [];
    for (const cid of createdIds) {
      const p = await findWorkPackageById(cid);
      if (p) resultPkgs.push(p);
    }
    return resultPkgs;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function checkCircularDependencyInternal(
  client: PoolClient,
  sourceId: string,
  targetId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [targetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const res = await client.query<{ depends_on_work_package_id: string }>(
      `SELECT depends_on_work_package_id FROM work_package_dependencies WHERE work_package_id = $1`,
      [current],
    );
    for (const row of res.rows) {
      if (!visited.has(row.depends_on_work_package_id)) {
        queue.push(row.depends_on_work_package_id);
      }
    }
  }

  return false;
}

export async function validateAndConfirmWorkPackages(
  projectId: string,
  officialId: string,
): Promise<{ confirmedCount: number; projectStatus: string }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const prjRes = await client.query<{ status: string }>(
      `SELECT status FROM procurement_projects WHERE id = $1`,
      [projectId],
    );
    const currentPrj = prjRes.rows[0];
    if (!currentPrj) throw new ApiError(404, "NOT_FOUND", "Project not found");

    // Fetch all active non-archived non-deleted packages
    const pkgsRes = await client.query<{
      id: string;
      package_number: string;
      title: string;
      status: WorkPackageStatus;
    }>(
      `SELECT id, package_number, title, status FROM work_packages
       WHERE project_id = $1 AND is_deleted = false AND status <> 'ARCHIVED' AND status <> 'REJECTED'`,
      [projectId],
    );

    const activePackages = pkgsRes.rows;
    if (activePackages.length === 0) {
      throw new ApiError(
        400,
        "NO_WORK_PACKAGES",
        "At least one active work package is required to confirm decomposition.",
      );
    }

    // Check if any active package is still in an unapproved state
    const unapproved = activePackages.filter(
      (p) => p.status === "UNDER_REVIEW" || p.status === "AI_GENERATED" || p.status === "EDITED",
    );

    if (unapproved.length > 0) {
      const names = unapproved.map((p) => `${p.package_number} (${p.title})`).join(", ");
      throw new ApiError(
        400,
        "UNAPPROVED_WORK_PACKAGES",
        `Cannot confirm work packages. The following package(s) still require review/acceptance: ${names}`,
      );
    }

    // Mark all active packages as CONFIRMED
    for (const p of activePackages) {
      if (p.status !== "CONFIRMED") {
        await client.query(
          `UPDATE work_packages SET status = 'CONFIRMED', decided_by = $1, decided_at = now(), updated_at = now()
           WHERE id = $2`,
          [officialId, p.id],
        );
        await client.query(
          `INSERT INTO work_package_history (project_id, work_package_id, actor_id, action, old_value, new_value, reason)
           VALUES ($1, $2, $3, 'CONFIRMED', $4, $5, 'Confirmed as part of final procurement work package set')`,
          [
            projectId,
            p.id,
            officialId,
            JSON.stringify({ status: p.status }),
            JSON.stringify({ status: "CONFIRMED" }),
          ],
        );
      }
    }

    // Transition project status to WORK_PACKAGES_CONFIRMED
    const fromStatus = currentPrj.status;
    await client.query(
      `UPDATE procurement_projects SET status = 'WORK_PACKAGES_CONFIRMED', updated_at = now() WHERE id = $1`,
      [projectId],
    );

    await client.query(
      `INSERT INTO project_stage_history (project_id, from_status, to_status, actor_id, reason)
       VALUES ($1, $2, 'WORK_PACKAGES_CONFIRMED', $3, 'All work packages approved and confirmed by procurement official')`,
      [projectId, fromStatus, officialId],
    );

    await client.query("COMMIT");

    return {
      confirmedCount: activePackages.length,
      projectStatus: "WORK_PACKAGES_CONFIRMED",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The confirmed requirements a supplier is asked to answer, one by one.
 *
 * Only accepted requirements: a suggestion an official rejected is not part of
 * what the department is buying, and asking a supplier to respond to one would
 * put a discarded requirement in front of it as though it stood.
 *
 * Deliberately narrower than `findWorkPackageById`, which loads dependencies,
 * every version snapshot and the decision trail — none of which a response form
 * has any use for.
 */
export async function listConfirmedRequirementsForPackage(
  workPackageId: string,
): Promise<Array<{ id: string; kind: string; category: string; text: string }>> {
  const result = await query<{
    id: string;
    kind: string;
    category: string;
    text: string;
  }>(
    `SELECT r.id, r.kind::text, r.category::text, r.text
     FROM work_package_requirements wpr
     JOIN project_requirements r ON r.id = wpr.requirement_id
     WHERE wpr.work_package_id = $1 AND r.status = 'ACCEPTED'
     ORDER BY r.created_at ASC`,
    [workPackageId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    category: row.category,
    text: row.text,
  }));
}
