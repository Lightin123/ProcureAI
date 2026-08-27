import { apiRequest } from "./client.js";

export type RequirementKind = "REQUIREMENT" | "CONSTRAINT";
export type RequirementCategory =
  | "FUNCTIONAL"
  | "NON_FUNCTIONAL"
  | "BUDGET"
  | "TIMELINE"
  | "COMPLIANCE"
  | "OTHER";

export interface ProjectRequirement {
  id: string;
  kind: RequirementKind;
  category: RequirementCategory;
  text: string;
  rationale: string | null;
  source: "AI_SUGGESTED" | "MANUAL";
  status: "SUGGESTED" | "ACCEPTED" | "REJECTED";
  originalText: string | null;
  rejectionReason: string | null;
  edited: boolean;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  rationale: string | null;
  status: "OPEN" | "ANSWERED" | "DISMISSED";
  answerText: string | null;
}

export interface AnalysisRun {
  id: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  provider: string | null;
  model: string | null;
  errorMessage: string | null;
  triggeredByName: string;
  createdAt: string;
}

export interface StageHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorName: string;
  reason: string | null;
  createdAt: string;
}

export interface RequirementsView {
  projectStatus: string;
  requirements: ProjectRequirement[];
  clarifications: ClarificationQuestion[];
  analysisRuns: AnalysisRun[];
  stageHistory: StageHistoryEntry[];
}

const base = (projectId: string) => `/api/v1/projects/${projectId}/requirements`;

export async function getRequirements(projectId: string, signal?: AbortSignal) {
  return apiRequest<RequirementsView>(base(projectId), { signal });
}

export async function runAnalysis(projectId: string) {
  return apiRequest<{ runId: string; suggestedRequirements: number; clarificationQuestions: number }>(
    `${base(projectId)}/analysis`,
    { method: "POST" },
  );
}

export async function decideRequirement(
  projectId: string,
  requirementId: string,
  decision: { action: "accept" } | { action: "edit"; text: string } | { action: "reject"; reason: string },
) {
  return apiRequest<ProjectRequirement>(`${base(projectId)}/${requirementId}`, {
    method: "PATCH",
    body: decision,
  });
}

export async function addRequirement(
  projectId: string,
  input: { kind: RequirementKind; category: RequirementCategory; text: string },
) {
  return apiRequest<ProjectRequirement>(base(projectId), { method: "POST", body: input });
}

export async function answerClarification(projectId: string, questionId: string, answer: string) {
  return apiRequest<ClarificationQuestion>(
    `${base(projectId)}/clarifications/${questionId}/answer`,
    { method: "POST", body: { answer } },
  );
}

export async function confirmRequirements(projectId: string) {
  return apiRequest<{ status: string; acceptedRequirements: number; unansweredClarifications: number }>(
    `${base(projectId)}/confirm`,
    { method: "POST" },
  );
}

export async function reopenRequirements(projectId: string) {
  return apiRequest<{ status: string }>(`${base(projectId)}/reopen`, { method: "POST" });
}
