import { Router } from "express";

import { checkDatabaseConnection } from "../db/pool.js";
import { requirePermission } from "../middleware/auth.js";
import { checkAiService } from "../services/aiClient.js";

const MILESTONE = "5 - Authentication and RBAC";

/**
 * Infrastructure diagnostics. These name internal components and the
 * third-party LLM provider and model, so they sit behind authentication and a
 * permission rather than on the public health endpoint (D54).
 */
export const systemRouter: Router = Router();

systemRouter.get("/status", requirePermission("system:status:read"), async (_request, response) => {
  const [databaseConnected, aiService] = await Promise.all([
    checkDatabaseConnection(),
    checkAiService(),
  ]);

  response.json({
    data: {
      service: "procureai-api",
      milestone: MILESTONE,
      database: databaseConnected ? "connected" : "unavailable",
      aiService: aiService === null ? "unavailable" : "connected",
      aiProvider: aiService?.provider ?? null,
      aiModel: aiService?.model ?? null,
      checkedAt: new Date().toISOString(),
    },
  });
});
