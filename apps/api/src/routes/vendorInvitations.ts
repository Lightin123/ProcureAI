import { Router } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { createNotification } from "../repositories/vendorNotifications.js";
import { recordWorkPackageHistory } from "../repositories/workPackageHistory.js";
import {
  findInvitationForVendor,
  listInvitationsForVendor,
  respondToInvitation,
} from "../repositories/workPackageInvitations.js";
import { loadProfileForUser } from "../vendor/profileService.js";

/**
 * Supplier-facing invitations.
 *
 * The mirror image of the government routes in `vendorMatching.ts`, and
 * deliberately a separate file rather than a mode of the same router: the two
 * sides of an invitation see different fields, hold different permissions and
 * have different failure modes, and one handler serving both is one `if` away
 * from serving a department's internal assessment to the supplier it assessed.
 *
 * The supplier's profile is resolved from the session on every request and
 * applied in SQL. No route here reads a vendor id, an organization id or a
 * profile id from the request — an invitation id is the only thing the browser
 * supplies, and it is only ever used as half of a predicate whose other half is
 * the session's own profile.
 *
 * What a supplier is never shown: the ranking, the scores, the dimension
 * breakdown, the eligibility verdict, the department's shortlist reason, or the
 * existence of any other supplier.
 */
export const vendorInvitationsRouter: Router = Router();

const uuidSchema = z.uuid();

const responseSchema = z.object({
  decision: z.enum(["ACCEPTED", "DECLINED"]),
  note: z.string().trim().min(1).max(2000).nullable().default(null),
});

function parseIdOr404(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "The invitation was not found.");
  }
  return parsed.data;
}

/**
 * Every invitation addressed to this supplier, newest first.
 *
 * Withdrawn and answered invitations stay in the list. A supplier is entitled to
 * see what it was asked and what it answered, and an invitation that vanishes
 * from the portal after a department withdraws it is a record the supplier
 * cannot check.
 */
vendorInvitationsRouter.get(
  "/",
  requirePermission("vendor:invitation:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      response.json({ data: await listInvitationsForVendor(profile.id) });
    } catch (error) {
      next(error);
    }
  },
);

vendorInvitationsRouter.get(
  "/:invitationId",
  requirePermission("vendor:invitation:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const invitationId = parseIdOr404(request.params.invitationId);

      const invitation = await findInvitationForVendor(invitationId, profile.id);
      if (invitation === undefined) {
        // Another supplier's invitation reads as absent, not as forbidden, so
        // enumerating ids cannot be used to learn that one exists.
        throw new ApiError(404, "NOT_FOUND", "The invitation was not found.");
      }

      response.json({ data: invitation });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Accept or decline.
 *
 *   INVITED -> ACCEPTED
 *           -> DECLINED
 *
 * Single-shot: the transition is a conditional UPDATE on `status = 'INVITED'`,
 * so a second answer changes nothing rather than overwriting the first. An
 * acceptance prepares the invitation for Milestone 8's structured response and
 * is not itself a proposal, a quotation or a commitment to supply.
 */
vendorInvitationsRouter.post(
  "/:invitationId/respond",
  requirePermission("vendor:invitation:respond"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const invitationId = parseIdOr404(request.params.invitationId);

      const parsed = responseSchema.safeParse(request.body);
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

      // A decline without a stated ground tells the department nothing it can
      // act on, and "why did they decline" is the question a gap analysis is
      // later built from. An acceptance needs no justification.
      if (parsed.data.decision === "DECLINED" && parsed.data.note === null) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "State why your organisation is declining this invitation.",
          [{ field: "note", message: "A reason is required when declining." }],
        );
      }

      const outcome = await respondToInvitation({
        invitationId,
        vendorProfileId: profile.id,
        respondedBy: user.id,
        decision: parsed.data.decision,
        note: parsed.data.note,
      });

      if ("refusedBecause" in outcome) {
        if (outcome.refusedBecause === "NOT_FOUND") {
          throw new ApiError(404, "NOT_FOUND", "The invitation was not found.");
        }

        throw new ApiError(
          409,
          "INVITATION_NOT_OPEN",
          `This invitation has already been ${outcome.current?.status.toLowerCase() ?? "closed"} ` +
            "and can no longer be answered.",
        );
      }

      const invitation = outcome.invitation;

      // The department reads the answer from the invitation itself; the history
      // entry is what makes the answer part of the work package's audit trail,
      // attributed to the supplier's own user rather than to the department.
      await recordWorkPackageHistory(
        invitation.projectId,
        invitation.workPackageId,
        user.id,
        parsed.data.decision === "ACCEPTED" ? "INVITATION_ACCEPTED" : "INVITATION_DECLINED",
        null,
        {
          invitationId: invitation.id,
          vendorProfileId: profile.id,
          organizationName: user.organizationName,
        },
        parsed.data.note,
      );

      // The supplier's own record of what it answered, in the same place every
      // other portal event appears. Nothing is sent to the department here:
      // notifications belong to suppliers, and the department's view of the
      // response is the invitation row it already reads.
      await createNotification({
        profileId: profile.id,
        category: "INVITATION",
        title:
          parsed.data.decision === "ACCEPTED"
            ? "Invitation accepted"
            : "Invitation declined",
        body:
          `Your organisation ${parsed.data.decision === "ACCEPTED" ? "accepted" : "declined"} ` +
          `the invitation to ${invitation.packageNumber} - ${invitation.packageTitle} ` +
          `from ${invitation.departmentName}.`,
        linkPath: `/vendor/invitations/${invitation.id}`,
        invitationId: invitation.id,
      });

      response.json({ data: invitation });
    } catch (error) {
      next(error);
    }
  },
);
