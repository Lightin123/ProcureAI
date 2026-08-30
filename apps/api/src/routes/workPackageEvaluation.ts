import { Router } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import {
  CRITERIA_PRESETS,
  CRITERION_DIRECTIONS,
  CRITERION_TYPES,
  CRITERION_TYPE_DEFINITIONS,
  TOTAL_WEIGHT,
  criterionDefinition,
  validateCriteria,
  type CriterionInput,
} from "../evaluation/criteria.js";
import { COMPLIANCE_STATUSES, COMPLIANCE_STATUS_LABELS } from "../evaluation/compliance.js";
import { runEvaluation } from "../evaluation/pipeline.js";
import { SCORING_VERSION } from "../evaluation/scoring.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  findEvaluationConfig,
  findEvaluationRun,
  findLatestEvaluationRun,
  findMatchEligibility,
  latestAiAnalysesForWorkPackage,
  listAiAnalyses,
  listDecisions,
  listEvaluationInputs,
  listEvaluationResults,
  listEvaluationRuns,
  listQuestionIdsForWorkPackage,
  recordAiAnalysis,
  recordDecision,
  revokeDecision,
  saveEvaluationConfig,
} from "../repositories/evaluations.js";
import { findConfigForWorkPackage, listQuestions } from "../repositories/responseConfigs.js";
import { listResponseDocuments } from "../repositories/responseDocuments.js";
import { recordWorkPackageHistory } from "../repositories/workPackageHistory.js";
import { findScopedWorkPackage } from "../repositories/workPackageMatching.js";
import {
  findGovernmentResponse,
  listQuestionAnswers,
  listRequirementAnswers,
} from "../repositories/workPackageResponses.js";
import {
  findWorkPackageById,
  listConfirmedRequirementsForPackage,
} from "../repositories/workPackages.js";
import { RESPONSE_SECTIONS, RESPONSE_TYPE_LABELS } from "../responses/schema.js";
import { requestResponseInsights } from "../services/aiClient.js";

/**
 * The government evaluation workspace.
 *
 * Mounted under `/api/v1/work-packages/:workPackageId/evaluation`, below
 * `requireAuth`, so every route is authenticated and declares its own
 * permission on top of that. Nothing here reads an organization from the
 * request: it comes from the session and is applied in SQL, and every route
 * begins by resolving the work package through it, so cross-department access
 * fails by omission rather than by each handler remembering to check.
 *
 * There is no vendor-facing route in this file, and none of the four
 * permissions it uses is held by the `VENDOR` role. A supplier is never shown a
 * score, a rank, a criterion, another supplier's submission, or the
 * department's decision reasoning.
 *
 * The order the workflow imposes, and this file preserves:
 *
 *   AI analysis (advisory, separate)
 *     -> deterministic evaluation (arithmetic over stated figures)
 *       -> explainable ranking (derived from the scores)
 *         -> human decision (typed by an official, with a reason)
 *
 * No route in this file selects a supplier. `POST /decisions` records the
 * selection a named official made; nothing computes one.
 */
export const workPackageEvaluationRouter: Router = Router({ mergeParams: true });

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

function parseIdOr404(value: unknown, subject: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(404, "NOT_FOUND", `The ${subject} was not found.`);
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

// ---------------------------------------------------------------------------
// The criterion catalogue
// ---------------------------------------------------------------------------

/**
 * What the configuration screen is built from.
 *
 * Served rather than duplicated in the frontend (the rule D79 set for the
 * response catalogue), so the criteria an official can configure are exactly
 * the criteria the scorer knows how to compute. A second copy in the browser
 * would let an official configure a criterion the server cannot score.
 */
workPackageEvaluationRouter.get(
  "/criteria-schema",
  requirePermission("evaluation:read"),
  (_request, response) => {
    response.json({
      data: {
        criterionTypes: CRITERION_TYPE_DEFINITIONS,
        directions: CRITERION_DIRECTIONS,
        totalWeight: TOTAL_WEIGHT,
        presets: CRITERIA_PRESETS,
        scoringVersion: SCORING_VERSION,
        complianceStatuses: COMPLIANCE_STATUSES.map((value) => ({
          value,
          label: COMPLIANCE_STATUS_LABELS[value],
        })),
        sections: RESPONSE_SECTIONS.map((section) => ({
          id: section.id,
          label: section.label,
        })),
      },
    });
  },
);

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

/**
 * Everything the department sees at the top of the evaluation workflow: what is
 * being scored on, which responses can be scored, the most recent run with its
 * ranking, and every decision recorded so far.
 */
workPackageEvaluationRouter.get(
  "/",
  requirePermission("evaluation:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const responseConfig = await findConfigForWorkPackage(workPackageId, user.organizationId);

      const [evaluationConfig, questions, requirements, inputs, latestRun, decisions, eligibility] =
        await Promise.all([
          findEvaluationConfig(workPackageId, user.organizationId),
          responseConfig === undefined ? Promise.resolve([]) : listQuestions(responseConfig.id),
          listConfirmedRequirementsForPackage(workPackageId),
          listEvaluationInputs(workPackageId, user.organizationId),
          findLatestEvaluationRun(workPackageId, user.organizationId),
          listDecisions(workPackageId, user.organizationId),
          findMatchEligibility(workPackageId),
        ]);

      const results = latestRun === undefined ? [] : await listEvaluationResults(latestRun.id);
      const analyses = await latestAiAnalysesForWorkPackage(workPackageId, user.organizationId);

      // Re-checked against the configuration as it stands now, not as it stood
      // when the criteria were saved: switching a response section off since
      // would leave a criterion scoring every supplier zero on a field none of
      // them was asked for.
      const problems =
        evaluationConfig === undefined || responseConfig === undefined
          ? []
          : validateCriteria({
              criteria: evaluationConfig.criteria,
              sections: responseConfig.sections,
              questionIds: questions.map((question) => question.id),
            });

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
          responseConfig:
            responseConfig === undefined
              ? null
              : {
                  id: responseConfig.id,
                  responseType: responseConfig.responseType,
                  responseTypeLabel: RESPONSE_TYPE_LABELS[responseConfig.responseType],
                  status: responseConfig.status,
                  sections: responseConfig.sections,
                  responseDeadline: responseConfig.responseDeadline,
                },
          questions: questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            answerType: question.answerType,
            section: question.section,
          })),
          requirementCount: requirements.length,
          config: evaluationConfig ?? null,
          consistencyProblems: problems,
          responses: inputs.map((input) => ({
            responseId: input.responseId,
            vendorProfileId: input.vendorProfileId,
            organizationName: input.organizationName,
            legalName: input.legalName,
            verificationState: input.verificationState,
            status: input.status,
            submittedAt: input.submittedAt,
            submissionCount: input.submissionCount,
            documentCount: input.documentCount,
            readyForEvaluation: input.status === "READY_FOR_EVALUATION",
            eligibility: eligibility.get(input.vendorProfileId) ?? null,
            hasAiAnalysis: analyses.has(input.responseId),
          })),
          latestRun: latestRun ?? null,
          results,
          decisions,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Criteria configuration
// ---------------------------------------------------------------------------

const criterionSchema = z.object({
  criterionKey: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use lower-case letters, digits, hyphens and underscores."),
  criterionType: z.enum(CRITERION_TYPES),
  direction: z.enum(CRITERION_DIRECTIONS).default("HIGHER_IS_BETTER"),
  label: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(1000).nullable().default(null),
  weight: z.number().int().min(1).max(100),
  targetValue: z.number().positive().max(1_000_000_000_000).nullable().default(null),
  questionId: z.string().uuid().nullable().default(null),
});

const configSchema = z.object({
  title: z.string().trim().min(3).max(200).nullable().default(null),
  notes: z.string().trim().min(1).max(4000).nullable().default(null),
  criteria: z.array(criterionSchema).min(1).max(20),
});

/**
 * Creates or replaces the evaluation criteria for one work package.
 *
 * Three preconditions, all enforced server-side:
 *
 *  - the package is the caller's, resolved through the session's organization;
 *  - a response has been asked for, because a criterion is scored from a
 *    section of the response form and there is no form without one;
 *  - every `questionId` belongs to *this* package's response form. A question
 *    id in a request body is evidence of nothing on its own.
 *
 * The set is then checked for internal consistency. A set that fails is still
 * stored — an official iterating on weights should not lose their work — but it
 * is stored as `DRAFT`, the problems are returned with it, and a run refuses to
 * apply it. Only a set that adds up to 100 and can be scored from what was
 * actually collected reaches `READY`.
 */
workPackageEvaluationRouter.put(
  "/config",
  requirePermission("evaluation:configure"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      if (scoped.status !== "CONFIRMED") {
        throw new ApiError(
          409,
          "WORK_PACKAGE_NOT_CONFIRMED",
          "Responses can only be evaluated against a confirmed work package.",
        );
      }

      const responseConfig = await findConfigForWorkPackage(workPackageId, user.organizationId);
      if (responseConfig === undefined) {
        throw new ApiError(
          409,
          "RESPONSE_NOT_CONFIGURED",
          "Configure what suppliers are asked to submit before configuring how it is evaluated.",
        );
      }

      const body = parseOr400(configSchema, request.body);

      const ownQuestions = await listQuestionIdsForWorkPackage(workPackageId, user.organizationId);
      const ownQuestionIds = ownQuestions.map((question) => question.id);

      // A question id that is not on this work package's own response form is
      // refused here rather than stored: the foreign key would accept any
      // question in the database, and accepting one would let a criterion be
      // scored from another department's form.
      for (const [index, criterion] of body.criteria.entries()) {
        if (criterion.questionId !== null && !ownQuestionIds.includes(criterion.questionId)) {
          throw new ApiError(400, "VALIDATION_ERROR", "The submitted details are not valid.", [
            {
              field: `criteria.${index}.questionId`,
              message: "That question is not on this work package's response form.",
            },
          ]);
        }
      }

      const criteria: CriterionInput[] = body.criteria.map((criterion) => ({
        ...criterion,
        // The direction of a built-in criterion is a property of what it
        // measures, not a choice: a lower price is better whatever the request
        // body says.
        direction:
          criterion.criterionType === "CUSTOM"
            ? criterion.direction
            : criterionDefinition(criterion.criterionType).direction,
      }));

      const problems = validateCriteria({
        criteria,
        sections: responseConfig.sections,
        questionIds: ownQuestionIds,
      });

      const existing = await findEvaluationConfig(workPackageId, user.organizationId);

      const saved = await saveEvaluationConfig({
        workPackageId,
        projectId: scoped.projectId,
        organizationId: user.organizationId,
        status: problems.length === 0 ? "READY" : "DRAFT",
        title: body.title,
        notes: body.notes,
        criteria,
        userId: user.id,
      });

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "EVALUATION_CONFIGURED",
        existing === undefined
          ? null
          : {
              criteriaVersion: existing.criteriaVersion,
              criteria: existing.criteria.map((criterion) => ({
                key: criterion.criterionKey,
                type: criterion.criterionType,
                weight: criterion.weight,
                targetValue: criterion.targetValue,
              })),
            },
        {
          criteriaVersion: saved.criteriaVersion,
          status: saved.status,
          criteria: saved.criteria.map((criterion) => ({
            key: criterion.criterionKey,
            type: criterion.criterionType,
            weight: criterion.weight,
            targetValue: criterion.targetValue,
          })),
        },
        body.notes,
      );

      response.json({ data: { config: saved, consistencyProblems: problems } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Running an evaluation
// ---------------------------------------------------------------------------

/**
 * Runs the deterministic evaluation over every response marked ready.
 *
 * A run never overwrites an earlier one. Each is stored with the criteria it
 * applied, so a score an official acted on stays reproducible after the weights
 * have moved on, and re-evaluating after a resubmission adds a record rather
 * than destroying the one a decision may already cite.
 */
workPackageEvaluationRouter.post(
  "/run",
  requirePermission("evaluation:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const outcome = await runEvaluation({
        workPackageId,
        organizationId: user.organizationId,
        userId: user.id,
      });

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "EVALUATION_RUN",
        null,
        {
          runId: outcome.runId,
          scoringVersion: outcome.scoringVersion,
          criteriaVersion: outcome.criteriaVersion,
          rankedCount: outcome.ranked.length,
          excludedCount: outcome.excluded.length,
          ranking: outcome.ranked.map((result) => ({
            rank: result.rankPosition,
            vendorProfileId: result.vendorProfileId,
            responseId: result.responseId,
            totalScore: result.totalScore,
          })),
        },
        null,
      );

      const run = await findEvaluationRun(outcome.runId, workPackageId, user.organizationId);

      response.status(201).json({
        data: {
          run,
          results: await listEvaluationResults(outcome.runId),
          excluded: outcome.excluded,
          targets: outcome.targets,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Every run on this work package, newest first. The audit trail of scoring. */
workPackageEvaluationRouter.get(
  "/runs",
  requirePermission("evaluation:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      response.json({
        data: { runs: await listEvaluationRuns(workPackageId, user.organizationId) },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * One run, exactly as it was recorded: the criteria that were applied, the
 * scores that were calculated and the ranking that was shown.
 */
workPackageEvaluationRouter.get(
  "/runs/:runId",
  requirePermission("evaluation:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      const runId = parseIdOr404(request.params.runId, "evaluation run");
      const run = await findEvaluationRun(runId, workPackageId, user.organizationId);
      if (run === undefined) {
        throw new ApiError(404, "NOT_FOUND", "The evaluation run was not found.");
      }

      response.json({ data: { run, results: await listEvaluationResults(run.id) } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Side-by-side comparison
// ---------------------------------------------------------------------------

/**
 * The comparison the official reads before deciding.
 *
 * Assembled from one stored run rather than recomputed, so what is compared is
 * exactly what was calculated and what any decision taken from this screen will
 * cite. Eligibility comes from the Milestone 6 matching run and is read, never
 * re-derived — a second implementation of the gate is a rule that can drift
 * from the one that actually excluded people.
 */
workPackageEvaluationRouter.get(
  "/comparison",
  requirePermission("evaluation:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const requestedRun = request.query.runId;
      const run =
        typeof requestedRun === "string" && uuidSchema.safeParse(requestedRun).success
          ? await findEvaluationRun(requestedRun, workPackageId, user.organizationId)
          : await findLatestEvaluationRun(workPackageId, user.organizationId);

      if (run === undefined) {
        throw new ApiError(
          409,
          "NO_EVALUATION_RUN",
          "No evaluation has been run for this work package yet.",
        );
      }

      const [results, eligibility, analyses, decisions, requirements] = await Promise.all([
        listEvaluationResults(run.id),
        findMatchEligibility(workPackageId),
        latestAiAnalysesForWorkPackage(workPackageId, user.organizationId),
        listDecisions(workPackageId, user.organizationId),
        listConfirmedRequirementsForPackage(workPackageId),
      ]);

      response.json({
        data: {
          workPackage: {
            id: scoped.workPackageId,
            projectId: scoped.projectId,
            packageNumber: scoped.packageNumber,
            title: scoped.title,
            projectTitle: scoped.projectTitle,
          },
          run,
          requirements,
          columns: results
            .filter((result) => result.ranked)
            .map((result) => ({
              ...result,
              eligibility: eligibility.get(result.vendorProfileId) ?? null,
              aiAnalysis: analyses.get(result.responseId) ?? null,
              decision:
                decisions.find(
                  (decision) =>
                    decision.responseId === result.responseId && decision.status === "ACTIVE",
                ) ?? null,
            })),
          excluded: results.filter((result) => !result.ranked),
          decisions,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// One response's evaluation
// ---------------------------------------------------------------------------

workPackageEvaluationRouter.get(
  "/responses/:responseId",
  requirePermission("evaluation:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);
      const responseId = parseIdOr404(request.params.responseId, "response");

      const detail = await findGovernmentResponse(responseId, user.organizationId);
      if (detail === undefined || detail.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      // A department cannot read an unsubmitted draft (D83), and an evaluation
      // screen is not an exception to that.
      if (detail.status === "DRAFT") {
        throw new ApiError(
          409,
          "RESPONSE_NOT_SUBMITTED",
          "This supplier has not submitted its response, so there is nothing to evaluate.",
        );
      }

      const run = await findLatestEvaluationRun(workPackageId, user.organizationId);
      const results = run === undefined ? [] : await listEvaluationResults(run.id);
      const result = results.find((entry) => entry.responseId === responseId) ?? null;

      const [analyses, requirements, requirementAnswers, questionAnswers, documents, eligibility] =
        await Promise.all([
          listAiAnalyses(responseId, user.organizationId),
          listConfirmedRequirementsForPackage(workPackageId),
          listRequirementAnswers(responseId),
          listQuestionAnswers(responseId),
          listResponseDocuments(responseId),
          findMatchEligibility(workPackageId),
        ]);

      const responseConfig = await findConfigForWorkPackage(workPackageId, user.organizationId);
      const questions =
        responseConfig === undefined ? [] : await listQuestions(responseConfig.id);

      const decisions = await listDecisions(workPackageId, user.organizationId);

      response.json({
        data: {
          workPackage: {
            id: scoped.workPackageId,
            projectId: scoped.projectId,
            packageNumber: scoped.packageNumber,
            title: scoped.title,
            projectTitle: scoped.projectTitle,
          },
          response: detail,
          run: run ?? null,
          result,
          requirements,
          requirementAnswers,
          questions,
          questionAnswers,
          documents,
          eligibility: eligibility.get(detail.vendorProfileId) ?? null,
          aiAnalyses: analyses,
          decision:
            decisions.find(
              (decision) => decision.responseId === responseId && decision.status === "ACTIVE",
            ) ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// AI advisory analysis
// ---------------------------------------------------------------------------

/**
 * Asks the AI service to read one submitted response and describe it.
 *
 * Advisory throughout, and structurally so: the result is stored in its own
 * append-only table with no score column, is labelled as advisory wherever it
 * is shown, and is read by nothing in `src/evaluation/`. Generating it does not
 * change a score, a rank or a decision, and regenerating it adds a record
 * rather than replacing one.
 */
workPackageEvaluationRouter.post(
  "/responses/:responseId/ai-analysis",
  requirePermission("evaluation:manage"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);
      const responseId = parseIdOr404(request.params.responseId, "response");

      const detail = await findGovernmentResponse(responseId, user.organizationId);
      if (detail === undefined || detail.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      if (detail.status === "DRAFT") {
        throw new ApiError(
          409,
          "RESPONSE_NOT_SUBMITTED",
          "This supplier has not submitted its response, so there is nothing to read.",
        );
      }

      const [workPackage, requirements, requirementAnswers, questionAnswers, documents] =
        await Promise.all([
          findWorkPackageById(workPackageId),
          listConfirmedRequirementsForPackage(workPackageId),
          listRequirementAnswers(responseId),
          listQuestionAnswers(responseId),
          listResponseDocuments(responseId),
        ]);

      const responseConfig = await findConfigForWorkPackage(workPackageId, user.organizationId);
      const questions =
        responseConfig === undefined ? [] : await listQuestions(responseConfig.id);

      const body = detail.body as unknown as Record<string, unknown>;

      // Only sections that carry text are sent. A blank section adds nothing
      // for the model to read and invites it to fill the silence.
      const sections = RESPONSE_SECTIONS.flatMap((section) =>
        section.fields
          .filter((field) => typeof body[field.key] === "string" && body[field.key] !== "")
          .map((field) => ({ label: field.label, content: String(body[field.key]) })),
      );

      const requirementById = new Map(requirements.map((entry) => [entry.id, entry]));
      const questionById = new Map(questions.map((entry) => [entry.id, entry]));

      const insights = await requestResponseInsights({
        packageNumber: scoped.packageNumber,
        packageTitle: scoped.title,
        packageScope: workPackage?.scope ?? "",
        requirements: requirements.map((entry) => ({
          category: entry.category,
          text: entry.text,
        })),
        responseType: RESPONSE_TYPE_LABELS[detail.responseType],
        supplierName: detail.legalName ?? detail.organizationName,
        sections,
        requirementAnswers: requirementAnswers.map((answer) => ({
          requirement: requirementById.get(answer.requirementId)?.text ?? "Unknown requirement",
          position: answer.compliance,
          answer: answer.answer,
        })),
        questionAnswers: questionAnswers.map((answer) => ({
          prompt: questionById.get(answer.questionId)?.prompt ?? "Departmental question",
          answer: Array.isArray(answer.value)
            ? answer.value.join(", ")
            : String(answer.value ?? ""),
        })),
        documentTitles: documents.map((document) => document.title),
      });

      const run = await findLatestEvaluationRun(workPackageId, user.organizationId);

      const stored = await recordAiAnalysis({
        responseId,
        workPackageId,
        organizationId: user.organizationId,
        vendorProfileId: detail.vendorProfileId,
        evaluationRunId: run?.id ?? null,
        summary: insights.summary,
        technicalFit: insights.technical_fit === "" ? null : insights.technical_fit,
        experienceRelevance:
          insights.experience_relevance === "" ? null : insights.experience_relevance,
        strengths: insights.strengths,
        weaknesses: insights.weaknesses,
        attentionPoints: insights.attention_points,
        evidence: insights.evidence,
        provider: insights.provider,
        model: insights.model,
        promptVersion: insights.prompt_version,
        responseTimeMs: insights.response_time_ms,
        generatedBy: user.id,
      });

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "EVALUATION_AI_ANALYSIS",
        null,
        {
          responseId,
          vendorProfileId: detail.vendorProfileId,
          analysisId: stored.id,
          provider: stored.provider,
          model: stored.model,
          promptVersion: stored.promptVersion,
          advisory: true,
        },
        null,
      );

      response.status(201).json({
        data: {
          analysis: stored,
          analyses: await listAiAnalyses(responseId, user.organizationId),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Every analysis generated for one response, newest first. Append-only. */
workPackageEvaluationRouter.get(
  "/responses/:responseId/ai-analysis",
  requirePermission("evaluation:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);
      const responseId = parseIdOr404(request.params.responseId, "response");

      const detail = await findGovernmentResponse(responseId, user.organizationId);
      if (detail === undefined || detail.workPackageId !== workPackageId) {
        throw new ApiError(404, "NOT_FOUND", "The response was not found.");
      }

      response.json({
        data: { analyses: await listAiAnalyses(responseId, user.organizationId) },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// The human decision
// ---------------------------------------------------------------------------

const decisionSchema = z.object({
  responseId: z.string().uuid(),
  decision: z.enum(["SELECTED", "REJECTED"]),
  reason: z
    .string()
    .trim()
    .min(20, "State the reason for this decision in at least a sentence.")
    .max(4000),
  /** The run the official was looking at. Verified server-side before storing. */
  evaluationRunId: z.string().uuid().nullable().default(null),
});

/**
 * Records the decision a named official made.
 *
 * Nothing computes this. The route requires an explicit response id, an
 * explicit decision and a reason the official typed, and refuses without any of
 * the three. The rank and the score are read out of the stored run rather than
 * taken from the request, so the record can never assert a position the system
 * did not produce.
 */
workPackageEvaluationRouter.post(
  "/decisions",
  requirePermission("evaluation:decide"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);

      const body = parseOr400(decisionSchema, request.body);

      // A run id from the browser is checked against this work package and this
      // department before it is stored as the evidence a decision rests on.
      let evaluationRunId: string | null = null;
      if (body.evaluationRunId !== null) {
        const run = await findEvaluationRun(
          body.evaluationRunId,
          workPackageId,
          user.organizationId,
        );
        if (run === undefined) {
          throw new ApiError(
            404,
            "NOT_FOUND",
            "The evaluation this decision refers to was not found.",
          );
        }
        evaluationRunId = run.id;
      }

      const outcome = await recordDecision({
        workPackageId,
        projectId: scoped.projectId,
        organizationId: user.organizationId,
        responseId: body.responseId,
        decision: body.decision,
        reason: body.reason,
        evaluationRunId,
        decidedBy: user.id,
      });

      if ("refusal" in outcome) {
        if (outcome.refusal === "RESPONSE_NOT_FOUND") {
          throw new ApiError(404, "NOT_FOUND", "The response was not found.");
        }
        if (outcome.refusal === "SELECTION_EXISTS") {
          throw new ApiError(
            409,
            "SELECTION_EXISTS",
            "A supplier has already been selected for this work package. Revoke that decision " +
              "before recording another.",
          );
        }
        throw new ApiError(
          409,
          "ALREADY_DECIDED",
          "A decision has already been recorded for this response. Revoke it before recording " +
            "another.",
        );
      }

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        body.decision === "SELECTED" ? "VENDOR_SELECTED" : "VENDOR_REJECTED",
        null,
        {
          decisionId: outcome.decision.id,
          responseId: outcome.decision.responseId,
          vendorProfileId: outcome.decision.vendorProfileId,
          evaluationRunId: outcome.decision.evaluationRunId,
          rankAtDecision: outcome.decision.rankAtDecision,
          scoreAtDecision: outcome.decision.scoreAtDecision,
        },
        body.reason,
      );

      response.status(201).json({
        data: {
          decision: outcome.decision,
          decisions: await listDecisions(workPackageId, user.organizationId),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

const revocationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(20, "State why this decision is being revoked in at least a sentence.")
    .max(4000),
});

/**
 * Revokes a decision.
 *
 * The original row and its reason stay exactly as they were; the revocation is
 * recorded on top with its own actor, moment and reason. Correcting a decision
 * must not erase what the department first decided — that is precisely the
 * record an auditor is looking for.
 */
workPackageEvaluationRouter.post(
  "/decisions/:decisionId/revoke",
  requirePermission("evaluation:decide"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      const scoped = await scopedPackage(workPackageId, user.organizationId);
      const decisionId = parseIdOr404(request.params.decisionId, "decision");

      const body = parseOr400(revocationSchema, request.body);

      const revoked = await revokeDecision({
        decisionId,
        workPackageId,
        organizationId: user.organizationId,
        revocationReason: body.reason,
        revokedBy: user.id,
      });

      if (revoked === undefined) {
        throw new ApiError(
          409,
          "DECISION_NOT_ACTIVE",
          "That decision was not found, or has already been revoked.",
        );
      }

      await recordWorkPackageHistory(
        scoped.projectId,
        workPackageId,
        user.id,
        "DECISION_REVOKED",
        {
          decision: revoked.decision,
          responseId: revoked.responseId,
          vendorProfileId: revoked.vendorProfileId,
        },
        { decisionId: revoked.id, status: revoked.status },
        body.reason,
      );

      response.json({
        data: {
          decision: revoked,
          decisions: await listDecisions(workPackageId, user.organizationId),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Every decision recorded on this work package, live and revoked. */
workPackageEvaluationRouter.get(
  "/decisions",
  requirePermission("evaluation:read"),
  async (request, response, next) => {
    try {
      const user = getCurrentUser(request);
      const workPackageId = parsePackageIdOr404(request.params.workPackageId);
      await scopedPackage(workPackageId, user.organizationId);

      response.json({
        data: { decisions: await listDecisions(workPackageId, user.organizationId) },
      });
    } catch (error) {
      next(error);
    }
  },
);
