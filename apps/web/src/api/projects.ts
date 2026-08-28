import { apiRequest } from "./client.js";

export interface ProcurementProject {
  id: string;
  referenceNumber: string;
  title: string;
  problemDescription: string;
  status: string;
  organizationName: string;
  createdByName: string;
  publishedAt: string | null;
  opportunitySummary: string | null;
  responseDeadline: string | null;
  interestCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityInterest {
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  headline: string | null;
  verificationState: string;
  message: string | null;
  submittedAt: string;
}

export interface CreateProjectInput {
  title: string;
  problemDescription: string;
}

export async function listProjects(signal?: AbortSignal): Promise<ProcurementProject[]> {
  return apiRequest<ProcurementProject[]>("/api/v1/projects", { signal });
}

export async function getProject(id: string, signal?: AbortSignal): Promise<ProcurementProject> {
  return apiRequest<ProcurementProject>(`/api/v1/projects/${id}`, { signal });
}

export async function createProject(input: CreateProjectInput): Promise<ProcurementProject> {
  return apiRequest<ProcurementProject>("/api/v1/projects", { method: "POST", body: input });
}

/**
 * Publishes the project as an opportunity suppliers can see. Only the summary
 * written here and the requirements an official has ACCEPTED leave the
 * department.
 */
export async function publishProject(
  id: string,
  input: { summary: string; responseDeadline: string | null },
): Promise<ProcurementProject> {
  return apiRequest<ProcurementProject>(`/api/v1/projects/${id}/publish`, {
    method: "POST",
    body: input,
  });
}

export async function unpublishProject(id: string): Promise<ProcurementProject> {
  return apiRequest<ProcurementProject>(`/api/v1/projects/${id}/unpublish`, { method: "POST" });
}

export async function listProjectInterest(
  id: string,
  signal?: AbortSignal,
): Promise<OpportunityInterest[]> {
  return apiRequest<OpportunityInterest[]>(`/api/v1/projects/${id}/interest`, { signal });
}
