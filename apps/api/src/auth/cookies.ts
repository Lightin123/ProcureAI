import type { Response } from "express";

import { loadConfig } from "../config/env.js";

export const SESSION_COOKIE_NAME = "procureai_session";

/**
 * SameSite=Strict is the primary CSRF control: the browser never attaches this
 * cookie to a request initiated by another site. Secure is configurable because
 * local development runs over plain http, where a Secure cookie is dropped.
 */
function cookieOptions(): {
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  path: string;
} {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: loadConfig().sessionCookieSecure,
    path: "/",
  };
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(SESSION_COOKIE_NAME, token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
}
