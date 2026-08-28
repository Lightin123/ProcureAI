import { Router } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  findDocumentContent,
  recordDocumentReview,
} from "../repositories/vendorDocuments.js";
import { createNotification } from "../repositories/vendorNotifications.js";
import {
  listVendorRegistry,
  recordVerificationDecision,
} from "../repositories/vendorProfiles.js";
import { readDocument } from "../vendor/documentStorage.js";
import { loadFullProfile } from "../vendor/profileService.js";

/**
 * Supplier verification, performed by the portal administration.
 *
 * This is the one place where organization scoping does not apply, and
 * deliberately so: a supplier belongs to its own vendor organization, and
 * verifying it is a platform-administration duty rather than a departmental
 * one. It is confined to `ADMIN`, which holds no procurement decision
 * permission, so the role that can verify a supplier is structurally unable to
 * award them anything (D60).
 */
export const vendorRegistryRouter: Router = Router();

const uuidSchema = z.uuid();

function parseIdOr404(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "The supplier record was not found.");
  }
  return parsed.data;
}

vendorRegistryRouter.get(
  "/",
  requirePermission("vendor:registry:read"),
  async (_request, response, next) => {
    try {
      response.json({ data: await listVendorRegistry() });
    } catch (error) {
      next(error);
    }
  },
);

vendorRegistryRouter.get(
  "/:id",
  requirePermission("vendor:registry:read"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const full = await loadFullProfile(id);

      response.json({
        data: {
          profile: full.profile,
          offerings: full.offerings,
          experience: full.experience,
          credentials: full.credentials,
          documents: full.documents,
          completion: full.completion,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

const verificationSchema = z.object({
  verificationState: z.enum(["PENDING", "VERIFIED", "REJECTED"]),
  notes: z.string().trim().max(2000).nullable().default(null),
});

vendorRegistryRouter.post(
  "/:id/verification",
  requirePermission("vendor:verification:manage"),
  async (request, response, next) => {
    try {
      const id = parseIdOr404(request.params.id);
      const parsed = verificationSchema.safeParse(request.body);
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

      if (parsed.data.verificationState === "REJECTED" && parsed.data.notes === null) {
        throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
          {
            field: "notes",
            message: "State what the supplier must correct before resubmitting.",
          },
        ]);
      }

      const user = getCurrentUser(request);
      const full = await loadFullProfile(id);

      await recordVerificationDecision({
        profileId: full.profile.id,
        verificationState: parsed.data.verificationState,
        notes: parsed.data.notes,
        verifiedBy: user.id,
      });

      const decided =
        parsed.data.verificationState === "VERIFIED"
          ? {
              title: "Capability profile verified",
              body:
                "Your capability profile has been verified. Verified suppliers rank higher in " +
                "opportunity matching and can be shortlisted by departments.",
            }
          : parsed.data.verificationState === "REJECTED"
            ? {
                title: "Changes requested on your capability profile",
                body: `The portal administration has asked for changes: ${parsed.data.notes ?? ""}`,
              }
            : {
                title: "Capability profile returned to review",
                body: "Your profile has been placed back in the verification queue.",
              };

      await createNotification({
        profileId: full.profile.id,
        category: "VERIFICATION",
        title: decided.title,
        body: decided.body,
        linkPath: "/vendor/profile",
      });

      response.json({ data: await loadFullProfile(id) });
    } catch (error) {
      next(error);
    }
  },
);

const documentReviewSchema = z.object({
  verificationState: z.enum(["PENDING", "VERIFIED", "REJECTED"]),
  notes: z.string().trim().max(1000).nullable().default(null),
});

vendorRegistryRouter.post(
  "/:id/documents/:documentId/review",
  requirePermission("vendor:verification:manage"),
  async (request, response, next) => {
    try {
      const profileId = parseIdOr404(request.params.id);
      const documentId = parseIdOr404(request.params.documentId);
      const parsed = documentReviewSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.");
      }

      // Confirms the document belongs to the profile in the path before the
      // update, so a document id cannot be reviewed under another supplier.
      if ((await findDocumentContent(profileId, documentId)) === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      const user = getCurrentUser(request);
      const reviewed = await recordDocumentReview({
        documentId,
        verificationState: parsed.data.verificationState,
        notes: parsed.data.notes,
        reviewedBy: user.id,
      });

      if (reviewed === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      await createNotification({
        profileId,
        category: "DOCUMENT",
        title: `Document reviewed: ${reviewed.title}`,
        body:
          parsed.data.verificationState === "VERIFIED"
            ? "The document has been verified."
            : parsed.data.verificationState === "REJECTED"
              ? `The document was not accepted. ${parsed.data.notes ?? ""}`
              : "The document has been returned to the review queue.",
        linkPath: "/vendor/profile",
      });

      response.json({ data: await loadFullProfile(profileId) });
    } catch (error) {
      next(error);
    }
  },
);

vendorRegistryRouter.get(
  "/:id/documents/:documentId/content",
  requirePermission("vendor:registry:read"),
  async (request, response, next) => {
    try {
      const profileId = parseIdOr404(request.params.id);
      const documentId = parseIdOr404(request.params.documentId);

      const reference = await findDocumentContent(profileId, documentId);
      if (reference === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      const bytes = await readDocument(reference.storageKey);
      response.setHeader("Content-Type", reference.mimeType);
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
