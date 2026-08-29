import cookieParser from "cookie-parser";
import express from "express";

import { loadConfig } from "./config/env.js";
import { requireAuth, requireSameOrigin } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { projectsRouter } from "./routes/projects.js";
import { requirementsRouter } from "./routes/requirements.js";
import { systemRouter } from "./routes/system.js";
import { vendorRouter } from "./routes/vendor.js";
import { vendorInvitationsRouter } from "./routes/vendorInvitations.js";
import { vendorMatchingRouter } from "./routes/vendorMatching.js";
import { vendorRegistryRouter } from "./routes/vendorRegistry.js";
import {
  directWorkPackagesRouter,
  projectWorkPackagesRouter,
} from "./routes/workPackages.js";

const config = loadConfig();
const app = express();

// request.ip reflects the proxy's client address rather than the proxy itself,
// which the login rate limiter keys on.
app.set("trust proxy", "loopback");

// Compliance documents arrive base64-encoded in the JSON body (D59), so this
// one path gets a larger ceiling. Mounted before the global parser, which
// otherwise rejects the request at 100 kB.
app.use("/api/v1/vendor/profile/documents", express.json({ limit: "8mb" }));
app.use(express.json());
app.use(cookieParser());

// Unversioned and public by design (D18).
app.use(healthRouter);

app.use("/api/v1", requireSameOrigin);
app.use("/api/v1/auth", authRouter);

// Everything mounted below this line requires an authenticated session. Adding
// the guard at the prefix rather than per route means a route introduced by a
// later milestone cannot be left public by omission (D52).
app.use("/api/v1", requireAuth);

app.use("/api/v1/projects/:projectId/requirements", requirementsRouter);
app.use("/api/v1/projects/:projectId/work-packages", projectWorkPackagesRouter);
app.use("/api/v1/work-packages/:workPackageId/vendor-matches", vendorMatchingRouter);
app.use("/api/v1/work-packages", directWorkPackagesRouter);
app.use("/api/v1/projects", projectsRouter);
app.use("/api/v1/system", systemRouter);
// Mounted before `/api/v1/vendor`, which would otherwise take the prefix and
// leave every invitation path resolving inside the profile router.
app.use("/api/v1/vendor/invitations", vendorInvitationsRouter);
app.use("/api/v1/vendor", vendorRouter);
app.use("/api/v1/vendor-registry", vendorRegistryRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`ProcureAI API listening on http://localhost:${config.port}`);
});
