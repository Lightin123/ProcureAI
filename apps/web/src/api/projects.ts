import { apiRequest } from "./client.js";

export interface ProcurementProject {
  id: string;
  referenceNumber: string;
  title: string;
  problemDescription: string;
  status: string;
  organizationName: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
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
