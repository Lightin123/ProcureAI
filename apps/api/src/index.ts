import express from "express";

import { loadConfig } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { healthRouter } from "./routes/health.js";
import { projectsRouter } from "./routes/projects.js";

const config = loadConfig();
const app = express();

app.use(express.json());
app.use(healthRouter);
app.use("/api/v1/projects", projectsRouter);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`ProcureAI API listening on http://localhost:${config.port}`);
});
