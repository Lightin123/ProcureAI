import { Router } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  closeConfig,
  createQuestion,
  deleteQuestion,
  findConfigForWorkPackage,
  hasSubmittedResponses,
  listQuestions,
  openConfig,
  upsertConfig,
} from "../repositories/responseConfigs.js";
import {
  answerAsGovernment,
  createGovernmentClarification,
  listClarifications,
} from "../repositories/responseClarifications.js";
import {
  findGovernmentDocumentContent,
  listResponseDocuments,
} from "../repositories/responseDocuments.js";
import { createNotification } from "../repositories/vendorNotifications.js";
import { recordWorkPackageHistory } from "../repositories/workPackageHistory.js";
import { listInvitationsForWorkPackage } from "../repositories/workPackageInvitations.js";
import { findScopedWorkPackage } from "../repositories/workPackageMatching.js";
import {
  findGovernmentResponse,
  listQuestionAnswers,
  listRequirementAnswers,
  listResponsesForWorkPackage,
  markClarificationRequested,
  markReadyForEvaluation,
  startReview,
  summariseResponses,
} from "../repositories/workPackageResponses.js";
import { listConfirmedRequirementsForPackage } from "../repositories/workPackages.js";
import { evaluateResponseCompleteness } from "../responses/completeness.js";
import {
  CHOICE_QUESTION_TYPES,
  QUESTION_TYPES,
  RESPONSE_SECTIONS,
  RESPONSE_TYPES,
  RESPONSE_TYPE_DESCRIPTIONS,
  RESPONSE_TYPE_LABELS,
  REQUIREMENT_COMPLIANCE,
  REQUIREMENT_COMPLIANCE_LABELS,
  QUESTION_TYPE_LABELS,
  SECTION_IDS,
  SECTION_MODES,
  DEFAULT_SECTIONS,
  findSection,
  normalizeSections,
} from "../responses/schema.js";
import { readDocument } from "../vendor/documentStorage.js";

/**
 * Government-facing response configuration and the response workspace.
 *
 * Mounted under `/api/v1/work-packages/:workPackageId/responses`, so
 * `requireAuth` already applies and every route declares its own permission on
 * top of that. Nothing here reads an organization or a vendor from the request:
 * the organization comes from the session and is applied in SQL, and every
 * route starts by resolving the work package through it, so cross-department
 * access fails by omission rather than by each handler remembering to check.
 *
 * There is no vendor-facing route in this file, and none of the three
 * permissions it uses is held by the `VENDOR` role. The supplier's own view is
 * `vendorResponses.ts` — a different router over different queries (D76).
 *
 * What this milestone deliberately does not do: score a response, rank
 * suppliers against each other, or recommend one. `READY_FOR_EVALUATION` is
 * where Milestone 8 stops and Milestone 9 begins.
 */
export const workPackageResponsesRouter: Router = Router({ mergeParams: true });

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

function parsePackageIdOr404(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }
  return parsed.data;
}

function parseResponseIdOr404(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "The response was not found.");
  }
  return parsed.data;
}

async function scopedPackage(workPackageId: string, organizationId: string) {
  const scoped = await findScopedWorkPackage(workPackageId, organizationId);
  if (scoped === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }
  return scoped;
}

const isoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date in YYYY-MM-DD form.")
  .nullable()
  .default(null);

const configSchema = z.object({
  responseType: z.enum(RESPONSE_TYPES),
  title: z.string().trim().min(3).max(200).nullable().default(null),
  instructions: z.string().trim().min(1).max(8000).nullable().default(null),
  responseDeadline: isoDaySchema,
  sections: z.record(z.string(), z.enum(SECTION_MODES)).default({}),
  allowClarifications: z.boolean().default(true),
  allowDocuments: z.boolean().default(true),
  documentsRequired: z.boolean().default(false),
});

const questionSchema = z.object({
  section: z.string().refine((value) => SECTION_IDS.includes(value), "Unknown response section."),
  prompt: z.string().trim().min(5, "State the question.").max(1000),
  helpText: z.string().trim().min(1).max(1000).nullable().default(null),
  answerType: z.enum(QUESTION_TYPES),
  options: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  isRequired: z.boolean().default(false),
});

const clarificationSchema = z.object({
  subject: z.string().trim().min(3).max(200).nullable().default(null),
  question: z
    .string()
    .trim()
    .min(10, "State what the supplier needs to clarify.")
    .max(4000),
  respondBy: isoDaySchema,
});

const answerSchema = z.object({
  answer: z.string().trim().min(1, "An answer is required.").max(4000),
});

/**
 * The catalogue the configuration screen is built from.
 *
 * Served rather than duplicated in the frontend (D58), so the sections an
 * official can switch on are exactly the sections the submission check knows
 * about. A second copy in the browser would let an official configure a section
 * the server does not validate.
 */
workPackageResponsesRouter.get(
  "/schema",
  requirePermission("response:read"),
  (_request, response) => {
    response.json({
      data: {
        responseTypes: RESPONSE_TYPES.map((type) => ({
          value: type,
          label: RESPONSE_TYPE_LABELS[type],
          description: RESPONSE_TYPE_DESCRIPTIONS[type],
        })),
        sections: RESPONSE_SECTIONS.map((section) => ({
          id: section.id,
          label: section.label,
          description: section.description,
          alwaysOn: section.alwaysOn === true,
          perRequirement: section.perRequirement === true,
          fields: section.fields,
        })),
        sectionModes: SECTION_MODES,
        defaultSections: DEFAULT_SECTIONS,
        questionTypes: QUESTION_TYPES.map((type) => ({
          value: type,
          label: QUESTION_TYPE_LABELS[type],
          requiresOptions: CHOICE_QUESTION_TYPES.includes(type),
        })),
        requirementCompliance: REQUIREMENT_COMPLIANCE.map((value) => ({
          value,
          label: REQUIREMENT_COMPLIANCE_LABELS[value],
        })),
      },
    });
  },
);

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

/**
 * Everything the department sees about responses to one work package: the
 * configuration and its questions, the invitations that could produce a
 * response, and every response received so far with its status and deadline.
 */
workPackageResponsesRouter.get(
  "/",
  requirePermission("response:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const config = await findConfigForWorkPackage(workPackageId, user.organizationId);

      const [questions, responses, counts, invitations, requirements] = await Promise.all([
        config === undefined ? Promise.resolve([]) : listQuestions(config.id),
        listResponsesForWorkPackage(workPackageId),
        summariseResponses(workPackageId),
        listInvitationsForWorkPackage(workPackageId),
        listConfirmedRequirementsForPackage(workPackageId),
      ]);

      response.json({
        data: {
          workPackage: {
            id: scoped.workPackageId,
            projectId: scoped.projectId,
            packageNumber: scoped.packageNumber,
            title: scoped.title,
            status: scoped.status,
            projectTitle: scoped.projectTitle,
          },
          requirements,
          config: config ?? null,
          questions,
          responses,
          counts,
          // The invitations are what makes "three invited, one responded"
          // legible. Only accepted ones can produce a response, so the
          // workspace shows the shortfall rather than leaving the official to
          // compare two lists on separate pages.
          invitations: invitations.map((invitation) => ({
            id: invitation.id,
            vendorProfileId: invitation.vendorProfileId,
            organizationName: invitation.organizationName,
            legalName: invitation.legalName,
            status: invitation.status,
            invitedAt: invitation.invitedAt,
            respondedAt: invitation.respondedAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Creates or replaces what is being asked for.
 *
 * Two preconditions, both enforced here: the package is the caller's and it is
 * CONFIRMED. Asking suppliers to respond to a package the department has not
 * settled would put a moving specification in front of them.
 *
 * Once a supplier has submitted, the response type and the section modes are
 * frozen. Changing them afterwards would retrospectively make a submitted
 * response incomplete against terms it was never shown, which is not a
 * configuration change but a change of the competition mid-flight. The deadline
 * and the instructions stay editable, because extending a deadline disadvantages
 * nobody.
 */
workPackageResponsesRouter.put(
  "/config",
  requirePermission("response:configure"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      if (scoped.status !== "CONFIRMED") {
        throw new ApiError(
          409,
          "WORK_PACKAGE_NOT_CONFIRMED",
          "A response can only be configured against a confirmed work package.",
        );
      }

      const body = parseOr400(configSchema, request.body);
      const sections = normalizeSections(body.responseType, body.sections);

      const existing = await findConfigForWorkPackage(workPackageId, user.organizationId);

      if (existing !== undefined && (await hasSubmittedResponses(existing.id))) {
        const typeChanged = existing.responseType !== body.responseType;
        const sectionsChanged = Object.keys(sections).some(
          (section) => sections[section] !== existing.sections[section],
        );
        const documentsChanged =
          existing.documentsRequired !== body.documentsRequired ||
          existing.allowDocuments !== body.allowDocuments;

        if (typeChanged || sectionsChanged || documentsChanged) {
          throw new ApiError(
            409,
            "RESPONSE_ALREADY_SUBMITTED",
            "A supplier has already submitted against this configuration. The deadline and the " +
              "instructions can still be changed; what is being asked for cannot.",
          );
        }
      }

      const saved = await upsertConfig({
        workPackageId,
        projectId: scoped.projectId,
        organizationId: user.organizationId,
        responseType: body.responseType,
        title: body.title,
        instructions: body.instructions,
        responseDeadline: body.responseDeadline,
        sections,
        allowClarifications: body.allowClarifications,
        allowDocuments: body.allowDocuments,
        documentsRequired: body.documentsRequired,
        configuredBy: user.id,
      });

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "RESPONSE_CONFIGURED",
        existing === null || existing === undefined
          ? null
          : { responseType: existing.responseType, sections: existing.sections },
        {
          responseType: saved.responseType,
          sections: saved.sections,
          responseDeadline: saved.responseDeadline,
          allowClarifications: saved.allowClarifications,
          allowDocuments: saved.allowDocuments,
          documentsRequired: saved.documentsRequired,
        },
        null,
      );

      response.json({
        data: { config: saved, questions: await listQuestions(saved.id) },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Opens the configuration to the suppliers who accepted their invitation.
 *
 * This is the act that makes a response possible, and the one the supplier is
 * notified about. Only suppliers with an ACCEPTED invitation are notified: an
 * invitation not yet answered is still an invitation, and telling that supplier
 * a response is due would ask it to respond to something it has not agreed to.
 */
workPackageResponsesRouter.post(
  "/config/open",
  requirePermission("response:configure"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const config = await findConfigForWorkPackage(workPackageId, user.organizationId);
      if (config === undefined) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_CONFIGURED",
          "Configure what is being asked for before opening it to suppliers.",
        );
      }

      const opened = await openConfig({
        workPackageId,
        organizationId: user.organizationId,
        openedBy: user.id,
      });

      if (!opened) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_DRAFT",
          `This response has already been ${config.status.toLowerCase()} and cannot be opened again.`,
        );
      }

      const invitations = await listInvitationsForWorkPackage(workPackageId);
      const accepted = invitations.filter((invitation) => invitation.status === "ACCEPTED");

      // Written in the same request that opened the configuration, so a
      // response that can be started is one the supplier can already see. No
      // job, no second channel (D74).
      for (const invitation of accepted) {
        await createNotification({
          profileId: invitation.vendorProfileId,
          category: "RESPONSE",
          title: `${RESPONSE_TYPE_LABELS[config.responseType]} requested`,
          body:
            `${user.organizationName} has asked for a ` +
            `${RESPONSE_TYPE_LABELS[config.responseType].toLowerCase()} for ` +
            `${scoped.packageNumber} - ${scoped.title}.` +
            (config.responseDeadline === null
              ? ""
              : ` Responses are due by ${config.responseDeadline}.`),
          linkPath: `/vendor/invitations/${invitation.id}`,
          invitationId: invitation.id,
        });
      }

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "RESPONSE_OPENED",
        null,
        {
          responseType: config.responseType,
          responseDeadline: config.responseDeadline,
          notifiedSuppliers: accepted.length,
        },
        null,
      );

      response.json({
        data: {
          config: await findConfigForWorkPackage(workPackageId, user.organizationId),
          notifiedSuppliers: accepted.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Closes the configuration. No further response can be opened, and no draft can
 * still be submitted. Existing submissions are untouched — closing collection is
 * not withdrawing what was collected.
 */
workPackageResponsesRouter.post(
  "/config/close",
  requirePermission("response:configure"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const closed = await closeConfig({
        workPackageId,
        organizationId: user.organizationId,
        closedBy: user.id,
      });

      if (!closed) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_OPEN",
          "Only an open response can be closed.",
        );
      }

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "RESPONSE_CLOSED",
        null,
        null,
        null,
      );

      response.json({
        data: { config: await findConfigForWorkPackage(workPackageId, user.organizationId) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Custom questions
// ---------------------------------------------------------------------------

workPackageResponsesRouter.post(
  "/config/questions",
  requirePermission("response:configure"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      const config = await findConfigForWorkPackage(workPackageId, user.organizationId);
      if (config === undefined) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_CONFIGURED",
          "Configure the response before adding questions to it.",
        );
      }

      if (await hasSubmittedResponses(config.id)) {
        throw new ApiError(
          409,
          "RESPONSE_ALREADY_SUBMITTED",
          "A supplier has already submitted against this configuration; the questions asked " +
            "can no longer be changed.",
        );
      }

      const body = parseOr400(questionSchema, request.body);

      // The two choice types need choices and the others must not carry any:
      // the database enforces the same rule, and duplicating it here is what
      // turns a constraint violation into an explanation.
      const needsOptions = CHOICE_QUESTION_TYPES.includes(body.answerType);
      const options = [...new Set(body.options)];

      if (needsOptions && options.length < 2) {
        throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
          { field: "options", message: "Offer at least two options to choose from." },
        ]);
      }
      if (!needsOptions && options.length > 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
          { field: "options", message: "This answer type does not take a list of options." },
        ]);
      }

      const section = findSection(body.section);
      if (section?.perRequirement === true) {
        throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
          {
            field: "section",
            message:
              "The requirement section is answered requirement by requirement and takes no " +
              "additional questions.",
          },
        ]);
      }

      const question = await createQuestion({
        configId: config.id,
        section: body.section,
        prompt: body.prompt,
        helpText: body.helpText,
        answerType: body.answerType,
        options: needsOptions ? options : [],
        isRequired: body.isRequired,
        createdBy: user.id,
      });

      response.status(201).json({
        data: { question, questions: await listQuestions(config.id) },
      });
    } catch (error) {
      next(error);
    }
  },
);

workPackageResponsesRouter.delete(
  "/config/questions/:questionId",
  requirePermission("response:configure"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      const config = await findConfigForWorkPackage(workPackageId, user.organizationId);
      if (config === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The question was not found.");
      }

      if (await hasSubmittedResponses(config.id)) {
        throw new ApiError(
          409,
          "RESPONSE_ALREADY_SUBMITTED",
          "A supplier has already submitted against this configuration; removing a question " +
            "would discard an answer it gave.",
        );
      }

      const questionId = uuidSchema.safeParse(request.params.questionId);
      if (!questionId.success || !(await deleteQuestion(config.id, questionId.data))) {
        throw new ApiError(404, "NOT_FOUND", "The question was not found.");
      }

      response.json({ data: { deleted: true, questions: await listQuestions(config.id) } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// One response
// ---------------------------------------------------------------------------

/**
 * Loads a response the caller's department owns, or 404s.
 *
 * A draft is deliberately unreadable: a supplier that has not submitted has not
 * said anything to the department, and serving what it has typed so far would
 * make the save-as-you-go affordance a disclosure. The workspace still shows
 * that a draft exists, which is the fact the official needs.
 */
async function loadResponseOr404(responseId: string, organizationId: string) {
  const detail = await findGovernmentResponse(responseId, organizationId);
  if (detail === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The response was not found.");
  }
  if (detail.status === "DRAFT") {
    throw new ApiError(
      409,
      "RESPONSE_NOT_SUBMITTED",
      "This supplier has opened a response but has not submitted it. Its contents are not " +
        "available until it is submitted.",
    );
  }
  return detail;
}

workPackageResponsesRouter.get(
  "/:responseId",
  requirePermission("response:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      const responseId = parseResponseIdOr404(request.params.responseId);
      const detail = await loadResponseOr404(responseId, user.organizationId);

      // Scoped by organization and then checked against the package in the URL,
      // so a response id from another package in the same department cannot be
      // read through this route either.
      if (detail.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      const config = await findConfigForWorkPackage(workPackageId, user.organizationId);
      if (config === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      const [questions, requirements, requirementAnswers, questionAnswers, documents, clarifications] =
        await Promise.all([
          listQuestions(config.id),
          listConfirmedRequirementsForPackage(workPackageId),
          listRequirementAnswers(responseId),
          listQuestionAnswers(responseId),
          listResponseDocuments(responseId),
          listClarifications(responseId),
        ]);

      // The same computation the supplier saw while drafting and the submission
      // check applied. An official reading a response is entitled to know what
      // the department asked for and whether it was all answered.
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

      response.json({
        data: {
          response: detail,
          config,
          questions,
          requirements,
          requirementAnswers,
          questionAnswers,
          documents,
          clarifications,
          completeness,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** A submitted document, streamed as an attachment and never inline. */
workPackageResponsesRouter.get(
  "/:responseId/documents/:documentId/content",
  requirePermission("response:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      const documentId = uuidSchema.safeParse(request.params.documentId);
      if (!documentId.success) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      const reference = await findGovernmentDocumentContent({
        documentId: documentId.data,
        organizationId: user.organizationId,
      });

      if (reference === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The document was not found.");
      }

      const bytes = await readDocument(reference.storageKey);
      response.setHeader("Content-Type", reference.mimeType);
      // A supplier-supplied file is untrusted content and must not be rendered
      // in the portal's own origin.
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
// Review transitions
// ---------------------------------------------------------------------------

/**
 * Notifies the supplier that its response has moved.
 *
 * Every status change the supplier can see is told to it, in the table its
 * portal already renders. The department gets no notification: it is the side
 * that acted.
 */
async function notifySupplier(input: {
  vendorProfileId: string;
  responseId: string;
  title: string;
  body: string;
}): Promise<void> {
  await createNotification({
    profileId: input.vendorProfileId,
    category: "RESPONSE",
    title: input.title,
    body: input.body,
    linkPath: `/vendor/responses/${input.responseId}`,
    responseId: input.responseId,
  });
}

workPackageResponsesRouter.post(
  "/:responseId/review",
  requirePermission("response:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadResponseOr404(responseId, user.organizationId);
      if (detail.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      const started = await startReview({
        responseId,
        organizationId: user.organizationId,
        reviewedBy: user.id,
      });

      if (!started) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_REVIEWABLE",
          `A response that is ${detail.status.toLowerCase().replace(/_/g, " ")} cannot be ` +
            "moved into review.",
        );
      }

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "RESPONSE_UNDER_REVIEW",
        null,
        { responseId, vendorProfileId: detail.vendorProfileId },
        null,
      );

      await notifySupplier({
        vendorProfileId: detail.vendorProfileId,
        responseId,
        title: "Response under review",
        body:
          `${user.organizationName} has begun reviewing your response to ` +
          `${scoped.packageNumber} - ${scoped.title}.`,
      });

      response.json({
        data: { response: await findGovernmentResponse(responseId, user.organizationId) },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Marks a reviewed response ready to be evaluated.
 *
 * The last state Milestone 8 defines. It records that the department considers
 * the response complete enough to be assessed; it is not an assessment, a score,
 * a rank or a selection, and nothing in this milestone produces one.
 */
workPackageResponsesRouter.post(
  "/:responseId/ready",
  requirePermission("response:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadResponseOr404(responseId, user.organizationId);
      if (detail.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      const readied = await markReadyForEvaluation({
        responseId,
        organizationId: user.organizationId,
        readiedBy: user.id,
      });

      if (!readied) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_UNDER_REVIEW",
          "Only a response that is under review can be marked ready for evaluation.",
        );
      }

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "RESPONSE_READY_FOR_EVALUATION",
        null,
        { responseId, vendorProfileId: detail.vendorProfileId },
        null,
      );

      await notifySupplier({
        vendorProfileId: detail.vendorProfileId,
        responseId,
        title: "Response accepted for evaluation",
        body:
          `${user.organizationName} has recorded your response to ${scoped.packageNumber} - ` +
          `${scoped.title} as complete and ready for evaluation. This is not an award.`,
      });

      response.json({
        data: { response: await findGovernmentResponse(responseId, user.organizationId) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Clarifications
// ---------------------------------------------------------------------------

/**
 * Asks the supplier to clarify something, and moves the response to
 * CLARIFICATION_REQUESTED so it becomes editable again.
 *
 * The question and the state change are recorded together, in that order: a
 * response that is awaiting clarification always has the question that put it
 * there attached to it.
 */
workPackageResponsesRouter.post(
  "/:responseId/clarifications",
  requirePermission("response:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadResponseOr404(responseId, user.organizationId);
      if (detail.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      const body = parseOr400(clarificationSchema, request.body);

      const clarification = await createGovernmentClarification({
        responseId,
        organizationId: user.organizationId,
        subject: body.subject,
        question: body.question,
        respondBy: body.respondBy,
        askedBy: user.id,
      });

      if (clarification === undefined) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_CLARIFIABLE",
          "A clarification can only be requested on a submitted response.",
        );
      }

      await markClarificationRequested({ responseId, organizationId: user.organizationId });

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "RESPONSE_CLARIFICATION_REQUESTED",
        null,
        { responseId, clarificationId: clarification.id, vendorProfileId: detail.vendorProfileId },
        body.subject,
      );

      await notifySupplier({
        vendorProfileId: detail.vendorProfileId,
        responseId,
        title: "Clarification requested",
        body:
          `${user.organizationName} has asked your organisation to clarify part of its response ` +
          `to ${scoped.packageNumber} - ${scoped.title}.` +
          (body.respondBy === null ? "" : ` A reply is requested by ${body.respondBy}.`),
      });

      response.status(201).json({
        data: {
          clarification,
          clarifications: await listClarifications(responseId),
          response: await findGovernmentResponse(responseId, user.organizationId),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Answers a question the supplier asked.
 *
 * The repository refuses anything the department itself raised, so a department
 * cannot answer its own clarification request and close a loop the supplier
 * never completed.
 */
workPackageResponsesRouter.post(
  "/:responseId/clarifications/:clarificationId/answer",
  requirePermission("response:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);
      const responseId = parseResponseIdOr404(request.params.responseId);

      const detail = await loadResponseOr404(responseId, user.organizationId);
      if (detail.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      const clarificationId = uuidSchema.safeParse(request.params.clarificationId);
      if (!clarificationId.success) {
        throw new ApiError(404, "NOT_FOUND", "The clarification was not found.");
      }

      const body = parseOr400(answerSchema, request.body);

      const answered = await answerAsGovernment({
        clarificationId: clarificationId.data,
        responseId,
        organizationId: user.organizationId,
        answer: body.answer,
        answeredBy: user.id,
      });

      if (answered === undefined) {
        throw new ApiError(
          409,
          "CLARIFICATION_NOT_ANSWERABLE",
          "This clarification was not raised by the supplier, or has already been answered.",
        );
      }

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "RESPONSE_CLARIFICATION_ANSWERED",
        null,
        { responseId, clarificationId: answered.id, vendorProfileId: detail.vendorProfileId },
        null,
      );

      await notifySupplier({
        vendorProfileId: detail.vendorProfileId,
        responseId,
        title: "Clarification answered",
        body:
          `${user.organizationName} has answered your query on ${scoped.packageNumber} - ` +
          `${scoped.title}.`,
      });

      response.json({
        data: { clarification: answered, clarifications: await listClarifications(responseId) },
      });
    } catch (error) {
      next(error);
    }
  },
);
