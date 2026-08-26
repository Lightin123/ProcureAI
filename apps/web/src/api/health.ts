export interface HealthResponse {
  status: string;
  service: string;
  milestone: string;
  timestamp: string;
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.status === "string" &&
    typeof candidate.service === "string" &&
    typeof candidate.milestone === "string" &&
    typeof candidate.timestamp === "string"
  );
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/health", {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Backend responded with HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json();

  if (!isHealthResponse(payload)) {
    throw new Error("Backend returned an unexpected response format.");
  }

  return payload;
}
