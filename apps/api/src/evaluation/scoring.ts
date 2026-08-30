/**
 * Deterministic weighted scoring of vendor responses.
 *
 * No model decides a number in this file. Every score is arithmetic over values
 * a supplier stated in its submission or recorded on its capability profile,
 * and every score carries the sentence that explains how it was reached, quoting
 * the values it was reached from. An official who cannot say why one response
 * scored above another cannot defend the decision that follows from it.
 *
 * Two properties this module is built to hold:
 *
 *  1. **Reproducible.** The same responses, the same criteria and the same
 *     thresholds always produce the same numbers. Nothing reads the clock,
 *     nothing reads a random source, and the relative criteria are computed
 *     from the set of responses being scored, which is stored with the run.
 *
 *  2. **Missing information is never credit.** A field a supplier left blank
 *     scores nothing and is reported as missing. It is never treated as
 *     satisfied, and never quietly averaged away.
 *
 * AI plays no part here. The advisory analysis is generated separately, stored
 * in a separate table, and is not an input to any function in this file.
 */

import { credentialSatisfies } from "../matching/requirementSignals.js";
import type { CandidateVendor } from "../matching/candidate.js";
import { formatInr } from "../matching/requirementSignals.js";
import { tokenise } from "../vendor/capabilityDocument.js";
import type { QuestionType } from "../responses/schema.js";
import {
  compareRequirements,
  type ComplianceFinding,
  type ComplianceSummary,
  type RequirementAnswerInput,
  type RequirementInput,
} from "./compliance.js";
import type {
  CriterionType,
  EvaluationCriterion,
  ScoringMethod,
} from "./criteria.js";
import type { EvaluationTargets } from "./signals.js";

/** Bumped whenever a scoring formula changes (provenance). */
export const SCORING_VERSION = 1;

/** Government-experience levels, as declared on the capability profile. */
const GOVERNMENT_EXPERIENCE_CREDIT: Record<string, number> = {
  NONE: 0,
  LOCAL_BODY: 12,
  STATE: 18,
  PSU: 18,
  CENTRAL: 22,
  MULTIPLE: 25,
};

/** What one relevant recorded engagement is worth, and the ceiling on them. */
const EXPERIENCE_PER_ENGAGEMENT = 25;
const EXPERIENCE_ENGAGEMENT_CEILING = 75;

/** A response that says nothing about its experience is capped here. */
const UNSTATED_EXPERIENCE_CEILING = 50;

const MINIMUM_SUBSTANTIVE_TEXT = 20;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The stored response values the scorer reads. Exactly the M8 columns. */
export interface ResponseValues {
  summary: string | null;
  technicalApproach: string | null;
  technicalStandards: string | null;
  executionPlan: string | null;
  teamComposition: string | null;
  timelineSummary: string | null;
  estimatedDurationWeeks: number | null;
  proposedStartDate: string | null;
  capacityStatement: string | null;
  committedTeamSize: number | null;
  experienceSummary: string | null;
  complianceStatement: string | null;
  complianceConfirmed: boolean;
  commercialSummary: string | null;
  quotedValueInr: number | null;
  priceValidityDays: number | null;
  paymentTerms: string | null;
  taxesIncluded: boolean | null;
}

export interface QuestionDefinition {
  id: string;
  prompt: string;
  answerType: QuestionType;
}

/** One response, with everything the scorer needs already loaded. */
export interface EvaluationSubject {
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  submittedAt: string | null;
  submissionCount: number;
  documentCount: number;

  values: ResponseValues;
  requirementAnswers: readonly RequirementAnswerInput[];
  questionAnswers: ReadonlyMap<string, unknown>;

  /** The supplier's capability profile, where it could be loaded. */
  vendor: CandidateVendor | undefined;

  /**
   * What the Milestone 8 completeness check said was still outstanding. Reused
   * rather than recomputed, so "missing information" means the same thing to
   * the evaluation as it did to the submission gate (D80).
   */
  outstandingItems: ReadonlyArray<{ field: string; message: string }>;
}

export interface ScoringContext {
  criteria: readonly EvaluationCriterion[];
  requirements: readonly RequirementInput[];
  questions: readonly QuestionDefinition[];
  targets: EvaluationTargets;
  /** The package's domain vocabulary, from `normalizeWorkPackage`. */
  packageTerms: readonly string[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface CriterionScore {
  criterionKey: string;
  criterionType: CriterionType;
  label: string;
  weight: number;
  method: ScoringMethod;
  /** 0–100, whole numbers, comparable across responses within a run. */
  score: number;
  /** score x weight / 100, to two decimals. The criterion's share of the total. */
  weightedContribution: number;
  /** How this number was reached, quoting the values it was reached from. */
  basis: string;
  /** Where each value was read from, named so an official can go and check. */
  evidence: string[];
  /** True when the data the criterion needs was absent from the response. */
  missing: boolean;
}

export interface MissingInformationItem {
  /** The criterion or response field the gap belongs to. */
  source: string;
  message: string;
}

export interface StructuredSummary {
  quotedValueInr: number | null;
  priceValidityDays: number | null;
  taxesIncluded: boolean | null;
  estimatedDurationWeeks: number | null;
  proposedStartDate: string | null;
  committedTeamSize: number | null;
  profileTeamSize: number | null;
  complianceConfirmed: boolean;
  documentCount: number;
  certificationsRequired: number;
  certificationsEvidenced: number;
  governmentExperience: string | null;
  verificationState: string | null;
  submissionCount: number;
}

export interface ResponseEvaluation {
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  totalScore: number;
  criterionScores: CriterionScore[];
  compliance: ComplianceFinding[];
  complianceSummary: ComplianceSummary;
  missingInformation: MissingInformationItem[];
  strengths: string[];
  gaps: string[];
  structuredSummary: StructuredSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function substantive(value: string | null): boolean {
  return value !== null && value.trim().length >= MINIMUM_SUBSTANTIVE_TEXT;
}

function present(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

function ratio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : clamp(Math.round((numerator / denominator) * 100));
}

function weighted(score: number, weight: number): number {
  return Math.round(((score * weight) / 100) * 100) / 100;
}

/** Whole weeks, so a duration is never rendered as a fraction of one. */
function weeksLabel(weeks: number): string {
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Cross-response aggregates
// ---------------------------------------------------------------------------

/**
 * The best value in the set, per relative criterion.
 *
 * Relative scoring is what makes a price criterion meaningful without the
 * department having to state a target price it does not know. The set is the
 * responses being scored in this run, and the run stores every one of them, so
 * a stored result stays reproducible.
 */
interface Aggregates {
  lowestCompliantQuote: number | null;
  shortestCompliantDuration: number | null;
  largestCommittedTeam: number | null;
  /** Per custom NUMBER question: the smallest and largest answer given. */
  questionExtremes: Map<string, { min: number; max: number }>;
}

function computeAggregates(
  subjects: readonly EvaluationSubject[],
  context: ScoringContext,
): Aggregates {
  const { budgetCeilingInr, durationCeilingWeeks, minimumTeamSize } = context.targets;

  const quotes = subjects
    .map((subject) => subject.values.quotedValueInr)
    .filter((value): value is number => value !== null && value > 0)
    .filter((value) => budgetCeilingInr === null || value <= budgetCeilingInr);

  const durations = subjects
    .map((subject) => subject.values.estimatedDurationWeeks)
    .filter((value): value is number => value !== null && value > 0)
    .filter((value) => durationCeilingWeeks === null || value <= durationCeilingWeeks);

  const teams = subjects
    .map((subject) => subject.values.committedTeamSize)
    .filter((value): value is number => value !== null && value > 0)
    .filter((value) => minimumTeamSize === null || value >= minimumTeamSize);

  const questionExtremes = new Map<string, { min: number; max: number }>();
  for (const question of context.questions) {
    if (question.answerType !== "NUMBER") continue;

    const values = subjects
      .map((subject) => subject.questionAnswers.get(question.id))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (values.length > 0) {
      questionExtremes.set(question.id, {
        min: Math.min(...values),
        max: Math.max(...values),
      });
    }
  }

  return {
    lowestCompliantQuote: quotes.length === 0 ? null : Math.min(...quotes),
    shortestCompliantDuration: durations.length === 0 ? null : Math.min(...durations),
    largestCommittedTeam: teams.length === 0 ? null : Math.max(...teams),
    questionExtremes,
  };
}

// ---------------------------------------------------------------------------
// Per-criterion scoring
// ---------------------------------------------------------------------------

interface CriterionOutcome {
  score: number;
  method: ScoringMethod;
  basis: string;
  evidence: string[];
  missing: boolean;
}

function scorePrice(
  subject: EvaluationSubject,
  criterion: EvaluationCriterion,
  context: ScoringContext,
  aggregates: Aggregates,
): CriterionOutcome {
  const quoted = subject.values.quotedValueInr;
  const ceiling = criterion.targetValue ?? context.targets.budgetCeilingInr;
  const ceilingSource =
    criterion.targetValue !== null
      ? "the threshold set on this criterion"
      : context.targets.budgetCeilingSource === "REQUIREMENT"
        ? "the confirmed requirements"
        : null;

  if (quoted === null) {
    return {
      score: 0,
      method: "RELATIVE_BEST",
      basis: "No value was quoted in the commercial section, so no price could be compared.",
      evidence: ["Commercial response — quoted value not stated"],
      missing: true,
    };
  }

  if (ceiling !== null && quoted > ceiling) {
    return {
      score: 0,
      method: "TARGET_THRESHOLD",
      basis:
        `Quoted ${formatInr(quoted)}, above the ceiling of ${formatInr(ceiling)}` +
        (ceilingSource === null ? "" : ` taken from ${ceilingSource}`) +
        ". A quote above the ceiling scores nothing on price.",
      evidence: [`Commercial response — quoted value ${formatInr(quoted)}`],
      missing: false,
    };
  }

  const lowest = aggregates.lowestCompliantQuote;
  if (lowest === null || lowest <= 0) {
    return {
      score: 0,
      method: "RELATIVE_BEST",
      basis: "No comparable quote was received, so price could not be scored relatively.",
      evidence: [`Commercial response — quoted value ${formatInr(quoted)}`],
      missing: false,
    };
  }

  const score = clamp(Math.round((lowest / quoted) * 100));

  return {
    score,
    method: "RELATIVE_BEST",
    basis:
      quoted === lowest
        ? `Quoted ${formatInr(quoted)}, the lowest value received, so this scores 100.`
        : `Quoted ${formatInr(quoted)} against a lowest received value of ${formatInr(lowest)}, ` +
          `so this scores ${score} of 100.` +
          (ceiling === null ? "" : ` The ceiling of ${formatInr(ceiling)} is respected.`),
    evidence: [
      `Commercial response — quoted value ${formatInr(quoted)}`,
      `Lowest value received in this evaluation — ${formatInr(lowest)}`,
    ],
    missing: false,
  };
}

function scoreTimeline(
  subject: EvaluationSubject,
  criterion: EvaluationCriterion,
  context: ScoringContext,
  aggregates: Aggregates,
): CriterionOutcome {
  const weeks = subject.values.estimatedDurationWeeks;
  const ceiling = criterion.targetValue ?? context.targets.durationCeilingWeeks;

  if (weeks === null) {
    return {
      score: 0,
      method: "RELATIVE_BEST",
      basis: "No delivery duration was stated, so the timeline could not be compared.",
      evidence: ["Timeline response — estimated duration not stated"],
      missing: true,
    };
  }

  if (ceiling !== null && weeks > ceiling) {
    return {
      score: 0,
      method: "TARGET_THRESHOLD",
      basis:
        `Committed to ${weeksLabel(weeks)}, beyond the maximum of ${weeksLabel(Math.round(ceiling))}` +
        (context.targets.durationSourceText === null
          ? ""
          : ` stated in the requirements ("${context.targets.durationSourceText}")`) +
        ". A duration beyond the maximum scores nothing on timeline.",
      evidence: [`Timeline response — ${weeksLabel(weeks)}`],
      missing: false,
    };
  }

  const shortest = aggregates.shortestCompliantDuration;
  if (shortest === null || shortest <= 0) {
    return {
      score: 0,
      method: "RELATIVE_BEST",
      basis: "No comparable duration was received, so the timeline could not be scored relatively.",
      evidence: [`Timeline response — ${weeksLabel(weeks)}`],
      missing: false,
    };
  }

  const score = clamp(Math.round((shortest / weeks) * 100));

  return {
    score,
    method: "RELATIVE_BEST",
    basis:
      weeks === shortest
        ? `Committed to ${weeksLabel(weeks)}, the shortest duration received, so this scores 100.`
        : `Committed to ${weeksLabel(weeks)} against a shortest received duration of ` +
          `${weeksLabel(shortest)}, so this scores ${score} of 100.`,
    evidence: [
      `Timeline response — ${weeksLabel(weeks)}`,
      `Shortest duration received in this evaluation — ${weeksLabel(shortest)}`,
      ...(subject.values.proposedStartDate === null
        ? []
        : [`Timeline response — earliest start ${subject.values.proposedStartDate}`]),
    ],
    missing: false,
  };
}

function scoreCapacity(
  subject: EvaluationSubject,
  criterion: EvaluationCriterion,
  context: ScoringContext,
  aggregates: Aggregates,
): CriterionOutcome {
  const committed = subject.values.committedTeamSize;
  const minimum = criterion.targetValue ?? context.targets.minimumTeamSize;
  const profileTeam = subject.vendor?.teamSize ?? null;

  const supporting: string[] =
    profileTeam === null
      ? []
      : [`Capability profile — organisation team size ${profileTeam}`];

  if (committed === null) {
    return {
      score: 0,
      method: "RELATIVE_BEST",
      basis:
        "No committed team size was stated, so the capacity offered to this package could not be " +
        "compared.",
      evidence: ["Capacity response — committed team size not stated", ...supporting],
      missing: true,
    };
  }

  if (minimum !== null && committed < minimum) {
    return {
      score: 0,
      method: "TARGET_THRESHOLD",
      basis:
        `Committed ${committed} people, below the minimum of ${Math.round(minimum)} set for this ` +
        "package. A commitment below the minimum scores nothing on capacity.",
      evidence: [`Capacity response — ${committed} people committed`, ...supporting],
      missing: false,
    };
  }

  const largest = aggregates.largestCommittedTeam;
  if (largest === null || largest <= 0) {
    return {
      score: 0,
      method: "RELATIVE_BEST",
      basis: "No comparable commitment was received, so capacity could not be scored relatively.",
      evidence: [`Capacity response — ${committed} people committed`, ...supporting],
      missing: false,
    };
  }

  const score = clamp(Math.round((committed / largest) * 100));

  return {
    score,
    method: "RELATIVE_BEST",
    basis:
      committed === largest
        ? `Committed ${committed} people, the largest commitment received, so this scores 100.`
        : `Committed ${committed} people against a largest commitment of ${largest}, so this ` +
          `scores ${score} of 100.`,
    evidence: [
      `Capacity response — ${committed} people committed`,
      `Largest commitment received in this evaluation — ${largest} people`,
      ...supporting,
    ],
    missing: false,
  };
}

function scoreCompliance(
  subject: EvaluationSubject,
  _criterion: EvaluationCriterion,
  context: ScoringContext,
): CriterionOutcome {
  const required = context.targets.mandatoryCertifications;
  const credentials = subject.vendor?.credentials ?? [];
  const confirmed = subject.values.complianceConfirmed;
  const statement = subject.values.complianceStatement;

  const evidence: string[] = [];
  const satisfied: string[] = [];
  const unmet: string[] = [];

  for (const requirement of required) {
    const holder = credentials.find((credential) =>
      credentialSatisfies(
        requirement.code,
        [credential.name, credential.issuingAuthority ?? "", credential.kind].join(" "),
      ),
    );

    if (holder === undefined) {
      unmet.push(requirement.label);
    } else {
      satisfied.push(requirement.label);
      evidence.push(
        `Capability profile — ${holder.name}` +
          (holder.issuingAuthority === null ? "" : ` (${holder.issuingAuthority})`) +
          (holder.validUntil === null ? "" : `, valid to ${holder.validUntil}`),
      );
    }
  }

  evidence.push(
    confirmed
      ? "Compliance response — the supplier confirmed it can satisfy the stated conditions"
      : "Compliance response — the supplier did not confirm it can satisfy the stated conditions",
  );

  if (required.length === 0) {
    // No mandatory certification was written into the requirements, so there is
    // nothing to evidence against. Reporting a certification check as passed
    // here would be reporting assurance the data cannot support.
    const score = !confirmed ? 0 : substantive(statement) ? 100 : 60;

    return {
      score,
      method: "STATED_POSITION",
      basis:
        "The confirmed requirements name no mandatory certification. " +
        (!confirmed
          ? "The supplier did not confirm it can satisfy the stated compliance conditions."
          : substantive(statement)
            ? "The supplier confirmed compliance and set out the registrations its response relies on."
            : "The supplier confirmed compliance but gave no supporting statement."),
      evidence,
      missing: !confirmed || !substantive(statement),
    };
  }

  const certificationScore = ratio(satisfied.length, required.length);
  const score = clamp(Math.round(certificationScore * 0.8 + (confirmed ? 100 : 0) * 0.2));

  return {
    score,
    method: "COVERAGE_RATIO",
    basis:
      `${satisfied.length} of ${required.length} mandatory certification(s) are evidenced on the ` +
      `supplier's capability profile` +
      (unmet.length === 0 ? "" : ` (not evidenced: ${unmet.join(", ")})`) +
      ". " +
      (confirmed
        ? "The supplier confirmed it can satisfy the stated compliance conditions."
        : "The supplier did not confirm it can satisfy the stated compliance conditions."),
    evidence,
    missing: unmet.length > 0 || !confirmed,
  };
}

function scoreExperience(
  subject: EvaluationSubject,
  _criterion: EvaluationCriterion,
  context: ScoringContext,
): CriterionOutcome {
  const vendor = subject.vendor;
  const packageTerms = new Set(context.packageTerms);

  const relevant =
    vendor === undefined
      ? []
      : vendor.experience.filter((entry) => {
          const text = [entry.title, entry.sector ?? "", entry.description ?? "", entry.outcome ?? ""].join(
            " ",
          );
          return tokenise(text).some((token) => packageTerms.has(token));
        });

  const engagementScore = Math.min(
    EXPERIENCE_ENGAGEMENT_CEILING,
    relevant.length * EXPERIENCE_PER_ENGAGEMENT,
  );

  const governmentLevel = vendor?.governmentExperience ?? null;
  const governmentCredit =
    governmentLevel === null ? 0 : (GOVERNMENT_EXPERIENCE_CREDIT[governmentLevel] ?? 0);

  const stated = substantive(subject.values.experienceSummary);
  const raw = clamp(engagementScore + governmentCredit);
  const score = stated ? raw : Math.min(raw, UNSTATED_EXPERIENCE_CEILING);

  const evidence: string[] = relevant
    .slice(0, 4)
    .map(
      (entry) =>
        `Capability profile — "${entry.title}"` +
        (entry.clientName === null ? "" : ` for ${entry.clientName}`) +
        (entry.endYear === null ? "" : ` (${entry.endYear})`),
    );

  if (governmentLevel !== null && governmentLevel !== "NONE") {
    evidence.push(`Capability profile — declared public-sector delivery: ${governmentLevel}`);
  }

  evidence.push(
    stated
      ? "Experience response — the supplier described comparable work"
      : "Experience response — no comparable work was described",
  );

  return {
    score,
    method: "COVERAGE_RATIO",
    basis:
      `${relevant.length} recorded engagement(s) overlap this package's subject matter` +
      (governmentCredit === 0
        ? ", and no public-sector delivery is declared"
        : `, and public-sector delivery is declared at ${governmentLevel} level`) +
      "." +
      (stated
        ? ""
        : ` The response itself describes no relevant experience, so the score is held at ${UNSTATED_EXPERIENCE_CEILING} or below.`),
    evidence,
    missing: !stated || relevant.length === 0,
  };
}

/**
 * The technical criterion is scored from the response and from the
 * requirement-by-requirement comparison, never from the package's own prose —
 * which is why it takes no `ScoringContext`.
 */
function scoreTechnical(
  subject: EvaluationSubject,
  findings: readonly ComplianceFinding[],
): CriterionOutcome {
  const approach = substantive(subject.values.technicalApproach);
  const standards = present(subject.values.technicalStandards);

  const technicalFindings = findings.filter(
    (finding) =>
      finding.requirementCategory === "FUNCTIONAL" ||
      finding.requirementCategory === "NON_FUNCTIONAL",
  );

  const evidence: string[] = [
    approach
      ? "Technical response — an approach was set out"
      : "Technical response — no technical approach was set out",
    standards
      ? `Technical response — standards stated: ${(subject.values.technicalStandards ?? "").slice(0, 120)}`
      : "Technical response — no standards or specifications were stated",
  ];

  // Weights over the three components. Where the package carries no technical
  // requirements there is nothing to measure the third against, so its share is
  // redistributed across the two that can be measured rather than scored as a
  // failure.
  const hasTechnicalRequirements = technicalFindings.length > 0;
  const approachWeight = hasTechnicalRequirements ? 0.5 : 0.5 / 0.7;
  const standardsWeight = hasTechnicalRequirements ? 0.2 : 0.2 / 0.7;

  let requirementComponent = 0;
  if (hasTechnicalRequirements) {
    const met = technicalFindings.filter((f) => f.status === "COMPLIANT").length;
    const partial = technicalFindings.filter((f) => f.status === "PARTIALLY_COMPLIANT").length;
    requirementComponent =
      ((met + partial * 0.5) / technicalFindings.length) * 100 * 0.3;
    evidence.push(
      `Requirement-by-requirement comparison — ${met} of ${technicalFindings.length} technical ` +
        `requirement(s) met, ${partial} partially met`,
    );
  }

  const score = clamp(
    Math.round(
      (approach ? 100 * approachWeight : 0) +
        (standards ? 100 * standardsWeight : 0) +
        requirementComponent,
    ),
  );

  return {
    score,
    method: "COVERAGE_RATIO",
    basis:
      (approach
        ? "A technical approach was set out"
        : "No technical approach was set out") +
      (standards ? ", standards were stated" : ", no standards were stated") +
      (hasTechnicalRequirements
        ? `, and the response's stated positions on ${technicalFindings.length} technical ` +
          "requirement(s) were counted."
        : ", and this package carries no functional or non-functional requirements to count.") +
      " No model contributes to this number.",
    evidence,
    missing: !approach,
  };
}

function scoreRequirementCompliance(
  summary: ComplianceSummary,
): CriterionOutcome {
  if (summary.total === 0) {
    return {
      score: 0,
      method: "COVERAGE_RATIO",
      basis:
        "This work package carries no confirmed requirements, so there is nothing to compare the " +
        "response against.",
      evidence: ["Confirmed requirements — none recorded on this work package"],
      missing: true,
    };
  }

  return {
    score: summary.coverage,
    method: "COVERAGE_RATIO",
    basis:
      `${summary.compliant} of ${summary.total} requirement(s) are met with a substantiated ` +
      `answer, ${summary.partiallyCompliant} partially. ` +
      `${summary.nonCompliant} are not met and ${summary.insufficientInformation} carry ` +
      "insufficient information, which counts as nothing rather than as compliance.",
    evidence: ["Requirement-by-requirement comparison of the submitted response"],
    missing: summary.insufficientInformation > 0,
  };
}

function scoreCustom(
  subject: EvaluationSubject,
  criterion: EvaluationCriterion,
  context: ScoringContext,
  aggregates: Aggregates,
): CriterionOutcome {
  const question = context.questions.find((entry) => entry.id === criterion.questionId);

  if (question === undefined) {
    return {
      score: 0,
      method: "PRESENCE",
      basis:
        "The departmental question this criterion is scored from is no longer on the response " +
        "form, so nothing could be read for it.",
      evidence: [],
      missing: true,
    };
  }

  const value = subject.questionAnswers.get(question.id);
  const answered = value !== undefined && value !== null && value !== "";

  if (!answered) {
    return {
      score: 0,
      method: "PRESENCE",
      basis: `The supplier did not answer "${question.prompt}".`,
      evidence: [`Departmental question "${question.prompt}" — unanswered`],
      missing: true,
    };
  }

  if (question.answerType === "BOOLEAN") {
    const yes = value === true;
    return {
      score: yes ? 100 : 0,
      method: "STATED_POSITION",
      basis: `The supplier answered "${yes ? "yes" : "no"}" to "${question.prompt}".`,
      evidence: [`Departmental question "${question.prompt}" — ${yes ? "yes" : "no"}`],
      missing: false,
    };
  }

  if (question.answerType === "NUMBER" && typeof value === "number") {
    const extremes = aggregates.questionExtremes.get(question.id);

    if (extremes === undefined) {
      return {
        score: 0,
        method: "RELATIVE_BEST",
        basis: `No comparable answer to "${question.prompt}" was received.`,
        evidence: [`Departmental question "${question.prompt}" — ${value}`],
        missing: false,
      };
    }

    const score =
      criterion.direction === "LOWER_IS_BETTER"
        ? value <= 0
          ? 100
          : clamp(Math.round((extremes.min / value) * 100))
        : extremes.max <= 0
          ? 0
          : clamp(Math.round((value / extremes.max) * 100));

    return {
      score,
      method: "RELATIVE_BEST",
      basis:
        `The supplier answered ${value} to "${question.prompt}". ` +
        (criterion.direction === "LOWER_IS_BETTER"
          ? `The lowest answer received was ${extremes.min}`
          : `The highest answer received was ${extremes.max}`) +
        `, so this scores ${score} of 100.`,
      evidence: [`Departmental question "${question.prompt}" — ${value}`],
      missing: false,
    };
  }

  const rendered = Array.isArray(value) ? value.join(", ") : String(value);

  return {
    score: 100,
    method: "PRESENCE",
    basis:
      `The supplier answered "${question.prompt}". The answer is scored on having been given; ` +
      "its content is placed in front of the reviewing official rather than scored by machine.",
    evidence: [`Departmental question "${question.prompt}" — ${rendered.slice(0, 300)}`],
    missing: false,
  };
}

// ---------------------------------------------------------------------------
// One response
// ---------------------------------------------------------------------------

function buildStrengths(
  scores: readonly CriterionScore[],
  summary: ComplianceSummary,
  subject: EvaluationSubject,
): string[] {
  const strengths: string[] = [];

  for (const score of [...scores].sort((a, b) => b.weightedContribution - a.weightedContribution)) {
    if (score.score < 60) continue;
    strengths.push(`${score.label}: ${score.score}/100 (weight ${score.weight}). ${score.basis}`);
    if (strengths.length === 4) break;
  }

  if (summary.total > 0 && summary.compliant === summary.total) {
    strengths.push(
      `Every one of the ${summary.total} confirmed requirement(s) is met with a substantiated answer.`,
    );
  }

  if (subject.documentCount > 0) {
    strengths.push(
      `${subject.documentCount} supporting document(s) were attached to the submission.`,
    );
  }

  return strengths.slice(0, 6);
}

function buildGaps(
  scores: readonly CriterionScore[],
  findings: readonly ComplianceFinding[],
  summary: ComplianceSummary,
): string[] {
  const gaps: string[] = [];

  const byLostContribution = [...scores].sort(
    (a, b) =>
      weighted(100 - b.score, b.weight) - weighted(100 - a.score, a.weight),
  );

  for (const score of byLostContribution) {
    if (score.score >= 60) continue;
    gaps.push(`${score.label}: ${score.score}/100 (weight ${score.weight}). ${score.basis}`);
    if (gaps.length === 4) break;
  }

  const nonCompliant = findings.filter((finding) => finding.status === "NON_COMPLIANT");
  if (nonCompliant.length > 0) {
    gaps.push(
      `${nonCompliant.length} requirement(s) are stated as not met, including: ` +
        `"${(nonCompliant[0]?.requirementText ?? "").slice(0, 160)}".`,
    );
  }

  if (summary.insufficientInformation > 0) {
    gaps.push(
      `${summary.insufficientInformation} requirement(s) carry insufficient information to judge ` +
        "compliance either way.",
    );
  }

  return gaps.slice(0, 6);
}

export function evaluateResponse(
  subject: EvaluationSubject,
  context: ScoringContext,
  aggregates: Aggregates,
): ResponseEvaluation {
  const { findings, summary } = compareRequirements({
    requirements: context.requirements,
    answers: subject.requirementAnswers,
  });

  const criterionScores: CriterionScore[] = context.criteria.map((criterion) => {
    const outcome = scoreForCriterion(criterion, subject, context, aggregates, findings, summary);

    return {
      criterionKey: criterion.criterionKey,
      criterionType: criterion.criterionType,
      label: criterion.label,
      weight: criterion.weight,
      method: outcome.method,
      score: outcome.score,
      weightedContribution: weighted(outcome.score, criterion.weight),
      basis: outcome.basis,
      evidence: outcome.evidence,
      missing: outcome.missing,
    };
  });

  const totalScore =
    Math.round(
      criterionScores.reduce((sum, score) => sum + score.weightedContribution, 0) * 100,
    ) / 100;

  const missingInformation: MissingInformationItem[] = [];
  const seen = new Set<string>();

  for (const score of criterionScores) {
    if (!score.missing) continue;
    const message = score.basis;
    if (seen.has(message)) continue;
    seen.add(message);
    missingInformation.push({ source: score.label, message });
  }

  for (const item of subject.outstandingItems) {
    const message = `Not provided: ${item.message}`;
    if (seen.has(message)) continue;
    seen.add(message);
    missingInformation.push({ source: "Response completeness", message });
  }

  for (const finding of findings) {
    if (finding.status !== "INSUFFICIENT_INFORMATION") continue;
    const message = `${finding.requirementText.slice(0, 160)} — ${finding.note ?? "no answer recorded"}`;
    if (seen.has(message)) continue;
    seen.add(message);
    missingInformation.push({ source: "Requirement compliance", message });
  }

  const certificationsEvidenced = context.targets.mandatoryCertifications.filter((requirement) =>
    (subject.vendor?.credentials ?? []).some((credential) =>
      credentialSatisfies(
        requirement.code,
        [credential.name, credential.issuingAuthority ?? "", credential.kind].join(" "),
      ),
    ),
  ).length;

  return {
    responseId: subject.responseId,
    vendorProfileId: subject.vendorProfileId,
    organizationName: subject.organizationName,
    legalName: subject.legalName,
    totalScore: Math.max(0, Math.min(100, totalScore)),
    criterionScores,
    compliance: findings,
    complianceSummary: summary,
    missingInformation,
    strengths: buildStrengths(criterionScores, summary, subject),
    gaps: buildGaps(criterionScores, findings, summary),
    structuredSummary: {
      quotedValueInr: subject.values.quotedValueInr,
      priceValidityDays: subject.values.priceValidityDays,
      taxesIncluded: subject.values.taxesIncluded,
      estimatedDurationWeeks: subject.values.estimatedDurationWeeks,
      proposedStartDate: subject.values.proposedStartDate,
      committedTeamSize: subject.values.committedTeamSize,
      profileTeamSize: subject.vendor?.teamSize ?? null,
      complianceConfirmed: subject.values.complianceConfirmed,
      documentCount: subject.documentCount,
      certificationsRequired: context.targets.mandatoryCertifications.length,
      certificationsEvidenced,
      governmentExperience: subject.vendor?.governmentExperience ?? null,
      verificationState: subject.vendor?.verificationState ?? null,
      submissionCount: subject.submissionCount,
    },
  };
}

function scoreForCriterion(
  criterion: EvaluationCriterion,
  subject: EvaluationSubject,
  context: ScoringContext,
  aggregates: Aggregates,
  findings: readonly ComplianceFinding[],
  summary: ComplianceSummary,
): CriterionOutcome {
  switch (criterion.criterionType) {
    case "PRICE":
      return scorePrice(subject, criterion, context, aggregates);
    case "TIMELINE":
      return scoreTimeline(subject, criterion, context, aggregates);
    case "CAPACITY":
      return scoreCapacity(subject, criterion, context, aggregates);
    case "COMPLIANCE":
      return scoreCompliance(subject, criterion, context);
    case "EXPERIENCE":
      return scoreExperience(subject, criterion, context);
    case "TECHNICAL":
      return scoreTechnical(subject, findings);
    case "REQUIREMENT_COMPLIANCE":
      return scoreRequirementCompliance(summary);
    case "CUSTOM":
      return scoreCustom(subject, criterion, context, aggregates);
  }
}

/**
 * Scores every response in one pass.
 *
 * Taking the whole set is not an optimisation: the relative criteria are only
 * defined against a set, and scoring one response at a time would make its
 * price score depend on the order requests arrived in.
 */
export function evaluateResponses(
  subjects: readonly EvaluationSubject[],
  context: ScoringContext,
): ResponseEvaluation[] {
  const aggregates = computeAggregates(subjects, context);
  return subjects.map((subject) => evaluateResponse(subject, context, aggregates));
}

/** Exposed for tests: the aggregate step is where relative scoring is decided. */
export { computeAggregates };
export type { Aggregates };
