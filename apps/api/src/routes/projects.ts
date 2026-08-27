import { Router } from "express";
import { z } from "zod";

import { ApiError } from "../middleware/errors.js";
import { getCurrentOfficial } from "../repositories/currentOfficial.js";
import { createProject, findProjectById, listProjects } from "../repositories/projects.js";

const createProjectSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(200),
  problemDescription: z
    .string()
    .trim()
    .min(20, "Problem description must be at least 20 characters.")
    .max(10_000),
});

const uuidSchema = z.uuid("Project id must be a valid identifier.");

export const projectsRouter: Router = Router();

projectsRouter.get("/", async (_request, response, next) => {
  try {
    const official = await getCurrentOfficial();
    const projects = await listProjects(official.organizationId);
    response.json({ data: projects });
  } catch (error) {
    next(error);
  }
});

projectsRouter.get("/:id", async (request, response, next) => {
  try {
    const parsedId = uuidSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
    }

    const official = await getCurrentOfficial();
    const project = await findProjectById(parsedId.data, official.organizationId);

    if (project === undefined) {
      throw new ApiError(404, "NOT_FOUND", "Procurement project was not found.");
    }

    response.json({ data: project });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/", async (request, response, next) => {
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

    const official = await getCurrentOfficial();
    const project = await createProject({
      title: parsed.data.title,
      problemDescription: parsed.data.problemDescription,
      organizationId: official.organizationId,
      createdBy: official.id,
    });

    response.status(201).json({ data: project });
  } catch (error) {
    next(error);
  }
});
