import { Router, type Request } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  completeRun,
  createRun,
  listAnalysisRuns,
  markRunFailed,
  transitionStatus,
} from "../repositories/analysisRuns.js";
import {
  answerClarification,
  countOpenClarifications,
  listClarifications,
} from "../repositories/clarifications.js";
import { findProjectById } from "../repositories/projects.js";
import {
  countAcceptedRequirements,
  createManualRequirement,
  findRequirement,
  listRequirements,
  updateRequirementDecision,
} from "../repositories/requirements.js";
import { listStageHistory } from "../repositories/stageHistory.js";
import { checkAiService, requestRequirementAnalysis } from "../services/aiClient.js";

const uuidSchema = z.uuid();

const kindSchema = z.enum(["REQUIREMENT", "CONSTRAINT"]);
const categorySchema = z.enum([
  "FUNCTIONAL",
  "NON_FUNCTIONAL",
  "BUDGET",
  "TIMELINE",
  "COMPLIANCE",
  "OTHER",
]);

const manualRequirementSchema = z.object({
  kind: kindSchema,
  category: categorySchema,
  text: z.string().trim().min(5, "Requirement text must be at least 5 characters.").max(2000),
});

const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({
    action: z.literal("edit"),
    text: z.string().trim().min(5, "Requirement text must be at least 5 characters.").max(2000),
  }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().trim().min(3, "A reason is required when rejecting a suggestion.").max(1000),
  }),
]);

const answerSchema = z.object({
  answer: z.string().trim().min(1, "An answer is required.").max(4000),
});

function validationError(issues: z.core.$ZodIssue[], message: string): ApiError {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    message,
    issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  );
}

export const requirementsRouter: Router = Router({ mergeParams: true });

/** mergeParams supplies :projectId from the parent mount path, which Express's types do not infer. */
function routeParam(request: Request, name: string): string | undefined {
  return (request.params as Record<string, string | undefined>)[name];
}

async function loadProject(request: Request, projectIdRaw: string | undefined) {
  const parsed = uuidSchema.safeParse(projectIdRaw);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
  }

  const user = getCurrentUser(request);
  const project = await findProjectById(parsed.data, user.organizationId);
  if (project === undefined) {
    throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
  }

  return { user, project };
}

requirementsRouter.get(
  "/",
  requirePermission("requirements:read"),
  async (request, response, next) => {
    try {
      const { project } = await loadProject(request, routeParam(request, "projectId"));
      const [requirements, clarifications, runs, history] = await Promise.all([
        listRequirements(project.id),
        listClarifications(project.id),
        listAnalysisRuns(project.id),
        listStageHistory(project.id),
      ]);

      response.json({
        data: {
          projectStatus: project.status,
          requirements,
          clarifications,
          analysisRuns: runs,
          stageHistory: history,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

requirementsRouter.post(
  "/analysis",
  requirePermission("requirements:analyze"),
  async (request, response, next) => {
    try {
      const { user, project } = await loadProject(request, routeParam(request, "projectId"));

      if (project.status !== "DRAFT" && project.status !== "REQUIREMENTS_ANALYSIS") {
        throw new ApiError(
          409,
          "INVALID_STATE_TRANSITION",
          "Analysis can only be run while the project is in Draft or Requirements Analysis.",
        );
      }

      const [existing, clarifications] = await Promise.all([
        listRequirements(project.id),
        listClarifications(project.id),
      ]);

      const runId = await createRun(project.id, user.id);

      let result;
      try {
        result = await requestRequirementAnalysis({
          projectTitle: project.title,
          problemDescription: project.problemDescription,
          existingRequirements: existing
            .filter((item) => item.status !== "REJECTED")
            .map((item) => ({
              kind: item.kind,
              category: item.category,
              text: item.text,
              status: item.status,
            })),
          answeredClarifications: clarifications
            .filter((item) => item.status === "ANSWERED" && item.answerText !== null)
            .map((item) => ({ question: item.question, answer: item.answerText ?? "" })),
        });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Requirement analysis failed.";
        await markRunFailed(runId, message);
        throw error;
      }

      const aiHealth = await checkAiService();

      await completeRun({
        runId,
        projectId: project.id,
        actorId: user.id,
        currentStatus: project.status,
        provider: aiHealth?.provider ?? "unknown",
        model: result.model,
        promptVersion: result.prompt_version,
        requirements: result.requirements,
        clarifications: result.clarification_questions,
      });

      response.status(201).json({
        data: {
          runId,
          suggestedRequirements: result.requirements.length,
          clarificationQuestions: result.clarification_questions.length,
          model: result.model,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

requirementsRouter.post(
  "/",
  requirePermission("requirements:decide"),
  async (request, response, next) => {
    try {
      const { project } = await loadProject(request, routeParam(request, "projectId"));
      const parsed = manualRequirementSchema.safeParse(request.body);

      if (!parsed.success) {
        throw validationError(parsed.error.issues, "The submitted requirement is not valid.");
      }

      const requirement = await createManualRequirement({
        projectId: project.id,
        kind: parsed.data.kind,
        category: parsed.data.category,
        text: parsed.data.text,
      });

      response.status(201).json({ data: requirement });
    } catch (error) {
      next(error);
    }
  },
);

requirementsRouter.patch(
  "/:requirementId",
  requirePermission("requirements:decide"),
  async (request, response, next) => {
    try {
      const { user, project } = await loadProject(request, routeParam(request, "projectId"));

      const requirementId = uuidSchema.safeParse(routeParam(request, "requirementId"));
      if (!requirementId.success) {
        throw new ApiError(404, "NOT_FOUND", "Requirement was not found.");
      }

      const existing = await findRequirement(project.id, requirementId.data);
      if (existing === undefined) {
        throw new ApiError(404, "NOT_FOUND", "Requirement was not found.");
      }

      const parsed = decisionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw validationError(parsed.error.issues, "The submitted decision is not valid.");
      }

      const decision = parsed.data;
      const updated = await updateRequirementDecision({
        projectId: project.id,
        requirementId: requirementId.data,
        status: decision.action === "reject" ? "REJECTED" : "ACCEPTED",
        ...(decision.action === "edit" ? { text: decision.text } : {}),
        rejectionReason: decision.action === "reject" ? decision.reason : null,
        decidedBy: user.id,
      });

      response.json({ data: updated });
    } catch (error) {
      next(error);
    }
  },
);

requirementsRouter.post(
  "/clarifications/:questionId/answer",
  requirePermission("clarification:answer"),
  async (request, response, next) => {
    try {
      const { user, project } = await loadProject(request, routeParam(request, "projectId"));

      const questionId = uuidSchema.safeParse(routeParam(request, "questionId"));
      if (!questionId.success) {
        throw new ApiError(404, "NOT_FOUND", "Clarification question was not found.");
      }

      const parsed = answerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw validationError(parsed.error.issues, "The submitted answer is not valid.");
      }

      const answered = await answerClarification({
        projectId: project.id,
        questionId: questionId.data,
        answerText: parsed.data.answer,
        answeredBy: user.id,
      });

      if (answered === undefined) {
        throw new ApiError(404, "NOT_FOUND", "Clarification question was not found.");
      }

      response.json({ data: answered });
    } catch (error) {
      next(error);
    }
  },
);

requirementsRouter.post(
  "/confirm",
  requirePermission("workflow:transition"),
  async (request, response, next) => {
    try {
      const { user, project } = await loadProject(request, routeParam(request, "projectId"));

      if (project.status !== "REQUIREMENTS_ANALYSIS") {
        throw new ApiError(
          409,
          "INVALID_STATE_TRANSITION",
          "Requirements can only be confirmed from the Requirements Analysis stage.",
        );
      }

      const accepted = await countAcceptedRequirements(project.id);
      if (accepted === 0) {
        throw new ApiError(
          409,
          "NO_ACCEPTED_REQUIREMENTS",
          "At least one accepted requirement is needed before confirming.",
        );
      }

      const openQuestions = await countOpenClarifications(project.id);

      await transitionStatus({
        projectId: project.id,
        fromStatus: project.status,
        toStatus: "REQUIREMENTS_CONFIRMED",
        actorId: user.id,
        reason: "Requirements confirmed by official",
      });

      response.json({
        data: {
          status: "REQUIREMENTS_CONFIRMED",
          acceptedRequirements: accepted,
          unansweredClarifications: openQuestions,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

requirementsRouter.post(
  "/reopen",
  requirePermission("workflow:transition"),
  async (request, response, next) => {
    try {
      const { user, project } = await loadProject(request, routeParam(request, "projectId"));

      if (project.status !== "REQUIREMENTS_CONFIRMED") {
        throw new ApiError(
          409,
          "INVALID_STATE_TRANSITION",
          "Only confirmed requirements can be reopened.",
        );
      }

      await transitionStatus({
        projectId: project.id,
        fromStatus: project.status,
        toStatus: "REQUIREMENTS_ANALYSIS",
        actorId: user.id,
        reason: "Requirements reopened by official",
      });

      response.json({ data: { status: "REQUIREMENTS_ANALYSIS" } });
    } catch (error) {
      next(error);
    }
  },
);
