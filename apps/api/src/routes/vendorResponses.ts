import { Router } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { findConfigById, listQuestions } from "../repositories/responseConfigs.js";
import {
  answerAsVendor,
  countOpenGovernmentClarifications,
  createVendorClarification,
  listClarifications,
} from "../repositories/responseClarifications.js";
import {
  createResponseDocument,
  deleteResponseDocument,
  findVendorDocumentContent,
  listResponseDocuments,
} from "../repositories/responseDocuments.js";
import { createNotification } from "../repositories/vendorNotifications.js";
import { recordWorkPackageHistory } from "../repositories/workPackageHistory.js";
import {
  findVendorResponse,
  listQuestionAnswers,
  listRequirementAnswers,
  listResponsesForVendor,
  openResponse,
  saveResponseDraft,
  submitResponse,
  touchResponse,
  upsertQuestionAnswer,
  upsertRequirementAnswer,
  withdrawResponse,
  type ResponseValues,
  type VendorResponseDetail,
} from "../repositories/workPackageResponses.js";
import { listConfirmedRequirementsForPackage } from "../repositories/workPackages.js";
import { evaluateResponseCompleteness } from "../responses/completeness.js";
import {
  RESPONSE_FIELDS,
  RESPONSE_SECTIONS,
  RESPONSE_TYPE_LABELS,
  REQUIREMENT_COMPLIANCE,
  REQUIREMENT_COMPLIANCE_LABELS,
  isEditableStatus,
  validateQuestionAnswer,
} from "../responses/schema.js";
import { MAX_UPLOAD_BYTES, readDocument, removeDocument, storeDocument } from "../vendor/documentStorage.js";
import { loadProfileForUser } from "../vendor/profileService.js";

/**
 * Supplier-facing structured responses.
 *
 * The mirror image of `workPackageResponses.ts`, and deliberately a separate
 * file rather than a mode of it (D76): the two sides see different fields, hold
 * different permissions and have different failure modes, and one handler
 * serving both is one `if` away from serving a department's internal view to
 * the supplier it is assessing.
 *
 * The supplier's profile is resolved from the session on every request and
 * applied in SQL. No route here reads a vendor id, an organization id or a
 * profile id from the request: a response id is the only thing the browser
 * supplies, and it is only ever used as half of a predicate whose other half is
 * the session's own profile.
 *
 * What a supplier is never shown: which official is reviewing, how many other
 * suppliers responded, any rank, score or assessment. Those columns are not in
 * the queries this file calls.
 */
export const vendorResponsesRouter: Router = Router();

const uuidSchema = z.string().uuid();

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
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function parseResponseIdOr404(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "The response was not found.");
  }
  return parsed.data;
}

/**
 * What the supplier is told about the department's configuration.
 *
 * The terms it is being asked to respond to, and nothing about the department's
 * own handling of them: not who configured it, not who opened it, not when the
 * department last edited it.
 */
function vendorConfigView(config: {
  responseType: string;
  status: string;
  title: string | null;
  instructions: string | null;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  sections: Record<string, string>;
  allowClarifications: boolean;
  allowDocuments: boolean;
  documentsRequired: boolean;
}) {
  return {
    responseType: config.responseType,
    responseTypeLabel:
      RESPONSE_TYPE_LABELS[config.responseType as keyof typeof RESPONSE_TYPE_LABELS] ??
      config.responseType,
    status: config.status,
    title: config.title,
    instructions: config.instructions,
    responseDeadline: config.responseDeadline,
    deadlinePassed: config.deadlinePassed,
    sections: config.sections,
    allowClarifications: config.allowClarifications,
    allowDocuments: config.allowDocuments,
    documentsRequired: config.documentsRequired,
  };
}

/**
 * Validates a partial draft against the field catalogue.
 *
 * A key the request supplies is looked up in the catalogue and refused if it is
 * not there, so a request cannot name a column that is not an answer field. The
 * type checks mirror the CHECK constraints on the table, which turns a
 * constraint violation into an explanation the supplier can act on.
 */
function parseDraftValues(input: unknown): ResponseValues {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
      { field: "values", message: "A set of answers is expected." },
    ]);
  }

  const values: ResponseValues = {};
  const problems: Array<{ field: string; message: string }> = [];

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const field = RESPONSE_FIELDS.get(key);
    if (field === undefined) {
      problems.push({ field: `values.${key}`, message: "This is not a response field." });
      continue;
    }

    if (raw === null || raw === undefined) {
      values[key] = null;
      continue;
    }

    switch (field.type) {
      case "TEXT":
      case "LONG_TEXT": {
        if (typeof raw !== "string") {
          problems.push({ field: `values.${key}`, message: "Written text is expected." });
          break;
        }
        const trimmed = raw.trim();
        if (field.maxLength !== undefined && trimmed.length > field.maxLength) {
          problems.push({
            field: `values.${key}`,
            message: `Keep this to ${field.maxLength} characters or fewer.`,
          });
          break;
        }
        // An emptied field is cleared rather than stored as an empty string, so
        // "present" means the same thing to the completeness check whether the
        // supplier never filled it in or deleted what it wrote.
        values[key] = trimmed === "" ? null : trimmed;
        break;
      }

      case "NUMBER": {
        if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
          problems.push({ field: `values.${key}`, message: "A whole number above zero is expected." });
          break;
        }
        values[key] = raw;
        break;
      }

      case "MONEY": {
        if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
          problems.push({
            field: `values.${key}`,
            message: "An amount in rupees, as a whole number, is expected.",
          });
          break;
        }
        values[key] = raw;
        break;
      }

      case "DATE": {
        if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          problems.push({
            field: `values.${key}`,
            message: "Use a calendar date in YYYY-MM-DD form.",
          });
          break;
        }
        values[key] = raw;
        break;
      }

      case "BOOLEAN": {
        if (typeof raw !== "boolean") {
          problems.push({ field: `values.${key}`, message: "Yes or no is expected." });
          break;
        }
        values[key] = raw;
        break;
      }
    }
  }

  if (problems.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", problems);
  }

  return values;
}

/** Resolves a response owned by the signed-in supplier, or 404s. */
async function loadOwnResponse(
  responseId: string,
  vendorProfileId: string,
): Promise<VendorResponseDetail> {
  const detail = await findVendorResponse(responseId, vendorProfileId);
  if (detail === undefined) {
    // Another supplier's response reads as absent, not as forbidden, so
    // enumerating ids cannot be used to learn that one exists.
    throw new ApiError(404, "NOT_FOUND", "The response was not found.");
  }
  return detail;
}

/**
 * Whether the supplier may still write to this response.
 *
 * Two conditions, and the second is why this is a function rather than a check
 * on the status alone: the department's collection must still be open, *or* the
 * department must have asked this supplier for a clarification. A department
 * that requests a clarification after closing collection has asked for
 * something, and refusing the reply would make its own request unanswerable.
 */
function assertWritable(detail: VendorResponseDetail): void {
  if (!isEditableStatus(detail.status)) {
    throw new ApiError(
      409,
      "RESPONSE_NOT_EDITABLE",
      detail.status === "WITHDRAWN"
        ? "This response has been withdrawn and can no longer be changed."
        : "This response has been submitted and can no longer be changed.",
    );
  }

  if (detail.configStatus !== "OPEN" && detail.status !== "CLARIFICATION_REQUESTED") {
    throw new ApiError(
      409,
      "RESPONSE_CLOSED",
      "The department has closed this response. No further changes can be made.",
    );
  }
}

/**
 * Everything the supplier needs to draft, review and submit: the terms, the
 * requirements to answer, what it has written so far, and how much of what is
 * required is still missing.
 */
async function buildWorkspace(detail: VendorResponseDetail) {
  const config = await findConfigById(detail.configId);
  if (config === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The response was not found.");
  }

  const [questions, requirements, requirementAnswers, questionAnswers, documents, clarifications] =
    await Promise.all([
      listQuestions(config.id),
      listConfirmedRequirementsForPackage(detail.workPackageId),
      listRequirementAnswers(detail.id),
      listQuestionAnswers(detail.id),
      listResponseDocuments(detail.id),
      listClarifications(detail.id),
    ]);

  const completeness = evaluateResponseCompleteness({
    sections: config.sections,
    documentsRequired: config.documentsRequired,
    allowDocuments: config.allowDocuments,
    values: detail.body as unknown as Record<string, unknown>,
    requirements,
    requirementAnswers,
    questions,
    questionAnswers,
    documentCount: documents.length,
  });

  return {
    response: detail,
    config: vendorConfigView(config),
    // The section catalogue is served with the workspace rather than fetched
    // separately, so the form the supplier fills in and the check the server
    // applies are built from the same declaration on the same request (D58).
    sections: RESPONSE_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      description: section.description,
      perRequirement: section.perRequirement === true,
      fields: section.fields,
    })),
    requirementCompliance: REQUIREMENT_COMPLIANCE.map((value) => ({
      value,
      label: REQUIREMENT_COMPLIANCE_LABELS[value],
    })),
    questions,
    requirements,
    requirementAnswers,
    questionAnswers,
    documents,
    clarifications,
    completeness,
    editable: isEditableStatus(detail.status) && (
      detail.configStatus === "OPEN" || detail.status === "CLARIFICATION_REQUESTED"
    ),
    upload: {
      maxBytes: MAX_UPLOAD_BYTES,
      acceptedTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    },
  };
}

// ---------------------------------------------------------------------------
// Listing and opening
// ---------------------------------------------------------------------------

vendorResponsesRouter.get(
  "/",
  requirePermission("vendor:response:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      response.json({ data: await listResponsesForVendor(profile.id) });
    } catch (error) {
      next(error);
    }
  },
);

const openSchema = z.object({ invitationId: uuidSchema });

/**
 * Opens the response for an accepted invitation, or resumes the existing draft.
 *
 * Idempotent by design: a supplier returning to the page gets its draft back
 * rather than an error, and cannot end up with two responses to one invitation.
 * Every precondition — the invitation is this supplier's, it was accepted, the
 * department's collection is open — is applied in SQL by the repository.
 */
vendorResponsesRouter.post(
  "/",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const body = parseOr400(openSchema, request.body);

      const outcome = await openResponse({
        invitationId: body.invitationId,
        vendorProfileId: profile.id,
        createdBy: user.id,
      });

      if ("refusedBecause" in outcome) {
        if (outcome.refusedBecause === "INVITATION_NOT_FOUND") {
          throw new ApiError(404, "NOT_FOUND", "The invitation was not found.");
        }
        if (outcome.refusedBecause === "INVITATION_NOT_ACCEPTED") {
          throw new ApiError(
            409,
            "INVITATION_NOT_ACCEPTED",
            "Accept the invitation before starting a response to it.",
          );
        }
        if (outcome.refusedBecause === "NOT_CONFIGURED") {
          throw new ApiError(
            409,
            "RESPONSE_NOT_CONFIGURED",
            "The department has not yet asked for a response to this work package.",
          );
        }
        throw new ApiError(
          409,
          "RESPONSE_NOT_OPEN",
          "The department is not currently accepting responses to this work package.",
        );
      }

      response.status(201).json({ data: await buildWorkspace(outcome.response) });
    } catch (error) {
      next(error);
    }
  },
);

vendorResponsesRouter.get(
  "/:responseId",
  requirePermission("vendor:response:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const responseId = parseResponseIdOr404(request.params.responseId);
      response.json({ data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

vendorResponsesRouter.patch(
  "/:responseId",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);
      assertWritable(detail);

      const values = parseDraftValues((request.body as { values?: unknown })?.values ?? {});

      const saved = await saveResponseDraft({
        responseId,
        vendorProfileId: profile.id,
        values,
      });

      // The UPDATE carries the editable-state predicate too, so this is the
      // case where the response was submitted between the check above and the
      // write. Reporting it rather than reporting success is the difference
      // between a saved draft and a lost one.
      if (!saved) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_EDITABLE",
          "This response can no longer be changed.",
        );
      }

      response.json({ data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

const requirementAnswerSchema = z.object({
  compliance: z.enum(REQUIREMENT_COMPLIANCE),
  answer: z.string().trim().min(1).max(8000).nullable().default(null),
  notes: z.string().trim().min(1).max(2000).nullable().default(null),
});

/**
 * Answers one confirmed requirement.
 *
 * The requirement is checked against this work package inside the write, so an
 * id from another package's requirement list matches nothing.
 */
vendorResponsesRouter.put(
  "/:responseId/requirements/:requirementId",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);
      assertWritable(detail);

      const requirementId = uuidSchema.safeParse(request.params.requirementId);
      if (!requirementId.success) {
        throw new ApiError(404, "NOT_FOUND", "The requirement was not found.");
      }

      const body = parseOr400(requirementAnswerSchema, request.body);

      const saved = await upsertRequirementAnswer({
        responseId,
        vendorProfileId: profile.id,
        requirementId: requirementId.data,
        compliance: body.compliance,
        answer: body.answer,
        notes: body.notes,
        updatedBy: user.id,
      });

      if (!saved) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requirement was not found on this work package.",
        );
      }

      response.json({ data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

/** Answers one of the department's custom questions. */
vendorResponsesRouter.put(
  "/:responseId/questions/:questionId",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);
      assertWritable(detail);

      const questionId = uuidSchema.safeParse(request.params.questionId);
      if (!questionId.success) {
        throw new ApiError(404, "NOT_FOUND", "The question was not found.");
      }

      const questions = await listQuestions(detail.configId);
      const question = questions.find((candidate) => candidate.id === questionId.data);
      if (question === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The question was not found.");
      }

      // The answer is checked against the shape the question declared, so the
      // stored value can never be one the question did not ask for.
      const checked = validateQuestionAnswer(question, (request.body as { value?: unknown })?.value);
      if (!checked.ok) {
        throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
          { field: "value", message: checked.message },
        ]);
      }

      const saved = await upsertQuestionAnswer({
        responseId,
        vendorProfileId: profile.id,
        questionId: question.id,
        value: checked.value,
        updatedBy: user.id,
      });

      if (!saved) {
        throw new ApiError(409, "RESPONSE_NOT_EDITABLE", "This response can no longer be changed.");
      }

      response.json({ data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Supporting documents
// ---------------------------------------------------------------------------

const documentUploadSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(1000).nullable().default(null),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  content: z.string().min(1),
});

vendorResponsesRouter.post(
  "/:responseId/documents",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);
      assertWritable(detail);

      const config = await findConfigById(detail.configId);
      if (config?.allowDocuments !== true) {
        throw new ApiError(
          409,
          "DOCUMENTS_NOT_ACCEPTED",
          "The department is not accepting supporting documents for this response.",
        );
      }

      const body = parseOr400(documentUploadSchema, request.body);

      // The single storage module decodes, size-limits and signature-checks the
      // upload; only the folder differs from a compliance document.
      const stored = await storeDocument({
        base64: body.content,
        mimeType: body.mimeType,
        folder: "response-documents",
      });

      const document = await createResponseDocument({
        responseId,
        vendorProfileId: profile.id,
        title: body.title,
        description: body.description,
        // The uploader's filename is recorded for display only; the bytes live
        // under a generated key.
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        uploadedBy: user.id,
      });

      if (document === undefined) {
        // The response stopped being editable between the check and the write.
        // The orphaned file is removed rather than left on disk.
        await removeDocument(stored.storageKey);
        throw new ApiError(409, "RESPONSE_NOT_EDITABLE", "This response can no longer be changed.");
      }

      await touchResponse(responseId);

      response.status(201).json({
        data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)),
      });
    } catch (error) {
      next(error);
    }
  },
);

vendorResponsesRouter.delete(
  "/:responseId/documents/:documentId",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);
      assertWritable(detail);

      const documentId = uuidSchema.safeParse(request.params.documentId);
      if (!documentId.success) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      const storageKey = await deleteResponseDocument({
        documentId: documentId.data,
        responseId,
        vendorProfileId: profile.id,
      });

      if (storageKey === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      await removeDocument(storageKey);
      await touchResponse(responseId);

      response.json({ data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

vendorResponsesRouter.get(
  "/:responseId/documents/:documentId/content",
  requirePermission("vendor:response:read"),
  async (request, response, next) => {
    try {
      const profile = await loadProfileForUser(getCurrentUser(request));
      const documentId = uuidSchema.safeParse(request.params.documentId);
      if (!documentId.success) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      const reference = await findVendorDocumentContent({
        documentId: documentId.data,
        vendorProfileId: profile.id,
      });

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

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

/**
 * Submits, or resubmits after a clarification.
 *
 * Everything mandatory is checked here, server-side, from the department's
 * stored configuration — the same computation the supplier's progress indicator
 * runs, so the two cannot disagree. A response missing anything required is
 * refused with the list of what is missing rather than accepted and flagged.
 *
 * The deadline is enforced at this point, from the calendar day, with no stored
 * expiry state and no job to write one (D30, D75). A response the department
 * itself asked to have clarified is exempt: refusing a reply the department
 * requested after its own deadline would make the request unanswerable.
 */
vendorResponsesRouter.post(
  "/:responseId/submit",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);
      assertWritable(detail);

      if (detail.deadlinePassed && detail.status !== "CLARIFICATION_REQUESTED") {
        throw new ApiError(
          409,
          "RESPONSE_DEADLINE_PASSED",
          `The date for responding to this work package (${detail.responseDeadline}) has passed. ` +
            "Contact the department if you believe this is in error.",
        );
      }

      const workspace = await buildWorkspace(detail);
      if (!workspace.completeness.complete) {
        throw new ApiError(
          400,
          "RESPONSE_INCOMPLETE",
          "This response is missing information the department has asked for.",
          workspace.completeness.missing,
        );
      }

      // Resubmitting while a departmental question sits unanswered would return
      // a response that has not addressed what it was asked.
      if (detail.status === "CLARIFICATION_REQUESTED") {
        const open = await countOpenGovernmentClarifications(responseId);
        if (open > 0) {
          throw new ApiError(
            400,
            "CLARIFICATION_UNANSWERED",
            `Answer the ${open} outstanding clarification${open === 1 ? "" : "s"} before ` +
              "resubmitting this response.",
          );
        }
      }

      const status = await submitResponse({
        responseId,
        vendorProfileId: profile.id,
        submittedBy: user.id,
      });

      if (status === undefined) {
        throw new ApiError(409, "RESPONSE_NOT_EDITABLE", "This response can no longer be changed.");
      }

      const resubmission = status === "RESUBMITTED";

      // Attributed to the supplier's own user, so the department does not
      // appear in the record as the author of a submission it did not make.
      await recordWorkPackageHistory(
        detail.projectId,
        detail.workPackageId,
        user.id,
        resubmission ? "RESPONSE_RESUBMITTED" : "RESPONSE_SUBMITTED",
        null,
        {
          responseId,
          vendorProfileId: profile.id,
          organizationName: user.organizationName,
          responseType: detail.responseType,
          submissionCount: detail.submissionCount + 1,
        },
        null,
      );

      // The supplier's own confirmation, in the place every other portal event
      // appears. Nothing is sent to the department: it reads the response from
      // the workspace it already has.
      await createNotification({
        profileId: profile.id,
        category: "RESPONSE",
        title: resubmission ? "Response resubmitted" : "Response submitted",
        body:
          `Your ${detail.responseType === "QUOTATION" ? "quotation" : "response"} for ` +
          `${detail.packageNumber} - ${detail.packageTitle} was ` +
          `${resubmission ? "resubmitted" : "submitted"} to ${detail.departmentName}. ` +
          "It can no longer be edited unless the department asks for a clarification.",
        linkPath: `/vendor/responses/${responseId}`,
        responseId,
      });

      response.json({ data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

const withdrawalSchema = z.object({
  reason: z.string().trim().min(3, "State why this response is being withdrawn.").max(2000),
});

/**
 * Withdraws the response.
 *
 * Not a delete: what was submitted stays on the record and the department is
 * shown that it was withdrawn and why. A response already marked ready for
 * evaluation cannot be withdrawn — by then the department is acting on it.
 */
vendorResponsesRouter.post(
  "/:responseId/withdraw",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);
      const body = parseOr400(withdrawalSchema, request.body);

      const withdrawn = await withdrawResponse({
        responseId,
        vendorProfileId: profile.id,
        withdrawnBy: user.id,
        reason: body.reason,
      });

      if (!withdrawn) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_WITHDRAWABLE",
          detail.status === "WITHDRAWN"
            ? "This response has already been withdrawn."
            : "A response the department has accepted for evaluation cannot be withdrawn.",
        );
      }

      await recordWorkPackageHistory(
        detail.projectId,
        detail.workPackageId,
        user.id,
        "RESPONSE_WITHDRAWN",
        { responseId, previousStatus: detail.status },
        { vendorProfileId: profile.id, organizationName: user.organizationName },
        body.reason,
      );

      await createNotification({
        profileId: profile.id,
        category: "RESPONSE",
        title: "Response withdrawn",
        body:
          `Your organisation withdrew its response to ${detail.packageNumber} - ` +
          `${detail.packageTitle}. ${detail.departmentName} has been shown the reason you gave.`,
        linkPath: `/vendor/responses/${responseId}`,
        responseId,
      });

      response.json({ data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Clarifications
// ---------------------------------------------------------------------------

const askSchema = z.object({
  subject: z.string().trim().min(3).max(200).nullable().default(null),
  question: z.string().trim().min(10, "State what you need clarified.").max(4000),
});

/**
 * Asks the department a question.
 *
 * Permitted only where the department allowed clarifications, which the
 * repository reads from the configuration inside the write rather than from
 * anything the request carries.
 */
vendorResponsesRouter.post(
  "/:responseId/clarifications",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);
      const body = parseOr400(askSchema, request.body);

      const clarification = await createVendorClarification({
        responseId,
        vendorProfileId: profile.id,
        subject: body.subject,
        question: body.question,
        askedBy: user.id,
      });

      if (clarification === undefined) {
        throw new ApiError(
          409,
          "CLARIFICATIONS_NOT_ALLOWED",
          detail.status === "WITHDRAWN"
            ? "This response has been withdrawn."
            : "The department is not accepting clarification questions on this work package.",
        );
      }

      await recordWorkPackageHistory(
        detail.projectId,
        detail.workPackageId,
        user.id,
        "RESPONSE_CLARIFICATION_ASKED",
        null,
        { responseId, clarificationId: clarification.id, vendorProfileId: profile.id },
        body.subject,
      );

      response.status(201).json({
        data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)),
      });
    } catch (error) {
      next(error);
    }
  },
);

const clarificationAnswerSchema = z.object({
  answer: z.string().trim().min(1, "An answer is required.").max(4000),
});

/**
 * Answers a question the department asked.
 *
 * The repository refuses anything the supplier itself raised, so a supplier
 * cannot answer its own question and close a thread the department never
 * replied to.
 */
vendorResponsesRouter.post(
  "/:responseId/clarifications/:clarificationId/answer",
  requirePermission("vendor:response:submit"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const profile = await loadProfileForUser(user);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadOwnResponse(responseId, profile.id);

      const clarificationId = uuidSchema.safeParse(request.params.clarificationId);
      if (!clarificationId.success) {
        throw new ApiError(404, "NOT_FOUND", "The clarification was not found.");
      }

      const body = parseOr400(clarificationAnswerSchema, request.body);

      const answered = await answerAsVendor({
        clarificationId: clarificationId.data,
        responseId,
        vendorProfileId: profile.id,
        answer: body.answer,
        answeredBy: user.id,
      });

      if (answered === undefined) {
        throw new ApiError(
          409,
          "CLARIFICATION_NOT_ANSWERABLE",
          "This clarification was not raised by the department, or has already been answered.",
        );
      }

      await recordWorkPackageHistory(
        detail.projectId,
        detail.workPackageId,
        user.id,
        "RESPONSE_CLARIFICATION_ANSWERED",
        null,
        { responseId, clarificationId: answered.id, vendorProfileId: profile.id },
        null,
      );

      response.json({ data: await buildWorkspace(await loadOwnResponse(responseId, profile.id)) });
    } catch (error) {
      next(error);
    }
  },
);
