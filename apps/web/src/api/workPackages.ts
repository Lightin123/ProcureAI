import { apiRequest } from "./client.js";

export type WorkPackageStatus =
  | "AI_GENERATED"
  | "UNDER_REVIEW"
  | "EDITED"
  | "ACCEPTED"
  | "REJECTED"
  | "MANUAL"
  | "CONFIRMED"
  | "ARCHIVED"
  | "DELETED"
  | "SUGGESTED"
  | "SUPERSEDED";

export type WorkPackageSource =
  | "AI_GENERATED"
  | "MANUAL"
  | "MERGED"
  | "SPLIT"
  | "SINGLE_PROJECT"
  | "AI_DECOMPOSED"
  | "NO_DECOMPOSITION";

export type WorkPackagePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type WorkPackageComplexity = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type HistoryAction =
  | "CREATED"
  | "EDITED"
  | "ACCEPTED"
  | "REJECTED"
  | "SOFT_DELETED"
  | "RESTORED"
  | "DUPLICATED"
  | "MERGED"
  | "SPLIT"
  | "REORDERED";

export interface RequirementLink {
  id?: string;
  requirementId?: string;
  text?: string;
  requirementText?: string;
  category?: string;
  kind?: string;
  rationale?: string | null;
  status?: string;
  isPrimary?: boolean;
}

export interface DependencyLink {
  id?: string;
  packageNumber?: string;
  title?: string;
  dependsOnPackageId?: string;
  dependsOnPackageNumber?: string;
  dependsOnPackageTitle?: string;
  dependencyType?: string;
}

export interface WorkPackageItem {
  id: string;
  projectId: string;
  packageNumber: string;
  title: string;
  description: string;
  scope: string;
  complexity: WorkPackageComplexity;
  priority: WorkPackagePriority;
  estimatedCategory: string;
  deliverables: string[];
  notes: string | null;
  aiReasoning?: string | null;
  confidenceScore?: number | null;
  displayOrder?: number;
  sortOrder?: number;
  status: WorkPackageStatus;
  rejectionReason: string | null;
  source: WorkPackageSource;
  analysisId: string | null;
  version?: number;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedReason?: string | null;
  requirements?: RequirementLink[];
  dependencies?: DependencyLink[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkPackageSummary {
  total: number;
  active?: number;
  suggested?: number;
  underReview?: number;
  accepted: number;
  edited?: number;
  rejected: number;
  manual?: number;
  confirmed?: number;
  deleted: number;
  isReadyForConfirmation?: boolean;
}

export interface WorkPackageAnalysisRun {
  id: string;
  projectId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  promptHash: string | null;
  rawInputHash: string | null;
  decompositionStrategy: string | null;
  recommendations: string[];
  errorMessage: string | null;
  triggeredByName: string;
  createdAt: string;
  completedAt: string | null;
}

export interface WorkPackageHistoryEntry {
  id: string;
  workPackageId: string;
  packageNumber: string;
  packageTitle: string;
  action: HistoryAction;
  actorName: string;
  version: number;
  summary: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export interface WorkPackagesView {
  projectStatus: string;
  packages: WorkPackageItem[];
  summary: WorkPackageSummary;
  analyses: WorkPackageAnalysisRun[];
  history: WorkPackageHistoryEntry[];
}

export interface ManualPackageInput {
  title: string;
  description: string;
  scope: string;
  complexity: WorkPackageComplexity;
  priority: WorkPackagePriority;
  estimatedCategory: string;
  deliverables: string[];
  notes?: string;
  requirementIds?: string[];
  dependencyIds?: string[];
}

export interface UpdatePackageInput {
  title?: string;
  description?: string;
  scope?: string;
  complexity?: WorkPackageComplexity;
  priority?: WorkPackagePriority;
  estimatedCategory?: string;
  deliverables?: string[];
  notes?: string | null;
  requirementIds?: string[];
  dependencyIds?: string[];
}

export interface MergePackagesInput {
  projectId: string;
  packageIds: string[];
  title: string;
  description: string;
  scope: string;
  complexity?: WorkPackageComplexity;
  priority?: WorkPackagePriority;
  estimatedCategory?: string;
  deliverables?: string[];
  notes?: string;
}

export interface SplitChildInput {
  title: string;
  description: string;
  scope: string;
  complexity?: WorkPackageComplexity;
  priority?: WorkPackagePriority;
  estimatedCategory?: string;
  deliverables?: string[];
  requirementIds?: string[];
  dependencyIds?: string[];
}

const baseProject = (projectId: string) => `/api/v1/projects/${projectId}/work-packages`;
const baseDirect = (packageId: string) => `/api/v1/work-packages/${packageId}`;

export async function getWorkPackages(projectId: string, includeDeleted = false, signal?: AbortSignal) {
  const query = includeDeleted ? "?includeDeleted=true" : "";
  return apiRequest<WorkPackagesView>(`${baseProject(projectId)}${query}`, { signal });
}

export async function generateWorkPackages(projectId: string) {
  return apiRequest<{
    analysisId: string;
    packages: WorkPackageItem[];
    message: string;
  }>(`${baseProject(projectId)}/generate`, { method: "POST" });
}

export async function createManualPackage(projectId: string, input: ManualPackageInput) {
  return apiRequest<WorkPackageItem>(`${baseProject(projectId)}/manual`, {
    method: "POST",
    body: input,
  });
}

export async function createNoDecompositionPackage(projectId: string) {
  return apiRequest<{
    package: WorkPackageItem;
    projectStatus: string;
    message: string;
  }>(`${baseProject(projectId)}/no-decomposition`, { method: "POST" });
}

export async function confirmWorkPackages(projectId: string) {
  return apiRequest<{
    projectStatus: string;
    confirmedCount: number;
    message: string;
  }>(`${baseProject(projectId)}/confirm`, { method: "POST" });
}

export async function reorderWorkPackages(projectId: string, orderedIds: string[]) {
  return apiRequest<{ success: boolean }>(`${baseProject(projectId)}/reorder`, {
    method: "POST",
    body: { orderedIds },
  });
}

export async function getWorkPackageDetails(packageId: string) {
  return apiRequest<{
    package: WorkPackageItem;
    history: WorkPackageHistoryEntry[];
  }>(baseDirect(packageId));
}

export async function updateWorkPackage(packageId: string, input: UpdatePackageInput) {
  return apiRequest<WorkPackageItem>(baseDirect(packageId), {
    method: "PUT",
    body: input,
  });
}

export async function acceptWorkPackage(packageId: string) {
  return apiRequest<WorkPackageItem>(`${baseDirect(packageId)}/accept`, { method: "POST" });
}

export async function rejectWorkPackage(packageId: string, reason: string) {
  return apiRequest<WorkPackageItem>(`${baseDirect(packageId)}/reject`, {
    method: "POST",
    body: { reason },
  });
}

export async function softDeleteWorkPackage(packageId: string, reason?: string) {
  return apiRequest<{ success: boolean; message: string }>(baseDirect(packageId), {
    method: "DELETE",
    body: reason ? { reason } : undefined,
  });
}

export async function restoreWorkPackage(packageId: string) {
  return apiRequest<WorkPackageItem>(`${baseDirect(packageId)}/restore`, { method: "POST" });
}

export async function duplicateWorkPackage(packageId: string) {
  return apiRequest<WorkPackageItem>(`${baseDirect(packageId)}/duplicate`, { method: "POST" });
}

export async function mergeWorkPackages(input: MergePackagesInput) {
  return apiRequest<WorkPackageItem>("/api/v1/work-packages/merge", {
    method: "POST",
    body: input,
  });
}

export async function splitWorkPackage(packageId: string, splits: SplitChildInput[]) {
  return apiRequest<{ packages: WorkPackageItem[] }>(`${baseDirect(packageId)}/split`, {
    method: "POST",
    body: { splits },
  });
}

export async function getPackageHistory(packageId: string) {
  return apiRequest<WorkPackageHistoryEntry[]>(`${baseDirect(packageId)}/history`);
}
