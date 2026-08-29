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
import { createNotification } from "../repositories/vendorNotifications.js";
import { recordWorkPackageHistory } from "../repositories/workPackageHistory.js";
import {
  createInvitation,
  findScopedInvitation,
  listInvitationsForWorkPackage,
  withdrawInvitation,
} from "../repositories/workPackageInvitations.js";
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

/**
 * An invitation carries whatever instructions the official wants the supplier
 * to have, and the date a response is expected by. Both are optional: an
 * invitation with neither is still a complete invitation, and inventing a
 * default deadline would put a date in front of the supplier that no official
 * chose.
 */
const invitationSchema = z.object({
  vendorProfileId: uuidSchema,
  message: z.string().trim().min(1).max(2000).nullable().default(null),
  responseDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date in YYYY-MM-DD form.")
    .nullable()
    .default(null),
});

const withdrawalSchema = z.object({
  reason: z.string().trim().min(3, "State why this invitation is being withdrawn.").max(1000).nullable().default(null),
});

/**
 * A response date as it should appear in prose. The wire format is the ISO day
 * because that is what a machine reads back; a notification is read by a
 * person.
 */
function readableDay(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || day === undefined) return isoDay;

  // Constructed in local time from the parts, so the day cannot shift (D77).
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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

      const [workPackage, requirements, run, shortlist, invitations] = await Promise.all([
        packageContext(workPackageId),
        matchingRequirements(workPackageId, scoped.projectId),
        findLatestMatchRun(workPackageId),
        listShortlist(workPackageId),
        listInvitationsForWorkPackage(workPackageId),
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
          invitations,
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

      const [workPackage, shortlist, invitations] = await Promise.all([
        packageContext(workPackageId),
        listShortlist(workPackageId),
        listInvitationsForWorkPackage(workPackageId),
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
          invitations,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Shortlist
// ---------------------------------------------------------------------------
//
// The shortlist is per work package, never per project and never per supplier.
// Marking a supplier against WP-01 says nothing about WP-02, which is the whole
// point of moving the matching unit to the work package in Milestone 6.

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

      const shortlist = await listShortlist(workPackageId);

      // Audited in the work package's own history, alongside the decisions that
      // produced the package, so the record of who acted and why is in one place
      // (D73). Only a state change is recorded: re-posting an entry that already
      // exists is not a new decision.
      if (created) {
        const entry = shortlist.find(
          (item) => item.vendorProfileId === parsed.data.vendorProfileId,
        );

        await recordWorkPackageHistory(
          scoped.projectId,
          workPackageId,
          user.id,
          "SHORTLISTED",
          null,
          {
            vendorProfileId: parsed.data.vendorProfileId,
            organizationName: entry?.organizationName ?? null,
            rankAtShortlist: entry?.rankAtShortlist ?? null,
            scoreAtShortlist: entry?.scoreAtShortlist ?? null,
          },
          parsed.data.reason,
        );
      }

      response.json({ data: { created, shortlist } });
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
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const vendorProfileId = uuidSchema.safeParse(request.params.vendorProfileId);
      if (!vendorProfileId.success) {
        throw new ApiError(404, "NOT_FOUND", "The supplier was not found.");
      }

      // Read before the delete, so the audit entry can name the supplier that
      // was removed rather than only its id.
      const before = (await listShortlist(workPackageId)).find(
        (item) => item.vendorProfileId === vendorProfileId.data,
      );

      const { removed, refusedBecause } = await removeFromShortlist(
        workPackageId,
        vendorProfileId.data,
      );

      if (refusedBecause === "INVITATION_OPEN") {
        throw new ApiError(
          409,
          "INVITATION_OPEN",
          "This supplier holds a live invitation for this work package. Withdraw the invitation before removing them from the shortlist.",
        );
      }

      if (!removed) {
        throw new ApiError(404, "NOT_FOUND", "The supplier is not on this shortlist.");
      }

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "SHORTLIST_REMOVED",
        {
          vendorProfileId: vendorProfileId.data,
          organizationName: before?.organizationName ?? null,
          reason: before?.reason ?? null,
        },
        null,
        null,
      );

      response.json({ data: { removed: true, shortlist: await listShortlist(workPackageId) } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------
//
// An invitation is the government act that makes a supplier aware of a work
// package it has been selected for. It is not a commitment and it is not a
// contract: Milestone 8's structured response is what follows it.
//
// Three preconditions, all enforced here and none of them in the browser:
//
//   1. The work package belongs to the caller's organization  - `scopedPackage`
//   2. The work package is CONFIRMED                          - below
//   3. The supplier is on this package's shortlist            - `createInvitation`
//
// The third is what makes "only shortlisted suppliers are invitable" true, and
// it is checked by resolving the shortlist row rather than by trusting an id
// from the request. The shortlist already refused ineligible suppliers, so
// eligibility is enforced transitively and does not need a second copy of the
// rule here that could drift from the gate.

vendorMatchingRouter.get(
  "/invitations",
  requirePermission("vendor:matching:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parseIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      response.json({ data: await listInvitationsForWorkPackage(workPackageId) });
    } catch (error) {
      next(error);
    }
  },
);

vendorMatchingRouter.post(
  "/invitations",
  requirePermission("vendor:invitation:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parseIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      if (scoped.status !== "CONFIRMED") {
        throw new ApiError(
          409,
          "WORK_PACKAGE_NOT_CONFIRMED",
          "Suppliers can only be invited against a confirmed work package.",
        );
      }

      const parsed = invitationSchema.safeParse(request.body);
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

      const { invitation, refusedBecause } = await createInvitation({
        workPackageId,
        projectId: scoped.projectId,
        organizationId: user.organizationId,
        vendorProfileId: parsed.data.vendorProfileId,
        message: parsed.data.message,
        responseDeadline: parsed.data.responseDeadline,
        invitedBy: user.id,
      });

      if (refusedBecause === "NOT_SHORTLISTED") {
        throw new ApiError(
          409,
          "SUPPLIER_NOT_SHORTLISTED",
          "Only a supplier on this work package's shortlist can be invited. Shortlist them first.",
        );
      }

      if (refusedBecause === "ALREADY_INVITED" || invitation === undefined) {
        throw new ApiError(
          409,
          "INVITATION_ALREADY_OPEN",
          "This supplier already holds a live invitation for this work package. Withdraw it before issuing another.",
        );
      }

      // The supplier learns about this in the portal, through the notification
      // table registration, verification and document review already write to
      // (D74). No email, no background job, no second channel: the notification
      // is written in the request that created the invitation, so an invitation
      // that exists is an invitation the supplier can see.
      await createNotification({
        profileId: parsed.data.vendorProfileId,
        category: "INVITATION",
        title: "New procurement invitation",
        body:
          "Your organisation has been invited to respond to " +
          `${scoped.packageNumber} - ${scoped.title}, part of ${scoped.projectTitle}, ` +
          `issued by ${user.organizationName}.` +
          (invitation.responseDeadline === null
            ? ""
            : ` A response is requested by ${readableDay(invitation.responseDeadline)}.`),
        linkPath: `/vendor/invitations/${invitation.id}`,
        invitationId: invitation.id,
      });

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "INVITED",
        null,
        {
          invitationId: invitation.id,
          vendorProfileId: invitation.vendorProfileId,
          organizationName: invitation.organizationName,
          responseDeadline: invitation.responseDeadline,
        },
        parsed.data.message,
      );

      response.status(201).json({
        data: {
          invitation,
          invitations: await listInvitationsForWorkPackage(workPackageId),
          shortlist: await listShortlist(workPackageId),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Withdraws an invitation the supplier has not yet answered.
 *
 * Not a delete. The invitation and the fact that it was withdrawn stay on the
 * record, and the supplier is told, because they were shown an invitation they
 * can no longer act on and are entitled to know why it went away.
 */
vendorMatchingRouter.post(
  "/invitations/:invitationId/withdraw",
  requirePermission("vendor:invitation:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parseIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const invitationId = uuidSchema.safeParse(request.params.invitationId);
      if (!invitationId.success) {
        throw new ApiError(404, "NOT_FOUND", "The invitation was not found.");
      }

      // Scoped by organization and then checked against the package in the URL,
      // so an invitation id from another department - or from another package in
      // this department - cannot be withdrawn through this route.
      const existing = await findScopedInvitation(invitationId.data, user.organizationId);
      if (existing === undefined || existing.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The invitation was not found.");
      }

      const parsed = withdrawalSchema.safeParse(request.body ?? {});
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

      const withdrawn = await withdrawInvitation({
        invitationId: invitationId.data,
        organizationId: user.organizationId,
        withdrawnBy: user.id,
        reason: parsed.data.reason,
      });

      if (!withdrawn) {
        throw new ApiError(
          409,
          "INVITATION_NOT_OPEN",
          `This invitation has already been ${existing.status.toLowerCase()} and cannot be withdrawn.`,
        );
      }

      await createNotification({
        profileId: existing.vendorProfileId,
        category: "INVITATION",
        title: "Procurement invitation withdrawn",
        body:
          `${user.organizationName} has withdrawn its invitation to ` +
          `${scoped.packageNumber} - ${scoped.title}.` +
          (parsed.data.reason === null ? "" : ` Reason: ${parsed.data.reason}`),
        linkPath: `/vendor/invitations/${invitationId.data}`,
        invitationId: invitationId.data,
      });

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "INVITATION_WITHDRAWN",
        { invitationId: invitationId.data, vendorProfileId: existing.vendorProfileId },
        null,
        parsed.data.reason,
      );

      response.json({
        data: {
          invitations: await listInvitationsForWorkPackage(workPackageId),
          shortlist: await listShortlist(workPackageId),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Supplier detail
// ---------------------------------------------------------------------------
//
// Registered last, and deliberately so. `/:vendorProfileId` is a single-segment
// wildcard, so Express would hand it every literal sibling declared after it —
// `/shortlist`, `/invitations` — and each would 404 on a uuid parse instead of
// reaching its own handler. Declaring the wildcard after the literals is what
// keeps the literal routes reachable.

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
