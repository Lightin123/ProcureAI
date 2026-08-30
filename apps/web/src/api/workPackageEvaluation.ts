import { apiRequest } from "./client.js";

/**
 * The government evaluation workspace.
 *
 * Government-side only, and deliberately its own module: there is no supplier
 * counterpart to import from here by mistake. A supplier is never shown a
 * score, a rank, a criterion, another supplier's submission or the department's
 * decision reasoning, and none of these types is reachable from the supplier
 * pages.
 *
 * Two things this file makes visible in its shape, because they are the point:
 * the deterministic evaluation and the AI analysis are separate objects that
 * arrive from separate endpoints, and a decision is something an official
 * sends, never something that comes back computed.
 */

export type CriterionType =
  | "PRICE"
  | "TIMELINE"
  | "CAPACITY"
  | "COMPLIANCE"
  | "EXPERIENCE"
  | "TECHNICAL"
  | "REQUIREMENT_COMPLIANCE"
  | "CUSTOM";

export type CriterionDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";

export type ComplianceStatus =
  | "COMPLIANT"
  | "PARTIALLY_COMPLIANT"
  | "NON_COMPLIANT"
  | "INSUFFICIENT_INFORMATION";

export interface CriterionTypeDefinition {
  type: CriterionType;
  label: string;
  description: string;
  method: string;
  requiresSection: string | null;
  direction: CriterionDirection;
  supportsTarget: boolean;
  targetLabel: string | null;
  targetHint: string | null;
  requiresQuestion: boolean;
  defaultWeight: number;
}

export interface CriteriaSchema {
  criterionTypes: CriterionTypeDefinition[];
  directions: CriterionDirection[];
  totalWeight: number;
  presets: Record<string, Array<{ criterionType: CriterionType; label: string; weight: number }>>;
  scoringVersion: number;
  complianceStatuses: Array<{ value: ComplianceStatus; label: string }>;
  sections: Array<{ id: string; label: string }>;
}

export interface EvaluationCriterion {
  id: string;
  criterionKey: string;
  criterionType: CriterionType;
  direction: CriterionDirection;
  label: string;
  description: string | null;
  weight: number;
  targetValue: number | null;
  questionId: string | null;
  displayOrder: number;
}

export interface EvaluationConfig {
  id: string;
  workPackageId: string;
  status: "DRAFT" | "READY";
  criteriaVersion: number;
  title: string | null;
  notes: string | null;
  configuredByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  criteria: EvaluationCriterion[];
}

export interface ConsistencyProblem {
  field: string;
  message: string;
}

export interface CriterionScore {
  criterionKey: string;
  criterionType: CriterionType;
  label: string;
  weight: number;
  method: string;
  score: number;
  weightedContribution: number;
  basis: string;
  evidence: string[];
  missing: boolean;
}

export interface ComplianceFinding {
  requirementId: string;
  requirementText: string;
  requirementKind: string;
  requirementCategory: string;
  statedPosition: string | null;
  vendorStatement: string | null;
  vendorNotes: string | null;
  status: ComplianceStatus;
  evidenceSource: string;
  note: string | null;
}

export interface ComplianceSummary {
  total: number;
  compliant: number;
  partiallyCompliant: number;
  nonCompliant: number;
  insufficientInformation: number;
  coverage: number;
}

export interface RankingFactor {
  criterionKey: string;
  label: string;
  score: number;
  weight: number;
  weightedContribution: number;
  forgoneContribution: number;
  basis: string;
}

export interface StructuredSummary {
  quotedValueInr?: number | null;
  priceValidityDays?: number | null;
  taxesIncluded?: boolean | null;
  estimatedDurationWeeks?: number | null;
  proposedStartDate?: string | null;
  committedTeamSize?: number | null;
  profileTeamSize?: number | null;
  complianceConfirmed?: boolean;
  documentCount?: number;
  certificationsRequired?: number;
  certificationsEvidenced?: number;
  governmentExperience?: string | null;
  verificationState?: string | null;
  submissionCount?: number;
  strongestFactors?: RankingFactor[];
  weakestFactors?: RankingFactor[];
  explanation?: string;
  status?: string;
}

export interface EvaluationResult {
  id: string;
  runId: string;
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  ranked: boolean;
  exclusionReason: string | null;
  rankPosition: number | null;
  totalScore: number;
  criterionScores: CriterionScore[];
  compliance: ComplianceFinding[];
  complianceSummary: ComplianceSummary;
  missingInformation: Array<{ source: string; message: string }>;
  strengths: string[];
  gaps: string[];
  structuredSummary: StructuredSummary;
  createdAt: string;
}

export interface EvaluationRun {
  id: string;
  workPackageId: string;
  projectId: string;
  configId: string | null;
  scoringVersion: number;
  criteriaVersion: number;
  criteriaSnapshot: EvaluationCriterion[];
  requestSnapshot: Record<string, unknown>;
  evaluatedCount: number;
  rankedCount: number;
  excludedCount: number;
  durationMs: number;
  requestedByName: string;
  createdAt: string;
}

export interface MatchEligibility {
  eligible: boolean;
  rankPosition: number | null;
  overallScore: number;
  runAt: string;
}

/** Advisory. Carries no score, no rank and no recommendation, by construction. */
export interface AiAnalysis {
  id: string;
  responseId: string;
  vendorProfileId: string;
  evaluationRunId: string | null;
  summary: string;
  technicalFit: string | null;
  experienceRelevance: string | null;
  strengths: Array<{ title: string; detail: string }>;
  weaknesses: Array<{ title: string; detail: string }>;
  attentionPoints: Array<{ title: string; detail: string }>;
  evidence: Array<{ section: string; quote: string }>;
  provider: string;
  model: string;
  promptVersion: string;
  responseTimeMs: number;
  generatedByName: string;
  createdAt: string;
}

export interface ProcurementDecision {
  id: string;
  workPackageId: string;
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  decision: "SELECTED" | "REJECTED";
  status: "ACTIVE" | "REVOKED";
  reason: string;
  evaluationRunId: string | null;
  rankAtDecision: number | null;
  scoreAtDecision: number | null;
  decidedByName: string;
  decidedAt: string;
  revokedByName: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

export interface EvaluationResponseRow {
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  verificationState: string;
  status: string;
  submittedAt: string | null;
  submissionCount: number;
  documentCount: number;
  readyForEvaluation: boolean;
  eligibility: MatchEligibility | null;
  hasAiAnalysis: boolean;
}

export interface EvaluationWorkspace {
  workPackage: {
    id: string;
    projectId: string;
    packageNumber: string;
    title: string;
    status: string;
    projectTitle: string;
  };
  responseConfig: {
    id: string;
    responseType: string;
    responseTypeLabel: string;
    status: string;
    sections: Record<string, string>;
    responseDeadline: string | null;
  } | null;
  questions: Array<{ id: string; prompt: string; answerType: string; section: string }>;
  requirementCount: number;
  config: EvaluationConfig | null;
  consistencyProblems: ConsistencyProblem[];
  responses: EvaluationResponseRow[];
  latestRun: EvaluationRun | null;
  results: EvaluationResult[];
  decisions: ProcurementDecision[];
}

export interface ComparisonColumn extends EvaluationResult {
  eligibility: MatchEligibility | null;
  aiAnalysis: AiAnalysis | null;
  decision: ProcurementDecision | null;
}

export interface EvaluationComparison {
  workPackage: {
    id: string;
    projectId: string;
    packageNumber: string;
    title: string;
    projectTitle: string;
  };
  run: EvaluationRun;
  requirements: Array<{ id: string; kind: string; category: string; text: string }>;
  columns: ComparisonColumn[];
  excluded: EvaluationResult[];
  decisions: ProcurementDecision[];
}

export interface EvaluationResponseView {
  workPackage: {
    id: string;
    projectId: string;
    packageNumber: string;
    title: string;
    projectTitle: string;
  };
  response: {
    id: string;
    organizationName: string;
    legalName: string | null;
    status: string;
    responseType: string;
    submittedAt: string | null;
    submissionCount: number;
    body: Record<string, unknown>;
  };
  run: EvaluationRun | null;
  result: EvaluationResult | null;
  requirements: Array<{ id: string; kind: string; category: string; text: string }>;
  requirementAnswers: Array<{
    requirementId: string;
    compliance: string;
    answer: string | null;
    notes: string | null;
  }>;
  questions: Array<{ id: string; prompt: string; answerType: string }>;
  questionAnswers: Array<{ questionId: string; value: unknown }>;
  documents: Array<{ id: string; title: string; fileName: string; sizeBytes: number }>;
  eligibility: MatchEligibility | null;
  aiAnalyses: AiAnalysis[];
  decision: ProcurementDecision | null;
}

export interface CriterionPayload {
  criterionKey: string;
  criterionType: CriterionType;
  direction: CriterionDirection;
  label: string;
  description: string | null;
  weight: number;
  targetValue: number | null;
  questionId: string | null;
}

function base(workPackageId: string): string {
  return `/api/v1/work-packages/${workPackageId}/evaluation`;
}

export function fetchCriteriaSchema(
  workPackageId: string,
  signal?: AbortSignal,
): Promise<CriteriaSchema> {
  return apiRequest<CriteriaSchema>(`${base(workPackageId)}/criteria-schema`, { signal });
}

export function fetchEvaluationWorkspace(
  workPackageId: string,
  signal?: AbortSignal,
): Promise<EvaluationWorkspace> {
  return apiRequest<EvaluationWorkspace>(base(workPackageId), { signal });
}

export function saveEvaluationConfig(
  workPackageId: string,
  body: { title: string | null; notes: string | null; criteria: CriterionPayload[] },
): Promise<{ config: EvaluationConfig; consistencyProblems: ConsistencyProblem[] }> {
  return apiRequest(`${base(workPackageId)}/config`, { method: "PUT", body });
}

export function runEvaluation(
  workPackageId: string,
): Promise<{ run: EvaluationRun; results: EvaluationResult[] }> {
  return apiRequest(`${base(workPackageId)}/run`, { method: "POST" });
}

export function fetchEvaluationRuns(
  workPackageId: string,
  signal?: AbortSignal,
): Promise<{ runs: EvaluationRun[] }> {
  return apiRequest(`${base(workPackageId)}/runs`, { signal });
}

export function fetchEvaluationRun(
  workPackageId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<{ run: EvaluationRun; results: EvaluationResult[] }> {
  return apiRequest(`${base(workPackageId)}/runs/${runId}`, { signal });
}

export function fetchComparison(
  workPackageId: string,
  runId?: string,
  signal?: AbortSignal,
): Promise<EvaluationComparison> {
  const suffix = runId === undefined ? "" : `?runId=${encodeURIComponent(runId)}`;
  return apiRequest<EvaluationComparison>(`${base(workPackageId)}/comparison${suffix}`, { signal });
}

export function fetchResponseEvaluation(
  workPackageId: string,
  responseId: string,
  signal?: AbortSignal,
): Promise<EvaluationResponseView> {
  return apiRequest<EvaluationResponseView>(
    `${base(workPackageId)}/responses/${responseId}`,
    { signal },
  );
}

export function generateAiAnalysis(
  workPackageId: string,
  responseId: string,
): Promise<{ analysis: AiAnalysis; analyses: AiAnalysis[] }> {
  return apiRequest(`${base(workPackageId)}/responses/${responseId}/ai-analysis`, {
    method: "POST",
  });
}

export function recordDecision(
  workPackageId: string,
  body: {
    responseId: string;
    decision: "SELECTED" | "REJECTED";
    reason: string;
    evaluationRunId: string | null;
  },
): Promise<{ decision: ProcurementDecision; decisions: ProcurementDecision[] }> {
  return apiRequest(`${base(workPackageId)}/decisions`, { method: "POST", body });
}

export function revokeDecision(
  workPackageId: string,
  decisionId: string,
  body: { reason: string },
): Promise<{ decision: ProcurementDecision; decisions: ProcurementDecision[] }> {
  return apiRequest(`${base(workPackageId)}/decisions/${decisionId}/revoke`, {
    method: "POST",
    body,
  });
}

export const COMPLIANCE_BADGE: Record<ComplianceStatus, { label: string; className: string }> = {
  COMPLIANT: { label: "Compliant", className: "gov-badge gov-badge--operational" },
  PARTIALLY_COMPLIANT: { label: "Partially compliant", className: "gov-badge gov-badge--tender" },
  NON_COMPLIANT: { label: "Non-compliant", className: "gov-badge gov-badge--cancelled" },
  INSUFFICIENT_INFORMATION: {
    label: "Insufficient information",
    className: "gov-badge gov-badge--pending",
  },
};

export const DECISION_BADGE: Record<string, { label: string; className: string }> = {
  SELECTED: { label: "Selected", className: "gov-badge gov-badge--operational" },
  REJECTED: { label: "Not selected", className: "gov-badge gov-badge--cancelled" },
};

/** Indian digit grouping, which is what a rupee figure is read in here. */
export function formatInr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not stated";
  return `₹${value.toLocaleString("en-IN")}`;
}
