import { Router } from "express";

import { checkDatabaseConnection } from "../db/pool.js";

const SERVICE_NAME = "procureai-api";

export const healthRouter: Router = Router();

healthRouter.get("/health", async (_request, response) => {
  const databaseConnected = await checkDatabaseConnection();

  response.json({
    status: "ok",
    service: SERVICE_NAME,
    milestone: "2 - Procurement Project Skeleton",
    database: databaseConnected ? "connected" : "unavailable",
    timestamp: new Date().toISOString(),
  });
});
