export interface ApiErrorDetail {
  field: string;
  message: string;
}

export class ApiRequestError extends Error {
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function parseErrorPayload(payload: unknown): ApiRequestError {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "object" && error !== null) {
      const record = error as Record<string, unknown>;
      const code = typeof record.code === "string" ? record.code : "UNKNOWN_ERROR";
      const message =
        typeof record.message === "string" ? record.message : "The request could not be completed.";
      const details = Array.isArray(record.details)
        ? (record.details as unknown[]).flatMap((item) => {
            if (typeof item !== "object" || item === null) return [];
            const detail = item as Record<string, unknown>;
            return typeof detail.field === "string" && typeof detail.message === "string"
              ? [{ field: detail.field, message: detail.message }]
              : [];
          })
        : [];
      return new ApiRequestError(code, message, details);
    }
  }

  return new ApiRequestError("UNKNOWN_ERROR", "The request could not be completed.");
}

type UnauthorizedHandler = (code: string) => void;

let onUnauthorized: UnauthorizedHandler | undefined;

/**
 * Registered once by the auth provider. Every 401 from any request flows
 * through here, so no component needs its own session-expiry handling.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | undefined): void {
  onUnauthorized = handler;
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    // The session cookie is HttpOnly and same-origin through the Vite proxy.
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: options.signal,
  });

  let payload: unknown = undefined;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const error = parseErrorPayload(payload);

    // The login endpoint answers 401 for bad credentials; that is a form error,
    // not an ended session, so it must not tear the session state down.
    if (response.status === 401 && !path.endsWith("/auth/login")) {
      onUnauthorized?.(error.code);
    }

    throw error;
  }

  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new ApiRequestError("UNEXPECTED_RESPONSE", "The server returned an unexpected response.");
  }

  return (payload as { data: T }).data;
}
