import express from "express";

import { healthRouter } from "./routes/health.js";

const DEFAULT_PORT = 4000;

function resolvePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

const app = express();
const port = resolvePort(process.env.PORT);

app.use(express.json());
app.use(healthRouter);

app.listen(port, () => {
  console.log(`ProcureAI API listening on http://localhost:${port}`);
});
