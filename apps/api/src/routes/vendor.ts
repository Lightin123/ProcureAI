import { Router } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  createDocument,
  deleteDocument,
  findDocumentContent,
  listDocuments,
} from "../repositories/vendorDocuments.js";
import {
  createNotification,
  countUnread,
  listNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "../repositories/vendorNotifications.js";
import {
  listInvitationsForVendor,
  summariseInvitations,
} from "../repositories/workPackageInvitations.js";
import {
  findOpportunity,
  listOpportunities,
  opportunityExists,
  setInterest,
  setSaved,
  summariseEngagements,
} from "../repositories/vendorOpportunities.js";
import {
  createCredential,
  createExperience,
  createOffering,
  deleteCredential,
  deleteExperience,
  deleteOffering,
} from "../repositories/vendorPortfolio.js";
import {
  saveAiInsights,
  submitProfileForVerification,
  updateProfileValues,
} from "../repositories/vendorProfiles.js";
import { requestCapabilityInsights } from "../services/aiClient.js";
import { visibleFields } from "../vendor/completion.js";
import {
  MAX_UPLOAD_BYTES,
  readDocument,
  removeDocument,
  storeDocument,
} from "../vendor/documentStorage.js";
import {
  COLLECTION_DEFINITIONS,
  ONBOARDING_STEPS,
  STEP_IDS,
} from "../vendor/onboardingSchema.js";
import {
  buildProfileSuggestions,
  opportunityTerms,
  scoreMatch,
  type MatchableOpportunity,
  type MatchableVendor,
} from "../vendor/matching.js";
import {
  loadFullProfile,
  loadProfileForUser,
  refreshDerivedState,
  type FullVendorProfile,
} from "../vendor/profileService.js";
import { mergeValues, profilePatchSchema, toProfileValues } from "../vendor/profileValues.js";
import {
  CLIENT_TYPE_VALUES,
  CREDENTIAL_KIND_VALUES,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_VALUES,
  INDIAN_STATES,
  INDUSTRIES,
  OFFERING_KIND_VALUES,
  CLIENT_TYPES,
  CREDENTIAL_KINDS,
  DELIVERY_MODELS,
  DEPLOYMENT_READINESS,
  ELIGIBILITY_FLAGS,
  GOVERNMENT_EXPERIENCE,
  GOVERNMENT_SCALE_READINESS,
  INNOVATION_STAGE,
  OFFERING_KINDS,
  ORGANIZATION_TYPES,
  SERVICE_COVERAGE,
  SOLUTION_NOVELTY,
  SOLUTION_TYPES,
} from "../vendor/taxonomy.js";

export const vendorRouter: Router = Router();

const uuidSchema = z.uuid();

function validationError(error: z.ZodError): ApiError {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    "The submitted details are not valid.",
    error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );
}

function parseOr400<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  return parsed.data;
}

function parseIdOr404(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
  }
  return parsed.data;
}

/** Every conditional question the schema declares, across all steps. */
const DECLARED_DYNAMIC_KEYS = new Set(
  ONBOARDING_STEPS.flatMap((step) =>
    step.groups.flatMap((group) =>
      group.fields
        .filter((field) => field.path.startsWith("dynamicAnswers."))
        .map((field) => field.path.slice("dynamicAnswers.".length)),
    ),
  ),
);

// ---------------------------------------------------------------------------
// Onboarding schema
// ---------------------------------------------------------------------------

/**
 * The form definition. Served rather than duplicated in the frontend, so the
 * questionnaire, its validation and the completion calculation can never
 * disagree about what is being asked (D58).
 */
vendorRouter.get(
  "/onboarding-schema",
  requirePermission("vendor:profile:read"),
  (_request, response) => {
    response.json({
      data: {
        steps: ONBOARDING_STEPS,
        collections: COLLECTION_DEFINITIONS,
        taxonomy: {
          industries: INDUSTRIES,
          solutionTypes: SOLUTION_TYPES,
          organizationTypes: ORGANIZATION_TYPES,
          deliveryModels: DELIVERY_MODELS,
          serviceCoverage: SERVICE_COVERAGE,
          governmentExperience: GOVERNMENT_EXPERIENCE,
          governmentScaleReadiness: GOVERNMENT_SCALE_READINESS,
          solutionNovelty: SOLUTION_NOVELTY,
          innovationStage: INNOVATION_STAGE,
          deploymentReadiness: DEPLOYMENT_READINESS,
          clientTypes: CLIENT_TYPES,
          credentialKinds: CREDENTIAL_KINDS,
          offeringKinds: OFFERING_KINDS,
          documentTypes: DOCUMENT_TYPES,
          eligibilityFlags: ELIGIBILITY_FLAGS,
          states: INDIAN_STATES,
        },
        upload: {
          maxBytes: MAX_UPLOAD_BYTES,
          acceptedTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
        },
      },
    });
  },
);

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function profileResponse(full: FullVendorProfile) {
  return {
    profile: full.profile,
    offerings: full.offerings,
    experience: full.experience,
    credentials: full.credentials,
    documents: full.documents,
    completion: full.completion,
  };
}

vendorRouter.get("/profile", requirePermission("vendor:profile:read"), async (request, response, next) => {
  try {
    const profile = await loadProfileForUser(getCurrentUser(request));
    response.json({ data: profileResponse(await loadFullProfile(profile.id)) });
  } catch (error) {
    next(error);
  }
});

const patchBodySchema = z.object({
  stepId: z.string().refine((value) => STEP_IDS.includes(value), "Unknown onboarding step."),
  values: profilePatchSchema,
});

vendorRouter.patch(
  "/profile",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const body = parseOr400(patchBodySchema, request.body);
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);

      // A conditional answer is only accepted if the schema declares that
      // question somewhere. Unknown keys are a client defect, not free-form
      // storage, and jsonb would otherwise accept anything.
      if (body.values.dynamicAnswers !== undefined) {
        const unknown = Object.keys(body.values.dynamicAnswers).filter(
          (key) => !DECLARED_DYNAMIC_KEYS.has(key),
        );
        if (unknown.length > 0) {
          throw new ApiError(
            400,
            "VALIDATION_ERROR",
            "The submitted details are not valid.",
            unknown.map((key) => ({
              field: `values.dynamicAnswers.${key}`,
              message: "This question is not part of the onboarding questionnaire.",
            })),
          );
        }
      }

      const merged = mergeValues(toProfileValues(profile), body.values);
      const minimum = merged.minProjectValueInr;
      const maximum = merged.maxProjectValueInr;
      if (
        typeof minimum === "number" &&
        typeof maximum === "number" &&
        minimum > maximum
      ) {
        throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
          {
            field: "values.maxProjectValueInr",
            message: "The maximum project value must be at least the minimum.",
          },
        ]);
      }

      await updateProfileValues(profile.id, body.values);
      const full = await refreshDerivedState(profile.id, body.stepId);

      response.json({ data: profileResponse(full) });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.post(
  "/profile/submit",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const full = await refreshDerivedState(profile.id);

      if (!full.completion.readyToSubmit) {
        throw new ApiError(
          409,
          "PROFILE_INCOMPLETE",
          "Every mandatory field must be answered before the profile can be submitted for verification.",
          full.completion.missingRequired.map((missing) => ({
            field: missing.path,
            message: missing.label,
          })),
        );
      }

      await submitProfileForVerification(profile.id);
      await createNotification({
        profileId: profile.id,
        category: "PROFILE",
        title: "Capability profile submitted for verification",
        body:
          "Your profile is with the portal administration for verification. You can continue to " +
          "edit it while it is under review; verification applies to the version at the time of the decision.",
        linkPath: "/vendor/profile",
      });

      response.json({ data: profileResponse(await loadFullProfile(profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Repeatable collections
// ---------------------------------------------------------------------------

const offeringSchema = z.object({
  kind: z.string().refine((value) => OFFERING_KIND_VALUES.includes(value)),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable().default(null),
  categories: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  tags: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  sectors: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

vendorRouter.post(
  "/profile/offerings",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const body = parseOr400(offeringSchema, request.body);
      const profile = await loadProfileForUser(getCurrentUser(request));
      await createOffering(profile.id, body);
      response.status(201).json({ data: profileResponse(await refreshDerivedState(profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.delete(
  "/profile/offerings/:id",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const profile = await loadProfileForUser(getCurrentUser(request));

      if (!(await deleteOffering(profile.id, id))) {
        throw new ApiError(404, "NOT_FOUND", "The entry was not found.");
      }

      response.json({ data: profileResponse(await refreshDerivedState(profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

const experienceSchema = z.object({
  title: z.string().trim().min(3).max(200),
  clientName: z.string().trim().max(200).nullable().default(null),
  clientType: z
    .string()
    .refine((value) => CLIENT_TYPE_VALUES.includes(value))
    .nullable()
    .default(null),
  sector: z.string().trim().max(150).nullable().default(null),
  description: z.string().trim().max(3000).nullable().default(null),
  outcome: z.string().trim().max(2000).nullable().default(null),
  contractValueInr: z.number().min(0).max(999_999_999_999).nullable().default(null),
  startYear: z.number().int().min(1900).max(2100).nullable().default(null),
  endYear: z.number().int().min(1900).max(2100).nullable().default(null),
  referenceUrl: z.union([z.url(), z.literal(""), z.null()]).default(null),
});

vendorRouter.post(
  "/profile/experience",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const body = parseOr400(experienceSchema, request.body);

      if (
        body.startYear !== null &&
        body.endYear !== null &&
        body.endYear < body.startYear
      ) {
        throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
          { field: "endYear", message: "The end year cannot precede the start year." },
        ]);
      }

      const profile = await loadProfileForUser(getCurrentUser(request));
      await createExperience(profile.id, {
        ...body,
        referenceUrl: body.referenceUrl === "" ? null : body.referenceUrl,
      });
      response.status(201).json({ data: profileResponse(await refreshDerivedState(profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.delete(
  "/profile/experience/:id",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const profile = await loadProfileForUser(getCurrentUser(request));

      if (!(await deleteExperience(profile.id, id))) {
        throw new ApiError(404, "NOT_FOUND", "The entry was not found.");
      }

      response.json({ data: profileResponse(await refreshDerivedState(profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Provide the date as YYYY-MM-DD.")
  .nullable()
  .default(null);

const credentialSchema = z.object({
  kind: z.string().refine((value) => CREDENTIAL_KIND_VALUES.includes(value)),
  name: z.string().trim().min(2).max(200),
  issuingAuthority: z.string().trim().max(200).nullable().default(null),
  identifier: z.string().trim().max(120).nullable().default(null),
  issuedOn: isoDateSchema,
  validUntil: isoDateSchema,
  notes: z.string().trim().max(1000).nullable().default(null),
});

vendorRouter.post(
  "/profile/credentials",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const body = parseOr400(credentialSchema, request.body);
      const profile = await loadProfileForUser(getCurrentUser(request));
      await createCredential(profile.id, body);
      response.status(201).json({ data: profileResponse(await refreshDerivedState(profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.delete(
  "/profile/credentials/:id",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const profile = await loadProfileForUser(getCurrentUser(request));

      if (!(await deleteCredential(profile.id, id))) {
        throw new ApiError(404, "NOT_FOUND", "The entry was not found.");
      }

      response.json({ data: profileResponse(await refreshDerivedState(profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Compliance documents
// ---------------------------------------------------------------------------

const documentUploadSchema = z.object({
  documentType: z.string().refine((value) => DOCUMENT_TYPE_VALUES.includes(value)),
  title: z.string().trim().min(2).max(200),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  content: z.string().min(1),
  referenceNumber: z.string().trim().max(120).nullable().default(null),
  issuedOn: isoDateSchema,
  validUntil: isoDateSchema,
});

vendorRouter.get(
  "/profile/documents",
  requirePermission("vendor:profile:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      response.json({ data: await listDocuments(profile.id) });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.post(
  "/profile/documents",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const body = parseOr400(documentUploadSchema, request.body);
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);

      const stored = await storeDocument({ base64: body.content, mimeType: body.mimeType });

      const document = await createDocument(profile.id, {
        documentType: body.documentType,
        title: body.title,
        // The uploader's filename is recorded for display only; the bytes are
        // stored under a generated key.
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        referenceNumber: body.referenceNumber,
        issuedOn: body.issuedOn,
        validUntil: body.validUntil,
        uploadedBy: user.id,
      });

      await refreshDerivedState(profile.id, "compliance");
      response.status(201).json({ data: document });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.get(
  "/profile/documents/:id/content",
  requirePermission("vendor:profile:read"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const profile = await loadProfileForUser(getCurrentUser(request));

      const reference = await findDocumentContent(profile.id, id);
      if (reference === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      const bytes = await readDocument(reference.storageKey);
      response.setHeader("Content-Type", reference.mimeType);
      // Never inline: a stored file is untrusted content and must not be
      // rendered in the portal's own origin.
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${reference.fileName.replace(/["\\]/g, "")}"`,
      );
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.send(bytes);
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.delete(
  "/profile/documents/:id",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const profile = await loadProfileForUser(getCurrentUser(request));

      const storageKey = await deleteDocument(profile.id, id);
      if (storageKey === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      await removeDocument(storageKey);
      await refreshDerivedState(profile.id, "compliance");
      response.json({ data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

/** The published fields an opportunity is matched on. */
function matchable(opportunity: {
  title: string;
  problemDescription: string;
  summary: string;
  requirements: ReadonlyArray<{ text: string }>;
}): MatchableOpportunity {
  return {
    title: opportunity.title,
    problemDescription: opportunity.problemDescription,
    opportunitySummary: opportunity.summary,
    requirementTexts: opportunity.requirements.map((item) => item.text),
  };
}

function matchableVendor(full: FullVendorProfile): MatchableVendor {
  return {
    keywords: full.profile.capabilityKeywords,
    industries: full.profile.industries,
    sectorsServed: full.profile.sectorsServed,
    solutionTypes: full.profile.solutionTypes,
    serviceCoverage: full.profile.serviceCoverage,
    governmentExperience: full.profile.governmentExperience,
    governmentScaleReadiness: full.profile.governmentScaleReadiness,
    verificationState: full.profile.verificationState,
    completionPercentage: full.profile.completionPercentage,
    minProjectValueInr: full.profile.minProjectValueInr,
    maxProjectValueInr: full.profile.maxProjectValueInr,
  };
}

vendorRouter.get(
  "/opportunities",
  requirePermission("vendor:opportunity:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const full = await loadFullProfile(profile.id);
      const opportunities = await listOpportunities(profile.id);
      const vendor = matchableVendor(full);

      const matched = opportunities
        .map((opportunity) => ({
          ...opportunity,
          match: scoreMatch(matchable(opportunity), vendor),
        }))
        .sort((left, right) => right.match.score - left.match.score);

      response.json({ data: matched });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.get(
  "/opportunities/:id",
  requirePermission("vendor:opportunity:read"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const profile = await loadProfileForUser(getCurrentUser(request));
      const full = await loadFullProfile(profile.id);

      const opportunity = await findOpportunity(profile.id, id);
      if (opportunity === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The opportunity was not found.");
      }

      const match = scoreMatch(matchable(opportunity), matchableVendor(full));

      response.json({ data: { ...opportunity, match } });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.post(
  "/opportunities/:id/save",
  requirePermission("vendor:opportunity:engage"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const body = parseOr400(z.object({ saved: z.boolean() }), request.body);
      const profile = await loadProfileForUser(getCurrentUser(request));

      if (!(await opportunityExists(id))) {
        throw new ApiError(404, "NOT_FOUND", "The opportunity was not found.");
      }

      await setSaved(profile.id, id, body.saved);
      response.json({ data: { saved: body.saved } });
    } catch (error) {
      next(error);
    }
  },
);

const interestSchema = z.object({
  withdraw: z.boolean().default(false),
  message: z.string().trim().max(2000).nullable().default(null),
});

/**
 * An expression of interest, not a proposal. It records that a supplier wants
 * to be considered; RFI and proposal collection are a later milestone, and
 * nothing here evaluates or ranks the response.
 */
vendorRouter.post(
  "/opportunities/:id/interest",
  requirePermission("vendor:opportunity:engage"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const body = parseOr400(interestSchema, request.body);
      const profile = await loadProfileForUser(getCurrentUser(request));
      const full = await loadFullProfile(profile.id);

      if (!(await opportunityExists(id))) {
        throw new ApiError(404, "NOT_FOUND", "The opportunity was not found.");
      }

      if (!body.withdraw && full.profile.status === "DRAFT") {
        throw new ApiError(
          409,
          "PROFILE_NOT_SUBMITTED",
          "Submit your capability profile for verification before expressing interest in an opportunity.",
        );
      }

      await setInterest({
        vendorProfileId: profile.id,
        projectId: id,
        interestState: body.withdraw ? "WITHDRAWN" : "SUBMITTED",
        message: body.withdraw ? null : body.message,
      });

      response.json({ data: { interestState: body.withdraw ? "WITHDRAWN" : "SUBMITTED" } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

vendorRouter.get(
  "/notifications",
  requirePermission("vendor:profile:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      response.json({ data: await listNotifications(profile.id) });
    } catch (error) {
      next(error);
    }
  },
);

vendorRouter.post(
  "/notifications/read",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      await markNotificationsRead(profile.id);
      response.json({ data: { read: true, unreadCount: 0 } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Marks one notification read — what opening a notification does.
 *
 * The id is the only thing the browser supplies, and it is applied together
 * with the session's own profile in a single UPDATE. A notification belonging
 * to another supplier matches no row and reads back as absent, so an id
 * harvested from anywhere is not enough to touch it.
 */
vendorRouter.post(
  "/notifications/:notificationId/read",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const notificationId = parseIdOr404(request.params.notificationId);

      const marked = await markNotificationRead(profile.id, notificationId);
      if (!marked) {
        throw new ApiError(404, "NOT_FOUND", "The notification was not found.");
      }

      response.json({ data: { read: true, unreadCount: await countUnread(profile.id) } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * The header's badge: the unread count and the few most recent notifications.
 *
 * Separate from the dashboard because the header is on every page of the portal
 * and must not pull the whole workspace — the profile, the matched
 * opportunities and the AI suggestions — to render a number.
 */
vendorRouter.get(
  "/notifications/summary",
  requirePermission("vendor:profile:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const [unreadCount, notifications, invitations] = await Promise.all([
        countUnread(profile.id),
        listNotifications(profile.id, 6),
        summariseInvitations(profile.id),
      ]);

      response.json({
        data: { unreadCount, notifications, awaitingResponse: invitations.awaitingResponse },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// AI capability insights
// ---------------------------------------------------------------------------

/**
 * Advisory only. The insights are stored on the profile and displayed to the
 * vendor; nothing in matching, verification or eligibility reads them back, so
 * a model that writes something optimistic cannot advantage a supplier.
 */
vendorRouter.post(
  "/profile/insights",
  requirePermission("vendor:profile:manage"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const full = await refreshDerivedState(profile.id);

      if (full.profile.capabilityDocument === null || full.completion.percentage < 25) {
        throw new ApiError(
          409,
          "PROFILE_TOO_SPARSE",
          "Complete more of your capability profile before requesting an assessment. " +
            "There is not yet enough recorded to assess.",
        );
      }

      const opportunities = await listOpportunities(profile.id);

      const insights = await requestCapabilityInsights({
        organizationName: full.profile.legalName ?? full.profile.organizationName,
        capabilityDocument: full.profile.capabilityDocument,
        industries: full.profile.industries,
        solutionTypes: full.profile.solutionTypes,
        completionPercentage: full.completion.percentage,
        openOpportunityTitles: opportunities.slice(0, 10).map((item) => item.title),
      });

      await saveAiInsights(profile.id, insights, insights.model);
      response.json({ data: { insights, model: insights.model } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * One request that assembles the vendor workspace: profile state, verification
 * state, matched opportunities, derived improvement suggestions, notifications
 * and engagement counts. Assembled server-side so the dashboard does not have
 * to make six calls and reconcile them.
 */
vendorRouter.get(
  "/dashboard",
  requirePermission("vendor:profile:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const full = await loadFullProfile(profile.id);
      const vendor = matchableVendor(full);

      const opportunities = await listOpportunities(profile.id);

      const scored = opportunities
        .map((opportunity) => {
          const subject = matchable(opportunity);
          return {
            opportunity,
            match: scoreMatch(subject, vendor),
            terms: opportunityTerms(subject),
          };
        })
        .sort((left, right) => right.match.score - left.match.score);

      const vendorKeywords = new Set(full.profile.capabilityKeywords);
      const unmatchedTerms = scored
        .slice(0, 5)
        .flatMap((item) => item.terms)
        .filter((term) => !vendorKeywords.has(term));

      // Terms an opportunity repeats are more likely to be a real capability
      // gap than a single incidental word.
      const termFrequency = new Map<string, number>();
      for (const term of unmatchedTerms) {
        termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
      }
      const gapTerms = [...termFrequency.entries()]
        .filter(([, count]) => count >= 2)
        .sort((left, right) => right[1] - left[1])
        .map(([term]) => term);

      const suggestions = buildProfileSuggestions({
        vendor,
        missingRequired: full.completion.missingRequired,
        offeringCount: full.offerings.length,
        experienceCount: full.experience.length,
        credentialCount: full.credentials.length,
        documentCount: full.documents.length,
        unmatchedOpportunityTerms: gapTerms,
      });

      const [notifications, unreadCount, engagements, invitations] = await Promise.all([
        listNotifications(profile.id, 8),
        countUnread(profile.id),
        summariseEngagements(profile.id),
        summariseInvitations(profile.id),
      ]);

      const deadlines = opportunities
        .filter((item) => item.responseDeadline !== null)
        .sort((left, right) =>
          (left.responseDeadline ?? "").localeCompare(right.responseDeadline ?? ""),
        )
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          title: item.title,
          referenceNumber: item.referenceNumber,
          responseDeadline: item.responseDeadline,
        }));

      response.json({
        data: {
          profile: {
            id: full.profile.id,
            organizationName: full.profile.organizationName,
            legalName: full.profile.legalName,
            headline: full.profile.headline,
            status: full.profile.status,
            verificationState: full.profile.verificationState,
            verificationNotes: full.profile.verificationNotes,
            completionPercentage: full.completion.percentage,
            industries: full.profile.industries,
            solutionTypes: full.profile.solutionTypes,
            aiInsights: full.profile.aiInsights,
            aiInsightsAt: full.profile.aiInsightsAt,
            aiInsightsModel: full.profile.aiInsightsModel,
            submittedAt: full.profile.submittedAt,
          },
          completion: full.completion,
          counts: {
            offerings: full.offerings.length,
            experience: full.experience.length,
            credentials: full.credentials.length,
            documents: full.documents.length,
            pendingDocuments: full.documents.filter(
              (document) => document.verificationState === "PENDING",
            ).length,
            openOpportunities: opportunities.length,
            savedOpportunities: engagements.savedCount,
            interestSubmitted: engagements.interestCount,
            unreadNotifications: unreadCount,
            invitations: invitations.total,
            invitationsAwaitingResponse: invitations.awaitingResponse,
            invitationsAccepted: invitations.accepted,
          },
          recommendedOpportunities: scored.slice(0, 5).map((item) => ({
            ...item.opportunity,
            match: item.match,
          })),
          savedOpportunities: opportunities.filter((item) => item.saved).slice(0, 5),
          submissions: opportunities
            .filter((item) => item.interestState !== "NONE")
            .map((item) => ({
              id: item.id,
              title: item.title,
              referenceNumber: item.referenceNumber,
              departmentName: item.departmentName,
              interestState: item.interestState,
              interestAt: item.interestAt,
            })),
          upcomingDeadlines: deadlines,
          suggestions,
          notifications,
          // The open ones only. A dashboard is a call to action, and an
          // invitation that has already been answered is not one; the full
          // history lives on the invitations page.
          openInvitations: (await listInvitationsForVendor(profile.id))
            .filter((invitation) => invitation.status === "INVITED")
            .slice(0, 5),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * The fields the schema is currently asking this vendor, given their own
 * answers. Used by the portal's review step to render only what was asked.
 */
vendorRouter.get(
  "/profile/visible-fields",
  requirePermission("vendor:profile:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const fields = visibleFields(toProfileValues(profile));
      response.json({
        data: fields.map((field) => ({
          stepId: field.stepId,
          groupId: field.groupId,
          path: field.path,
          label: field.label,
          required: field.required === true,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);
