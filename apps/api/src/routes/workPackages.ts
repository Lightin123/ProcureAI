import { Router, type Request } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { findProjectById } from "../repositories/projects.js";
import { listRequirements } from "../repositories/requirements.js";
import {
  completeWorkPackageAnalysisRun,
  createWorkPackageAnalysisRun,
  listWorkPackageAnalyses,
  markWorkPackageAnalysisRunFailed,
} from "../repositories/workPackageAnalyses.js";
import { listWorkPackageHistory } from "../repositories/workPackageHistory.js";
import {
  acceptWorkPackage,
  createAiGeneratedWorkPackages,
  createManualWorkPackage,
  createNoDecompositionWorkPackage,
  duplicateWorkPackage,
  findWorkPackageById,
  listWorkPackages,
  mergeWorkPackages,
  rejectWorkPackage,
  reorderWorkPackages,
  restoreWorkPackage,
  softDeleteWorkPackage,
  splitWorkPackage,
  updateWorkPackage,
  validateAndConfirmWorkPackages,
  type WorkPackageComplexity,
  type WorkPackagePriority,
} from "../repositories/workPackages.js";
import { requestWorkPackageDecomposition } from "../services/aiClient.js";

const uuidSchema = z.string().uuid();
const complexitySchema = z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]);
const prioritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

const manualPackageSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().trim().min(5, "Description must be at least 5 characters").max(5000),
  scope: z.string().trim().min(5, "Scope must be at least 5 characters").max(5000),
  complexity: complexitySchema.default("MEDIUM"),
  priority: prioritySchema.default("MEDIUM"),
  estimatedCategory: z.string().trim().min(1).default("General Procurement"),
  deliverables: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().max(3000).optional(),
  requirementIds: z.array(uuidSchema).default([]),
  dependencyIds: z.array(uuidSchema).default([]),
});

const updatePackageSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(5).max(5000).optional(),
  scope: z.string().trim().min(5).max(5000).optional(),
  complexity: complexitySchema.optional(),
  priority: prioritySchema.optional(),
  estimatedCategory: z.string().trim().min(1).optional(),
  deliverables: z.array(z.string().trim().min(1)).optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
  requirementIds: z.array(uuidSchema).optional(),
  dependencyIds: z.array(uuidSchema).optional(),
});

const rejectPackageSchema = z.object({
  reason: z.string().trim().min(3, "A rejection reason is required").max(1000),
});

const reorderSchema = z.object({
  orderedIds: z.array(uuidSchema).min(1, "orderedIds array is required"),
});

const mergeSchema = z.object({
  projectId: uuidSchema,
  packageIds: z.array(uuidSchema).min(2, "At least 2 work packages are required to merge"),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(5000),
  scope: z.string().trim().min(5).max(5000),
  complexity: complexitySchema.default("MEDIUM"),
  priority: prioritySchema.default("MEDIUM"),
  estimatedCategory: z.string().trim().min(1).default("General Procurement"),
  deliverables: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().max(3000).optional(),
});

const splitSchema = z.object({
  splits: z.array(
    z.object({
      title: z.string().trim().min(3).max(200),
      description: z.string().trim().min(5).max(5000),
      scope: z.string().trim().min(5).max(5000),
      complexity: complexitySchema.default("MEDIUM"),
      priority: prioritySchema.default("MEDIUM"),
      estimatedCategory: z.string().trim().min(1).default("General Procurement"),
      deliverables: z.array(z.string().trim().min(1)).default([]),
      requirementIds: z.array(uuidSchema).default([]),
      dependencyIds: z.array(uuidSchema).default([]),
    }),
  ).min(2, "At least 2 child packages are required to split"),
});

function validationError(issues: z.core.$ZodIssue[], message: string): ApiError {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    message,
    issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  );
}

function routeParam(request: Request, name: string): string | undefined {
  return (request.params as Record<string, string | undefined>)[name];
}

async function loadProject(request: Request, projectIdRaw: string | undefined) {
  const parsed = uuidSchema.safeParse(projectIdRaw);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
  }

  const official = getCurrentUser(request);
  const project = await findProjectById(parsed.data, official.organizationId);
  if (project === undefined) {
    throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
  }

  return { official, project };
}

// Router mounted at /api/v1/projects/:projectId/work-packages
export const projectWorkPackagesRouter: Router = Router({ mergeParams: true });

// GET /api/v1/projects/:projectId/work-packages
projectWorkPackagesRouter.get("/", requirePermission("workpackage:read"), async (request, response, next) => {
  try {
    const { project } = await loadProject(request, routeParam(request, "projectId"));
    const includeDeleted = request.query.includeDeleted === "true";

    const [{ packages, summary }, analyses, history] = await Promise.all([
      listWorkPackages(project.id, includeDeleted),
      listWorkPackageAnalyses(project.id),
      listWorkPackageHistory(project.id),
    ]);

    response.json({
      data: {
        projectStatus: project.status,
        packages,
        summary,
        analyses,
        history,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/projects/:projectId/work-packages/generate
projectWorkPackagesRouter.post("/generate", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const { official, project } = await loadProject(request, routeParam(request, "projectId"));

    if (
      project.status !== "REQUIREMENTS_CONFIRMED" &&
      project.status !== "WORK_PACKAGES_UNDER_REVIEW"
    ) {
      throw new ApiError(
        409,
        "INVALID_STATE_TRANSITION",
        "Work packages can only be generated when requirements are confirmed or under review.",
      );
    }

    const requirements = await listRequirements(project.id);
    const confirmedReqs = requirements
      .filter((r) => r.status === "ACCEPTED")
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        category: r.category,
        text: r.text,
        rationale: r.rationale,
      }));

    const analysisId = await createWorkPackageAnalysisRun(project.id, official.id);

    let aiResult;
    try {
      aiResult = await requestWorkPackageDecomposition({
        projectTitle: project.title,
        problemDescription: project.problemDescription,
        organizationName: official.organizationName,
        confirmedRequirements: confirmedReqs,
      });
      await completeWorkPackageAnalysisRun(analysisId, aiResult);
    } catch (aiError) {
      const msg = aiError instanceof Error ? aiError.message : "AI decomposition failed.";
      await markWorkPackageAnalysisRunFailed(analysisId, msg);
      throw aiError;
    }

    const createdPackages = await createAiGeneratedWorkPackages(
      project.id,
      analysisId,
      official.id,
      aiResult.work_packages,
    );

    response.status(201).json({
      data: {
        analysisId,
        packages: createdPackages,
        message: `Successfully generated ${createdPackages.length} work packages.`,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/projects/:projectId/work-packages/manual
projectWorkPackagesRouter.post("/manual", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const { official, project } = await loadProject(request, routeParam(request, "projectId"));

    const parsed = manualPackageSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError(parsed.error.issues, "Invalid manual work package data.");
    }

    const created = await createManualWorkPackage(project.id, official.id, {
      title: parsed.data.title,
      description: parsed.data.description,
      scope: parsed.data.scope,
      complexity: parsed.data.complexity as WorkPackageComplexity,
      priority: parsed.data.priority as WorkPackagePriority,
      estimatedCategory: parsed.data.estimatedCategory,
      deliverables: parsed.data.deliverables,
      notes: parsed.data.notes,
      requirementIds: parsed.data.requirementIds,
      dependencyIds: parsed.data.dependencyIds,
    });

    response.status(201).json({ data: created });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/projects/:projectId/work-packages/no-decomposition
projectWorkPackagesRouter.post("/no-decomposition", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const { official, project } = await loadProject(request, routeParam(request, "projectId"));

    const singlePackage = await createNoDecompositionWorkPackage(project.id, official.id);

    response.status(201).json({
      data: {
        package: singlePackage,
        projectStatus: "WORK_PACKAGES_CONFIRMED",
        message: "Project successfully proceeded with a single comprehensive procurement work package.",
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/projects/:projectId/work-packages/confirm
projectWorkPackagesRouter.post("/confirm", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const { official, project } = await loadProject(request, routeParam(request, "projectId"));

    const result = await validateAndConfirmWorkPackages(project.id, official.id);

    response.json({
      data: {
        ...result,
        message: "All work packages confirmed. Procurement project transitioned to WORK_PACKAGES_CONFIRMED.",
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/projects/:projectId/work-packages/reorder
projectWorkPackagesRouter.post("/reorder", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const { official, project } = await loadProject(request, routeParam(request, "projectId"));

    const parsed = reorderSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError(parsed.error.issues, "Invalid reorder payload.");
    }

    await reorderWorkPackages(project.id, parsed.data.orderedIds, official.id);

    response.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

// Standalone work packages router mounted at /api/v1/work-packages
export const directWorkPackagesRouter: Router = Router();

// GET /api/v1/work-packages/:id
directWorkPackagesRouter.get("/:id", requirePermission("workpackage:read"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const pkg = await findWorkPackageById(parsedId.data);
    if (!pkg) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const history = await listWorkPackageHistory(pkg.projectId, pkg.id);

    response.json({ data: { package: pkg, history } });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/work-packages/:id
directWorkPackagesRouter.put("/:id", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const parsedBody = updatePackageSchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw validationError(parsedBody.error.issues, "Invalid update payload.");
    }

    const official = getCurrentUser(request);
    const updated = await updateWorkPackage(parsedId.data, official.id, parsedBody.data);

    response.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/work-packages/:id (Soft delete)
directWorkPackagesRouter.delete("/:id", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const official = getCurrentUser(request);
    const reason = typeof request.body?.reason === "string" ? request.body.reason : undefined;

    await softDeleteWorkPackage(parsedId.data, official.id, reason);

    response.json({ data: { success: true, message: "Work package soft-deleted." } });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/work-packages/:id/accept
directWorkPackagesRouter.post("/:id/accept", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const official = getCurrentUser(request);
    const accepted = await acceptWorkPackage(parsedId.data, official.id);

    response.json({ data: accepted });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/work-packages/:id/reject
directWorkPackagesRouter.post("/:id/reject", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const parsedBody = rejectPackageSchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw validationError(parsedBody.error.issues, "A rejection reason is required.");
    }

    const official = getCurrentUser(request);
    const rejected = await rejectWorkPackage(parsedId.data, official.id, parsedBody.data.reason);

    response.json({ data: rejected });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/work-packages/:id/restore
directWorkPackagesRouter.post("/:id/restore", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const official = getCurrentUser(request);
    const restored = await restoreWorkPackage(parsedId.data, official.id);

    response.json({ data: restored });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/work-packages/:id/duplicate
directWorkPackagesRouter.post("/:id/duplicate", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const official = getCurrentUser(request);
    const duplicated = await duplicateWorkPackage(parsedId.data, official.id);

    response.status(201).json({ data: duplicated });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/work-packages/merge
directWorkPackagesRouter.post("/merge", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const parsed = mergeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError(parsed.error.issues, "Invalid merge parameters.");
    }

    const official = getCurrentUser(request);
    const merged = await mergeWorkPackages(
      parsed.data.projectId,
      parsed.data.packageIds,
      official.id,
      {
        title: parsed.data.title,
        description: parsed.data.description,
        scope: parsed.data.scope,
        complexity: parsed.data.complexity as WorkPackageComplexity,
        priority: parsed.data.priority as WorkPackagePriority,
        estimatedCategory: parsed.data.estimatedCategory,
        deliverables: parsed.data.deliverables,
        notes: parsed.data.notes,
      },
    );

    response.status(201).json({ data: merged });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/work-packages/:id/split
directWorkPackagesRouter.post("/:id/split", requirePermission("workpackage:manage"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const parsed = splitSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError(parsed.error.issues, "Invalid split configuration.");
    }

    const official = getCurrentUser(request);
    const splitPackages = await splitWorkPackage(
      parsedId.data,
      official.id,
      parsed.data.splits.map((s) => ({
        ...s,
        complexity: s.complexity as WorkPackageComplexity,
        priority: s.priority as WorkPackagePriority,
      })),
    );

    response.status(201).json({ data: { packages: splitPackages } });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/work-packages/:id/history
directWorkPackagesRouter.get("/:id/history", requirePermission("workpackage:read"), async (request, response, next) => {
  try {
    const id = routeParam(request, "id");
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const pkg = await findWorkPackageById(parsedId.data);
    if (!pkg) throw new ApiError(404, "NOT_FOUND", "Work package not found.");

    const history = await listWorkPackageHistory(pkg.projectId, pkg.id);
    response.json({ data: history });
  } catch (error) {
    next(error);
  }
});
