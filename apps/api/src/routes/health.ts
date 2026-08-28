import { Router } from "express";

const SERVICE_NAME = "procureai-api";

export const healthRouter: Router = Router();

/**
 * Public liveness probe (D18). Deliberately minimal: it confirms the process is
 * up and answers nothing about internal infrastructure. Database connectivity,
 * AI service state, and the configured provider and model are diagnostics that
 * name internal components, so they live behind authentication on
 * `GET /api/v1/system/status` instead (D54).
 */
healthRouter.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  });
});
