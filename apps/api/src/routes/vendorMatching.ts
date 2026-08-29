import { Router } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { normalizeWorkPackage } from "../matching/normalization.js";
import { runMatching } from "../matching/pipeline.js";
import {
  loadStoredRecommendations,
  toRecommendation,
  toVendorSummary,
} from "../matching/presentation.js";
import { loadCandidateVendors } from "../matching/retrieval.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  addToShortlist,
  findLatestMatchRun,
  findProjectContext,
  findScopedWorkPackage,
  listShortlist,
  removeFromShortlist,
  vendorProfileExists,
} from "../repositories/workPackageMatching.js";
import { findWorkPackageById } from "../repositories/workPackages.js";

/**
 * Government-facing work-package vendor matching.
 *
 * Mounted under `/api/v1`, so `requireAuth` in `index.ts` already applies and
 * every route declares its own permission on top of that. Nothing here reads an
 * organization, a role, a score or an eligibility verdict from the request: the
 * organization comes from the session and is applied in SQL, and every number
 * is computed server-side from stored supplier data.
 *
 * There is no vendor-facing route in this file, and `vendor:matching:read` is
 * held by no vendor role — a supplier cannot see who they were ranked against.
 */
export const vendorMatchingRouter: Router = Router({ mergeParams: true });

const uuidSchema = z.string().uuid();

const shortlistSchema = z.object({
  vendorProfileId: uuidSchema,
  reason: z.string().trim().min(3, "State why this supplier is being shortlisted.").max(1000).nullable().default(null),
});

// `mergeParams` widens route params to `string | string[]`; the schema rejects
// anything that is not a single uuid, so a repeated parameter 404s like any
// other malformed id.
function parseIdOr404(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }
  return parsed.data;
}

/**
 * Resolves the package within the caller's organization, or 404s. Every route
 * below starts here, so cross-organization access is impossible by omission
 * rather than by each handler remembering to check.
 */
async function scopedPackage(workPackageId: string, organizationId: string) {
  const scoped = await findScopedWorkPackage(workPackageId, organizationId);
  if (scoped === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }
  return scoped;
}

/**
 * The mandatory conditions this package imposes, derived the same way the
 * eligibility gate derives them.
 *
 * Served on the read as well as the run, so an official returning to a stored
 * ranking still sees the conditions that produced it. Deriving them here rather
 * than storing them on the run keeps one definition of what the package
 * requires — a second, stored copy could disagree with the gate.
 */
async function matchingRequirements(workPackageId: string, projectId: string) {
  const detail = await findWorkPackageById(workPackageId);
  const project = await findProjectContext(projectId);
  if (detail === undefined || project === undefined) return null;

  const normalized = normalizeWorkPackage({
    workPackage: detail,
    projectTitle: project.title,
    projectProblemDescription: project.problemDescription,
  });

  return {
    mandatoryCertifications: normalized.mandatoryCertifications,
    requiredRegions: normalized.requiredRegions,
    estimatedValueCeilingInr: normalized.estimatedValueCeilingInr,
    capabilityTerms: normalized.terms.slice(0, 30),
  };
}

/**
 * The work package as the matching page presents it: what is being bought, and
 * which of its requirements act as mandatory gates.
 */
async function packageContext(workPackageId: string) {
  const detail = await findWorkPackageById(workPackageId);
  if (detail === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }

  return {
    id: detail.id,
    projectId: detail.projectId,
    packageNumber: detail.packageNumber,
    title: detail.title,
    description: detail.description,
    scope: detail.scope,
    category: detail.estimatedCategory,
    complexity: detail.complexity,
    priority: detail.priority,
    status: detail.status,
    deliverables: detail.deliverables,
    requirements: detail.requirements.map((requirement) => ({
      id: requirement.id,
      kind: requirement.kind,
      category: requirement.category,
      text: requirement.text,
      status: requirement.status,
    })),
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * The last stored ranking, without recomputing. Revisiting a work package is a
 * read, not a re-run: the officer sees the same list they were looking at, and
 * the retrieval and embedding work is not repeated.
 */
vendorMatchingRouter.get(
  "/",
  requirePermission("vendor:matching:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parseIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const [workPackage, requirements, run, shortlist] = await Promise.all([
        packageContext(workPackageId),
        matchingRequirements(workPackageId, scoped.projectId),
        findLatestMatchRun(workPackageId),
        listShortlist(workPackageId),
      ]);

      const stored =
        run === undefined
          ? { recommendations: [], excluded: [] }
          : await loadStoredRecommendations(run.runId);

      response.json({
        data: {
          workPackage,
          matchingRequirements: requirements,
          run: run ?? null,
          recommendations: stored.recommendations,
          excluded: stored.excluded,
          shortlist,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Runs the pipeline: normalize, gate on eligibility, retrieve lexically and
 * semantically, rank, explain. This is "Find Suitable Vendors", and the same
 * route is the recalculation when supplier or requirement data has moved on.
 */
vendorMatchingRouter.post(
  "/",
  requirePermission("vendor:matching:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parseIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      const outcome = await runMatching({
        workPackageId,
        organizationId: user.organizationId,
        userId: user.id,
      });

      const [workPackage, shortlist] = await Promise.all([
        packageContext(workPackageId),
        listShortlist(workPackageId),
      ]);

      response.json({
        data: {
          workPackage,
          run: outcome.provenance,
          matchingRequirements: {
            mandatoryCertifications: outcome.workPackage.mandatoryCertifications,
            requiredRegions: outcome.workPackage.requiredRegions,
            estimatedValueCeilingInr: outcome.workPackage.estimatedValueCeilingInr,
            capabilityTerms: outcome.workPackage.terms.slice(0, 30),
          },
          recommendations: outcome.recommendations.map((ranked, index) =>
            toRecommendation(ranked, index + 1),
          ),
          excluded: outcome.excluded.map((ranked) => toRecommendation(ranked, null)),
          shortlist,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * One supplier, in the context of this work package.
 *
 * Deliberately not the whole capability profile: what an official needs when
 * deciding is the evidence bearing on this package. Contact details and the
 * supplier's private onboarding answers are not part of it.
 */
vendorMatchingRouter.get(
  "/:vendorProfileId",
  requirePermission("vendor:matching:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parseIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      const vendorProfileId = uuidSchema.safeParse(request.params.vendorProfileId);
      if (!vendorProfileId.success) {
        throw new ApiError(404, "NOT_FOUND", "The supplier was not found.");
      }

      // The supplier must have been assessed against this package. Without
      // this the route would serve any supplier's commercial record — past
      // clients, contract values, credential identifiers — to anyone holding
      // one work package id of their own, which is not what "this supplier, in
      // the context of this work package" means.
      const run = await findLatestMatchRun(workPackageId);
      const stored =
        run === undefined ? undefined : await loadStoredRecommendations(run.runId);
      const assessment = [
        ...(stored?.recommendations ?? []),
        ...(stored?.excluded ?? []),
      ].find((entry) => entry.vendor.vendorProfileId === vendorProfileId.data);

      if (assessment === undefined) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "This supplier has not been assessed against this work package. Run supplier matching first.",
        );
      }

      const vendors = await loadCandidateVendors([vendorProfileId.data]);
      const vendor = vendors.get(vendorProfileId.data);
      if (vendor === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The supplier was not found.");
      }

      response.json({
        data: {
          vendor: toVendorSummary(vendor),
          offerings: vendor.offerings,
          experience: vendor.experience,
          credentials: vendor.credentials,
          capacity: {
            teamSize: vendor.teamSize,
            governmentExperience: vendor.governmentExperience,
            governmentScaleReadiness: vendor.governmentScaleReadiness,
            deliveryCapability: vendor.deliveryCapability,
            deliveryModels: vendor.deliveryModels,
            minProjectValueInr: vendor.minProjectValueInr,
            typicalProjectValueInr: vendor.typicalProjectValueInr,
            maxProjectValueInr: vendor.maxProjectValueInr,
          },
          assessment,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Shortlist — the seam into Milestone 7.
// ---------------------------------------------------------------------------

vendorMatchingRouter.post(
  "/shortlist",
  requirePermission("vendor:shortlist:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parseIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      if (scoped.status !== "CONFIRMED") {
        throw new ApiError(
          409,
          "WORK_PACKAGE_NOT_CONFIRMED",
          "Suppliers can only be shortlisted against a confirmed work package.",
        );
      }

      const parsed = shortlistSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "The submitted details are not valid.",
          parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        );
      }

      if (!(await vendorProfileExists(parsed.data.vendorProfileId))) {
        throw new ApiError(404, "NOT_FOUND", "The supplier was not found.");
      }

      const { created, refusedBecause } = await addToShortlist({
        workPackageId,
        vendorProfileId: parsed.data.vendorProfileId,
        reason: parsed.data.reason,
        addedBy: user.id,
      });

      if (refusedBecause === "NOT_ASSESSED") {
        throw new ApiError(
          409,
          "SUPPLIER_NOT_ASSESSED",
          "This supplier has not been assessed against this work package. Run supplier matching before shortlisting.",
        );
      }

      if (refusedBecause === "NOT_ELIGIBLE") {
        throw new ApiError(
          409,
          "SUPPLIER_NOT_ELIGIBLE",
          "This supplier failed a mandatory requirement for this work package and cannot be shortlisted.",
        );
      }

      response.json({ data: { created, shortlist: await listShortlist(workPackageId) } });
    } catch (error) {
      next(error);
    }
  },
);

vendorMatchingRouter.delete(
  "/shortlist/:vendorProfileId",
  requirePermission("vendor:shortlist:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parseIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      const vendorProfileId = uuidSchema.safeParse(request.params.vendorProfileId);
      if (!vendorProfileId.success) {
        throw new ApiError(404, "NOT_FOUND", "The supplier was not found.");
      }

      const removed = await removeFromShortlist(workPackageId, vendorProfileId.data);
      if (!removed) {
        throw new ApiError(404, "NOT_FOUND", "The supplier is not on this shortlist.");
      }

      response.json({ data: { removed: true, shortlist: await listShortlist(workPackageId) } });
    } catch (error) {
      next(error);
    }
  },
);
