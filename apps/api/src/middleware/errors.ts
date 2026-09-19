import type { NextFunction, Request, Response } from "express";

import { loadConfig } from "../config/env.js";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
  });
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  console.error("Unhandled error:", error);

  // An unhandled error is by definition one nobody wrote a message for, so its
  // text is whatever the failing library produced — a driver error naming a
  // column, a constraint or a host. That is useful in development and is
  // information disclosure in production, where the caller gets the code only.
  const message =
    loadConfig().isProduction || !(error instanceof Error)
      ? "An unexpected error occurred."
      : error.message;

  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message },
  });
}
