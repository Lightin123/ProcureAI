/**
 * Explainable ranking of evaluated responses.
 *
 * The ordering is a consequence of the deterministic scores and nothing else.
 * No model produces a position, influences one, or is consulted about one — the
 * advisory analysis is generated separately, stored separately, and is not an
 * input to any function in this file.
 *
 * A rank is only useful if the official can see what produced it, so every
 * ranked response carries its strongest and weakest factors, measured in the
 * currency that actually decided the order: **weighted contribution**, not raw
 * criterion score. A criterion scored 90 at weight 5 moved the total less than
 * one scored 60 at weight 30, and an explanation that named the first as the
 * strongest factor would be describing a different ranking from the one shown.
 */

import type { CriterionScore, ResponseEvaluation } from "./scoring.js";

export interface RankingFactor {
  criterionKey: string;
  label: string;
  score: number;
  weight: number;
  weightedContribution: number;
  /** For a weak factor, the contribution the response did not earn. */
  forgoneContribution: number;
  basis: string;
}

export interface RankedResponse extends ResponseEvaluation {
  rankPosition: number;
  strongestFactors: RankingFactor[];
  weakestFactors: RankingFactor[];
  /** One sentence an official can read before opening anything. */
  explanation: string;
}

function toFactor(score: CriterionScore): RankingFactor {
  return {
    criterionKey: score.criterionKey,
    label: score.label,
    score: score.score,
    weight: score.weight,
    weightedContribution: score.weightedContribution,
    forgoneContribution:
      Math.round((((100 - score.score) * score.weight) / 100) * 100) / 100,
    basis: score.basis,
  };
}

/**
 * Deterministic ordering.
 *
 * Total first, then three tie-breaks that are themselves facts about the
 * responses rather than arbitrary: how much of the requirement set was met,
 * then the lower price, then the earlier submission. The response id is the
 * final tie-break so that two identical submissions never swap places between
 * runs.
 */
export function compareEvaluations(
  left: ResponseEvaluation & { submittedAt: string | null },
  right: ResponseEvaluation & { submittedAt: string | null },
): number {
  if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;

  if (right.complianceSummary.coverage !== left.complianceSummary.coverage) {
    return right.complianceSummary.coverage - left.complianceSummary.coverage;
  }

  const leftQuote = left.structuredSummary.quotedValueInr;
  const rightQuote = right.structuredSummary.quotedValueInr;
  if (leftQuote !== rightQuote) {
    if (leftQuote === null) return 1;
    if (rightQuote === null) return -1;
    return leftQuote - rightQuote;
  }

  if (left.submittedAt !== right.submittedAt) {
    if (left.submittedAt === null) return 1;
    if (right.submittedAt === null) return -1;
    return left.submittedAt.localeCompare(right.submittedAt);
  }

  return left.responseId.localeCompare(right.responseId);
}

function buildExplanation(
  evaluation: ResponseEvaluation,
  rankPosition: number,
  total: number,
  strongest: readonly RankingFactor[],
  weakest: readonly RankingFactor[],
): string {
  const name = evaluation.legalName ?? evaluation.organizationName;
  const summary = evaluation.complianceSummary;

  const lead =
    `${name} ranks ${rankPosition} of ${total} on the configured criteria with ` +
    `${evaluation.totalScore.toFixed(2)} of 100.`;

  const compliance =
    summary.total === 0
      ? ""
      : ` ${summary.compliant} of ${summary.total} requirement(s) are met with a substantiated answer` +
        (summary.insufficientInformation === 0
          ? "."
          : `, and ${summary.insufficientInformation} carry insufficient information.`);

  const best =
    strongest[0] === undefined
      ? ""
      : ` Strongest factor: ${strongest[0].label} (${strongest[0].score}/100, contributing ` +
        `${strongest[0].weightedContribution.toFixed(2)} points).`;

  const worst =
    weakest[0] === undefined
      ? ""
      : ` Weakest factor: ${weakest[0].label} (${weakest[0].score}/100, forgoing ` +
        `${weakest[0].forgoneContribution.toFixed(2)} points).`;

  return `${lead}${compliance}${best}${worst}`;
}

/**
 * Orders the evaluations and attaches the explanation of each position.
 *
 * `submittedAt` is carried alongside the evaluation rather than inside it: it
 * is a fact about the submission, not about the assessment, and the scorer has
 * no business reading it.
 */
export function rankEvaluations(
  evaluations: ReadonlyArray<ResponseEvaluation & { submittedAt: string | null }>,
): RankedResponse[] {
  const ordered = [...evaluations].sort(compareEvaluations);

  return ordered.map((evaluation, index) => {
    const factors = evaluation.criterionScores.map(toFactor);

    const strongestFactors = [...factors]
      .filter((factor) => factor.weightedContribution > 0)
      .sort((a, b) => b.weightedContribution - a.weightedContribution)
      .slice(0, 3);

    const weakestFactors = [...factors]
      .filter((factor) => factor.forgoneContribution > 0)
      .sort((a, b) => b.forgoneContribution - a.forgoneContribution)
      .slice(0, 3);

    const rankPosition = index + 1;

    return {
      ...evaluation,
      rankPosition,
      strongestFactors,
      weakestFactors,
      explanation: buildExplanation(
        evaluation,
        rankPosition,
        ordered.length,
        strongestFactors,
        weakestFactors,
      ),
    };
  });
}
