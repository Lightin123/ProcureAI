import { Router } from "express";
import { z } from "zod";

import { getCurrentUser } from "../auth/currentUser.js";
import { requirePermission } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { createProject, findProjectById, listProjects } from "../repositories/projects.js";
import {
  listInterestForProject,
  publishOpportunity,
  withdrawOpportunity,
} from "../repositories/vendorOpportunities.js";

const createProjectSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(200),
  problemDescription: z
    .string()
    .trim()
    .min(20, "Problem description must be at least 20 characters.")
    .max(10_000),
});

const uuidSchema = z.uuid("Project id must be a valid identifier.");

const publishSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(40, "Write at least 40 characters describing what is being sought.")
    .max(4000),
  responseDeadline: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Provide the date as YYYY-MM-DD.")
    .nullable()
    .default(null),
});

export const projectsRouter: Router = Router();

projectsRouter.get("/", requirePermission("project:read"), async (request, response, next) => {
  try {
    const user = getCurrentUser(request);
    const projects = await listProjects(user.organizationId);
    response.json({ data: projects });
  } catch (error) {
    next(error);
  }
});

projectsRouter.get("/:id", requirePermission("project:read"), async (request, response, next) => {
  try {
    const parsedId = uuidSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
    }

    const user = getCurrentUser(request);
    const project = await findProjectById(parsedId.data, user.organizationId);

    if (project === undefined) {
      throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
    }

    response.json({ data: project });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/", requirePermission("project:create"), async (request, response, next) => {
  try {
    const parsed = createProjectSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "The submitted details are not valid.",
        parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    const user = getCurrentUser(request);
    const project = await createProject({
      title: parsed.data.title,
      problemDescription: parsed.data.problemDescription,
      organizationId: user.organizationId,
      createdBy: user.id,
    });

    response.status(201).json({ data: project });
  } catch (error) {
    next(error);
  }
});

/**
 * Publishing is what makes a project visible to suppliers. It is deliberately a
 * separate, explicit act rather than a side effect of confirming requirements:
 * an official decides what leaves the department, and only the summary they
 * write plus the requirements they have ACCEPTED are exposed (D57).
 */
projectsRouter.post(
  "/:id/publish",
  requirePermission("opportunity:publish"),
  async (request, response, next) => {
    try {
      const parsedId = uuidSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
      }

      const parsed = publishSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "The submitted details are not valid.",
          parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        );
      }

      const user = getCurrentUser(request);
      const project = await findProjectById(parsedId.data, user.organizationId);
      if (project === undefined) {
        throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
      }

      const published = await publishOpportunity({
        projectId: parsedId.data,
        organizationId: user.organizationId,
        publishedBy: user.id,
        summary: parsed.data.summary,
        responseDeadline: parsed.data.responseDeadline,
      });

      if (!published) {
        throw new ApiError(
          409,
          "NOT_PUBLISHABLE",
          "Requirements must be confirmed before the project can be published to suppliers.",
        );
      }

      response.json({ data: await findProjectById(parsedId.data, user.organizationId) });
    } catch (error) {
      next(error);
    }
  },
);

projectsRouter.post(
  "/:id/unpublish",
  requirePermission("opportunity:publish"),
  async (request, response, next) => {
    try {
      const parsedId = uuidSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
      }

      const user = getCurrentUser(request);
      if (!(await withdrawOpportunity(parsedId.data, user.organizationId))) {
        throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
      }

      response.json({ data: await findProjectById(parsedId.data, user.organizationId) });
    } catch (error) {
      next(error);
    }
  },
);

/** Suppliers who have declared interest. Scoped to the official's own department. */
projectsRouter.get(
  "/:id/interest",
  requirePermission("project:read"),
  async (request, response, next) => {
    try {
      const parsedId = uuidSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
      }

      const user = getCurrentUser(request);
      const project = await findProjectById(parsedId.data, user.organizationId);
      if (project === undefined) {
        throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
      }

      response.json({
        data: await listInterestForProject(parsedId.data, user.organizationId),
      });
    } catch (error) {
      next(error);
    }
  },
);
