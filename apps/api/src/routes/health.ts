import { Router } from "express";

const SERVICE_NAME = "procureai-api";

export const healthRouter: Router = Router();

healthRouter.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: SERVICE_NAME,
    milestone: "1 - Project Foundation",
    timestamp: new Date().toISOString(),
  });
});
