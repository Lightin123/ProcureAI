import { Router } from "express";

import { checkDatabaseConnection } from "../db/pool.js";
import { checkAiService } from "../services/aiClient.js";

const SERVICE_NAME = "procureai-api";

export const healthRouter: Router = Router();

healthRouter.get("/health", async (_request, response) => {
  const [databaseConnected, aiService] = await Promise.all([
    checkDatabaseConnection(),
    checkAiService(),
  ]);

  response.json({
    status: "ok",
    service: SERVICE_NAME,
    milestone: "3 - AI Requirement Analysis",
    database: databaseConnected ? "connected" : "unavailable",
    aiService: aiService === null ? "unavailable" : "connected",
    aiProvider: aiService?.provider ?? null,
    aiModel: aiService?.model ?? null,
    timestamp: new Date().toISOString(),
  });
});
