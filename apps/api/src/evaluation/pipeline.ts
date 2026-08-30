/**
 * The response evaluation pipeline.
 *
 *   responses marked READY_FOR_EVALUATION      (Milestone 8's terminal state)
 *     -> configured criteria                   (criteria.ts, validated again here)
 *     -> thresholds resolved                   (signals.ts)
 *     -> requirement-by-requirement comparison  (compliance.ts)
 *     -> deterministic weighted scoring        (scoring.ts)
 *     -> explainable ranking                   (ranking.ts)
 *     -> persisted run with its criteria snapshot
 *     -> government review, then a human decision
 *
 * The stages stay separate for the same reason the matching stages do (D63):
 * collapsing the comparison into the score would make "which requirements were
 * met" unanswerable except through a number, and collapsing the ranking into
 * the scoring would leave the ordering with no explanation of its own.
 *
 * Nothing here calls the AI service. The advisory analysis is a separate
 * request, a separate table and a separate screen, and no value it produces is
 * readable from this file.
 *
 * Nothing here selects a supplier. It produces a ranking and the reasons behind
 * it; a government official decides, in `routes/workPackageEvaluation.ts`, with
 * a reason they typed.
 */

import { normalizeWorkPackage } from "../matching/normalization.js";
import { loadCandidateVendors } from "../matching/retrieval.js";
import { ApiError } from "../middleware/errors.js";
import {
  findEvaluationConfig,
  listEvaluationInputs,
  listQuestionAnswersForResponses,
  listRequirementAnswersForResponses,
  recordEvaluationRun,
  type EvaluationConfig,
  type EvaluationResultWrite,
} from "../repositories/evaluations.js";
import { findConfigForWorkPackage } from "../repositories/responseConfigs.js";
import { listQuestions } from "../repositories/responseConfigs.js";
import {
  findWorkPackageById,
  listConfirmedRequirementsForPackage,
} from "../repositories/workPackages.js";
import { findProjectContext, findScopedWorkPackage } from "../repositories/workPackageMatching.js";
import { evaluateResponseCompleteness } from "../responses/completeness.js";
import type { SectionMode } from "../responses/schema.js";
import { validateCriteria, type ConsistencyProblem } from "./criteria.js";
import { rankEvaluations, type RankedResponse } from "./ranking.js";
import {
  evaluateResponses,
  SCORING_VERSION,
  type EvaluationSubject,
  type QuestionDefinition,
} from "./scoring.js";
import { resolveTargets, type EvaluationTargets } from "./signals.js";

/**
 * The states a response must be in to be scored.
 *
 * Exactly Milestone 8's terminal state, and deliberately only that. A response
 * still under review has not been accepted as complete by the department, and
 * scoring it would put a number against a submission the department has not yet
 * said it is finished with.
 */
const EVALUABLE_STATUSES = new Set(["READY_FOR_EVALUATION"]);

export interface EvaluationRunRequest {
  workPackageId: string;
  organizationId: string;
  userId: string;
}

export interface ExcludedResponse {
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  status: string;
  reason: string;
}

export interface EvaluationOutcome {
  runId: string;
  ranked: RankedResponse[];
  excluded: ExcludedResponse[];
  targets: EvaluationTargets;
  criteriaVersion: number;
  scoringVersion: number;
  durationMs: number;
}

function exclusionReasonFor(status: string): string {
  switch (status) {
    case "WITHDRAWN":
      return "The supplier withdrew this response, so it was not assessed.";
    case "SUBMITTED":
    case "RESUBMITTED":
      return "This response has not been opened for review, so it is not yet ready for evaluation.";
    case "UNDER_REVIEW":
      return "This response is still under review and has not been marked ready for evaluation.";
    case "CLARIFICATION_REQUESTED":
      return "This response is awaiting a clarification from the supplier.";
    default:
      return "This response is not in a state that can be evaluated.";
  }
}

/**
 * Re-validates the stored criteria against the response configuration as it is
 * now.
 *
 * Not a duplicate of the check the configuration screen already ran: the
 * response configuration can change after the criteria were saved, and a
 * commercial section switched off since would leave a price criterion scoring
 * every supplier zero on a field none of them was asked for. The run refuses
 * rather than producing that.
 */
export function assertRunnable(input: {
  config: EvaluationConfig | undefined;
  sections: Readonly<Record<string, SectionMode>>;
  questionIds: readonly string[];
  requirementCount: number;
}): EvaluationConfig {
  if (input.config === undefined) {
    throw new ApiError(
      409,
      "EVALUATION_NOT_CONFIGURED",
      "Configure the evaluation criteria before evaluating responses.",
    );
  }

  const problems: ConsistencyProblem[] = validateCriteria({
    criteria: input.config.criteria,
    sections: input.sections,
    questionIds: input.questionIds,
  });

  if (
    input.requirementCount === 0 &&
    input.config.criteria.some((criterion) => criterion.criterionType === "REQUIREMENT_COMPLIANCE")
  ) {
    problems.push({
      field: "criteria",
      message:
        "Requirement compliance is configured as a criterion, but this work package carries no " +
        "confirmed requirements to compare responses against.",
    });
  }

  if (problems.length > 0) {
    throw new ApiError(
      409,
      "EVALUATION_CRITERIA_INCONSISTENT",
      "The evaluation criteria cannot be applied as they stand.",
      problems,
    );
  }

  return input.config;
}

export async function runEvaluation(request: EvaluationRunRequest): Promise<EvaluationOutcome> {
  const startedAt = Date.now();

  const scoped = await findScopedWorkPackage(request.workPackageId, request.organizationId);
  if (scoped === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }

  const responseConfig = await findConfigForWorkPackage(
    request.workPackageId,
    request.organizationId,
  );
  if (responseConfig === undefined) {
    throw new ApiError(
      409,
      "RESPONSE_NOT_CONFIGURED",
      "No response has been asked for on this work package, so there is nothing to evaluate.",
    );
  }

  const [evaluationConfig, questions, requirements, inputs] = await Promise.all([
    findEvaluationConfig(request.workPackageId, request.organizationId),
    listQuestions(responseConfig.id),
    listConfirmedRequirementsForPackage(request.workPackageId),
    listEvaluationInputs(request.workPackageId, request.organizationId),
  ]);

  const config = assertRunnable({
    config: evaluationConfig,
    sections: responseConfig.sections,
    questionIds: questions.map((question) => question.id),
    requirementCount: requirements.length,
  });

  const evaluable = inputs.filter((input) => EVALUABLE_STATUSES.has(input.status));
  const excludedInputs = inputs.filter((input) => !EVALUABLE_STATUSES.has(input.status));

  if (evaluable.length === 0) {
    throw new ApiError(
      409,
      "NO_RESPONSES_READY",
      "No response on this work package has been marked ready for evaluation. Review each " +
        "submitted response and mark it ready before evaluating.",
    );
  }

  // The package's own vocabulary and hard constraints, from the same
  // normalization the matching pipeline used. Re-deriving them here would put
  // two readings of one requirement in front of the same official.
  const workPackage = await findWorkPackageById(request.workPackageId);
  const projectContext = await findProjectContext(scoped.projectId);
  if (workPackage === undefined || projectContext === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }

  const normalized = normalizeWorkPackage({
    workPackage,
    projectTitle: projectContext.title,
    projectProblemDescription: projectContext.problemDescription,
  });

  const targets = resolveTargets({
    requirementTexts: requirements.map((requirement) => requirement.text),
    normalizedCeilingInr: normalized.estimatedValueCeilingInr,
    mandatoryCertifications: normalized.mandatoryCertifications,
    configuredBudgetCeilingInr: targetFor(config, "PRICE"),
    configuredDurationCeilingWeeks: targetFor(config, "TIMELINE"),
    configuredMinimumTeamSize: targetFor(config, "CAPACITY"),
  });

  const responseIds = evaluable.map((input) => input.responseId);

  const [requirementAnswers, questionAnswers, vendors] = await Promise.all([
    listRequirementAnswersForResponses(responseIds),
    listQuestionAnswersForResponses(responseIds),
    loadCandidateVendors(evaluable.map((input) => input.vendorProfileId)),
  ]);

  const questionDefinitions: QuestionDefinition[] = questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    answerType: question.answerType,
  }));

  const subjects: EvaluationSubject[] = evaluable.map((input) => {
    const answers = requirementAnswers.get(input.responseId) ?? [];
    const customAnswers = questionAnswers.get(input.responseId) ?? new Map<string, unknown>();

    // The same completeness computation the supplier saw and the submission
    // gate applied (D80). Reused rather than recomputed, so "missing
    // information" means one thing across the whole platform.
    const completeness = evaluateResponseCompleteness({
      sections: responseConfig.sections,
      documentsRequired: responseConfig.documentsRequired,
      allowDocuments: responseConfig.allowDocuments,
      values: input.values as unknown as Record<string, unknown>,
      requirements,
      requirementAnswers: answers,
      questions,
      questionAnswers: [...customAnswers.entries()].map(([questionId, value]) => ({
        questionId,
        value,
      })),
      documentCount: input.documentCount,
    });

    return {
      responseId: input.responseId,
      vendorProfileId: input.vendorProfileId,
      organizationName: input.organizationName,
      legalName: input.legalName,
      submittedAt: input.submittedAt,
      submissionCount: input.submissionCount,
      documentCount: input.documentCount,
      values: input.values,
      requirementAnswers: answers,
      questionAnswers: customAnswers,
      vendor: vendors.get(input.vendorProfileId),
      outstandingItems: completeness.missing,
    };
  });

  const evaluations = evaluateResponses(subjects, {
    criteria: config.criteria,
    requirements,
    questions: questionDefinitions,
    targets,
    packageTerms: normalized.terms,
  });

  const submittedAtByResponse = new Map(
    evaluable.map((input) => [input.responseId, input.submittedAt] as const),
  );

  const ranked = rankEvaluations(
    evaluations.map((evaluation) => ({
      ...evaluation,
      submittedAt: submittedAtByResponse.get(evaluation.responseId) ?? null,
    })),
  );

  const excluded: ExcludedResponse[] = excludedInputs.map((input) => ({
    responseId: input.responseId,
    vendorProfileId: input.vendorProfileId,
    organizationName: input.organizationName,
    legalName: input.legalName,
    status: input.status,
    reason: exclusionReasonFor(input.status),
  }));

  const results: EvaluationResultWrite[] = [
    ...ranked.map((result) => ({
      responseId: result.responseId,
      vendorProfileId: result.vendorProfileId,
      ranked: true,
      exclusionReason: null,
      rankPosition: result.rankPosition,
      totalScore: result.totalScore,
      criterionScores: result.criterionScores,
      compliance: result.compliance,
      complianceSummary: result.complianceSummary,
      missingInformation: result.missingInformation,
      strengths: result.strengths,
      gaps: result.gaps,
      structuredSummary: {
        ...result.structuredSummary,
        strongestFactors: result.strongestFactors,
        weakestFactors: result.weakestFactors,
        explanation: result.explanation,
      },
    })),
    ...excluded.map((result) => ({
      responseId: result.responseId,
      vendorProfileId: result.vendorProfileId,
      ranked: false,
      exclusionReason: result.reason,
      rankPosition: null,
      totalScore: 0,
      criterionScores: [],
      compliance: [],
      complianceSummary: {},
      missingInformation: [],
      strengths: [] as string[],
      gaps: [] as string[],
      structuredSummary: { status: result.status },
    })),
  ];

  const durationMs = Date.now() - startedAt;

  const runId = await recordEvaluationRun({
    workPackageId: request.workPackageId,
    projectId: scoped.projectId,
    organizationId: request.organizationId,
    configId: config.id,
    scoringVersion: SCORING_VERSION,
    criteriaVersion: config.criteriaVersion,
    criteriaSnapshot: config.criteria,
    requestSnapshot: {
      responseType: responseConfig.responseType,
      sections: responseConfig.sections,
      responseDeadline: responseConfig.responseDeadline,
      documentsRequired: responseConfig.documentsRequired,
      requirements: requirements.map((requirement) => ({
        id: requirement.id,
        kind: requirement.kind,
        category: requirement.category,
        text: requirement.text,
      })),
      questions: questionDefinitions,
      targets,
    },
    durationMs,
    requestedBy: request.userId,
    results,
  });

  return {
    runId,
    ranked,
    excluded,
    targets,
    criteriaVersion: config.criteriaVersion,
    scoringVersion: SCORING_VERSION,
    durationMs,
  };
}

/** The threshold an official set on a criterion of this type, where they set one. */
function targetFor(config: EvaluationConfig, type: string): number | null {
  const criterion = config.criteria.find((entry) => entry.criterionType === type);
  return criterion?.targetValue ?? null;
}
