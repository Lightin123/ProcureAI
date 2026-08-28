import type { NextFunction, Request, RequestHandler, Response } from "express";

import { SESSION_COOKIE_NAME, clearSessionCookie } from "../auth/cookies.js";
import { getCurrentUser } from "../auth/currentUser.js";
import { hasPermission, type Permission } from "../auth/permissions.js";
import { loadConfig } from "../config/env.js";
import { findValidSession, touchSession } from "../repositories/sessions.js";
import { ApiError } from "./errors.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readSessionCookie(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  const token = cookies?.[SESSION_COOKIE_NAME];
  return token === undefined || token === "" ? undefined : token;
}

/**
 * Mounted on the /api/v1 prefix rather than on individual routes, so a route
 * added by a later milestone is authenticated whether or not its author
 * remembered. The default is closed.
 */
export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readSessionCookie(request);
    if (token === undefined) {
      throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
    }

    const session = await findValidSession(token);
    if (session === undefined) {
      clearSessionCookie(response);
      throw new ApiError(
        401,
        "SESSION_EXPIRED",
        "Your session has ended. Sign in again to continue.",
      );
    }

    request.user = session.user;
    await touchSession(session.user.sessionId, session.lastSeenAt);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Routes declare a permission; the role-to-permission mapping lives in one
 * place, so authorization can be audited without reading every route file.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (request, _response, next) => {
    try {
      const user = getCurrentUser(request);

      if (!hasPermission(user.role, permission)) {
        // The required permission is logged but not returned, so a caller
        // probing endpoints cannot map the authorization model.
        console.warn(
          `FORBIDDEN ${request.method} ${request.originalUrl} ` +
            `user=${user.id} role=${user.role} required=${permission}`,
        );
        throw new ApiError(403, "FORBIDDEN", "Your role does not permit this action.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Second, independent barrier behind SameSite=Strict. Requests without an
 * Origin header (curl, same-origin navigations in some browsers) are allowed
 * through; a request that declares a foreign origin is not.
 */
export function requireSameOrigin(request: Request, _response: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(request.method)) {
    next();
    return;
  }

  const origin = request.get("origin");
  if (origin === undefined || loadConfig().allowedOrigins.includes(origin)) {
    next();
    return;
  }

  next(new ApiError(403, "INVALID_ORIGIN", "The request origin is not allowed."));
}
