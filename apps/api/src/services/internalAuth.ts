import { loadConfig } from "../config/env.js";

/**
 * The header that authenticates this process to the AI service.
 *
 * The AI service is an internal component with no user identity of its own, so
 * the credential is a shared secret held only by the backend. It is read from
 * the environment on every call rather than captured at import time, and it is
 * never logged: the error paths in the AI clients report status codes, never
 * the request they sent.
 *
 * When no token is configured the header is simply absent, which keeps local
 * development working against a service that does not require one.
 */
export const INTERNAL_TOKEN_HEADER = "X-Internal-Token";

export function internalHeaders(extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  const { aiServiceToken } = loadConfig();

  return {
    Accept: "application/json",
    ...extra,
    ...(aiServiceToken === undefined ? {} : { [INTERNAL_TOKEN_HEADER]: aiServiceToken }),
  };
}
