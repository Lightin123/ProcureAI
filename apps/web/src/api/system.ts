import { apiRequest } from "./client.js";

export interface SystemStatus {
  service: string;
  milestone: string;
  database: string;
  aiService: string;
  aiProvider: string | null;
  aiModel: string | null;
  checkedAt: string;
}

/**
 * Authenticated diagnostics. A successful response also proves the API is
 * reachable, so the page needs no separate liveness call.
 */
export async function fetchSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
  return apiRequest<SystemStatus>("/api/v1/system/status", { signal });
}
