import { z } from "zod";

import { loadConfig } from "../config/env.js";
import { ApiError } from "../middleware/errors.js";

const requirementKindSchema = z.enum(["REQUIREMENT", "CONSTRAINT"]);
const requirementCategorySchema = z.enum([
  "FUNCTIONAL",
  "NON_FUNCTIONAL",
  "BUDGET",
  "TIMELINE",
  "COMPLIANCE",
  "OTHER",
]);

const analysisResponseSchema = z.object({
  requirements: z.array(
    z.object({
      kind: requirementKindSchema,
      category: requirementCategorySchema,
      text: z.string().trim().min(1).max(2000),
      rationale: z.string().trim().min(1).max(2000),
    }),
  ),
  clarification_questions: z.array(
    z.object({
      question: z.string().trim().min(1).max(1000),
      rationale: z.string().trim().min(1).max(2000),
    }),
  ),
  model: z.string().min(1),
  prompt_version: z.string().min(1),
});

export type RequirementAnalysisResult = z.infer<typeof analysisResponseSchema>;

export interface RequirementAnalysisInput {
  projectTitle: string;
  problemDescription: string;
  existingRequirements: Array<{ kind: string; category: string; text: string; status: string }>;
  answeredClarifications: Array<{ question: string; answer: string }>;
}

const workPackageComplexitySchema = z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]);
const workPackagePrioritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

const suggestedWorkPackageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  scope: z.string().trim().min(1).max(5000),
  included_requirement_ids: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  complexity: workPackageComplexitySchema.default("MEDIUM"),
  priority: workPackagePrioritySchema.default("MEDIUM"),
  estimated_procurement_category: z.string().default("General Procurement"),
  ai_reasoning: z.string().trim().min(1).max(3000),
  confidence_score: z.number().min(0).max(1).default(0.85),
});

const workPackageDecompositionResponseSchema = z.object({
  work_packages: z.array(suggestedWorkPackageSchema),
  model: z.string(),
  provider: z.string(),
  prompt_version: z.string(),
  prompt_hash: z.string(),
  raw_prompt: z.string(),
  raw_response: z.string(),
  token_usage: z.record(z.string(), z.any()).default({}),
  completion_id: z.string().nullable().optional(),
  response_time_ms: z.number().default(0),
  overall_confidence: z.number().default(0.85),
});

export type SuggestedWorkPackageAi = z.infer<typeof suggestedWorkPackageSchema>;
export type WorkPackageDecompositionResult = z.infer<typeof workPackageDecompositionResponseSchema>;

export interface WorkPackageDecompositionInput {
  projectTitle: string;
  problemDescription: string;
  organizationName?: string;
  confirmedRequirements: Array<{
    id: string;
    kind: "REQUIREMENT" | "CONSTRAINT";
    category: "FUNCTIONAL" | "NON_FUNCTIONAL" | "BUDGET" | "TIMELINE" | "COMPLIANCE" | "OTHER";
    text: string;
    rationale?: string | null;
  }>;
}

const aiHealthSchema = z.object({
  status: z.string(),
  service: z.string(),
  provider: z.string(),
  model: z.string().nullable(),
});

export async function checkAiService(): Promise<{ provider: string; model: string | null } | null> {
  const config = loadConfig();
  try {
    const response = await fetch(`${config.aiServiceUrl}/health`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const parsed = aiHealthSchema.safeParse(await response.json());
    return parsed.success ? { provider: parsed.data.provider, model: parsed.data.model } : null;
  } catch {
    return null;
  }
}

export async function requestRequirementAnalysis(
  input: RequirementAnalysisInput,
): Promise<RequirementAnalysisResult> {
  const config = loadConfig();

  let response: Response;
  try {
    response = await fetch(`${config.aiServiceUrl}/internal/v1/requirement-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        project_title: input.projectTitle,
        problem_description: input.problemDescription,
        existing_requirements: input.existingRequirements,
        answered_clarifications: input.answeredClarifications,
      }),
      signal: AbortSignal.timeout(config.aiServiceTimeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new ApiError(
      503,
      "AI_SERVICE_UNAVAILABLE",
      timedOut
        ? "The AI service did not respond within the allowed time."
        : "The AI service could not be reached.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      502,
      "AI_SERVICE_ERROR",
      `The AI service returned an error (HTTP ${response.status}).`,
    );
  }

  const parsed = analysisResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      502,
      "AI_OUTPUT_INVALID",
      "The AI service returned output that failed validation.",
    );
  }

  return parsed.data;
}

export async function requestWorkPackageDecomposition(
  input: WorkPackageDecompositionInput,
): Promise<WorkPackageDecompositionResult> {
  const config = loadConfig();

  let response: Response;
  try {
    response = await fetch(`${config.aiServiceUrl}/internal/v1/work-package-decomposition`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        project_title: input.projectTitle,
        problem_description: input.problemDescription,
        organization_name: input.organizationName,
        confirmed_requirements: input.confirmedRequirements,
      }),
      signal: AbortSignal.timeout(config.aiServiceTimeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new ApiError(
      503,
      "AI_SERVICE_UNAVAILABLE",
      timedOut
        ? "The AI service did not respond within the allowed time."
        : "The AI service could not be reached.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      502,
      "AI_SERVICE_ERROR",
      `The AI service returned an error (HTTP ${response.status}).`,
    );
  }

  const parsed = workPackageDecompositionResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      502,
      "AI_OUTPUT_INVALID",
      "The AI service returned work package output that failed schema validation.",
    );
  }

  return parsed.data;
}
