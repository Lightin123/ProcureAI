/**
 * Turns a confirmed work package into the single representation everything
 * downstream matches against.
 *
 * The pipeline in ../../docs/ai/vendor-discovery.md begins here: eligibility,
 * lexical retrieval, semantic retrieval and ranking all read this object and
 * never the raw rows, so the four stages cannot disagree about what the package
 * is asking for. Nothing is invented — every field is either copied from the
 * work package and its requirements or derived from their text by the
 * deterministic extractors in ./requirementSignals.js.
 */

import { tokenise } from "../vendor/capabilityDocument.js";
import type { RequirementRef, WorkPackageDetail } from "../repositories/workPackages.js";
import {
  extractCertificationRequirements,
  extractMonetaryCeilingInr,
  extractRegions,
  type CertificationRequirement,
} from "./requirementSignals.js";

/** Bumped whenever normalization changes what the matcher sees (provenance). */
export const NORMALIZATION_VERSION = 1;

export interface NormalizedRequirement {
  id: string;
  kind: string;
  category: string;
  text: string;
}

export interface NormalizedWorkPackage {
  workPackageId: string;
  projectId: string;
  packageNumber: string;
  title: string;
  category: string;
  complexity: WorkPackageDetail["complexity"];
  priority: WorkPackageDetail["priority"];

  /** Full natural-language statement of the package, for display and audit. */
  document: string;

  /**
   * What the embedding model reads: the subject matter alone. Compliance,
   * budget and timeline clauses are deliberately excluded — they are near
   * identical across packages, they are already enforced by the eligibility
   * gate, and averaging them into the vector pulls every package towards the
   * same point.
   */
  semanticDocument: string;

  /**
   * Domain vocabulary of the package, most significant first. Generic
   * procurement wording is already removed by `tokenise`; what survives is the
   * language of the subject matter.
   */
  terms: string[];

  /**
   * Per-term weight in [0,1]. Terms from the title and deliverables outrank
   * terms that appear once in a long scope paragraph, which is what stops a
   * single incidental word carrying the same weight as the thing being bought.
   */
  termWeights: Record<string, number>;

  requirements: NormalizedRequirement[];
  deliverables: string[];

  /** Mandatory constraints, extracted from requirement text only. */
  mandatoryCertifications: CertificationRequirement[];
  requiredRegions: string[];
  estimatedValueCeilingInr: number | null;

  normalizationVersion: number;
}

export interface NormalizationSource {
  workPackage: WorkPackageDetail;
  projectTitle: string;
  projectProblemDescription: string;
}

/**
 * Field weights. The title names the thing being procured, so its words are the
 * strongest signal; scope prose is the weakest because it is the longest and
 * carries the most incidental vocabulary.
 */
const FIELD_WEIGHTS = {
  title: 1,
  deliverable: 0.85,
  category: 0.8,
  description: 0.6,
  requirement: 0.6,
  scope: 0.45,
  projectContext: 0.25,
} as const;

function requirementIsInformative(requirement: RequirementRef): boolean {
  return requirement.status !== "REJECTED";
}

function accumulate(
  weights: Map<string, number>,
  text: string,
  weight: number,
): void {
  for (const token of tokenise(text)) {
    // Highest-weighted occurrence wins rather than summing, so repeating a word
    // in a long paragraph cannot outweigh naming it in the title.
    const existing = weights.get(token) ?? 0;
    if (weight > existing) weights.set(token, weight);
  }
}

export function normalizeWorkPackage(source: NormalizationSource): NormalizedWorkPackage {
  const { workPackage, projectTitle, projectProblemDescription } = source;
  const requirements = workPackage.requirements.filter(requirementIsInformative);

  const weights = new Map<string, number>();
  accumulate(weights, workPackage.title, FIELD_WEIGHTS.title);
  accumulate(weights, workPackage.estimatedCategory, FIELD_WEIGHTS.category);
  accumulate(weights, workPackage.description, FIELD_WEIGHTS.description);
  accumulate(weights, workPackage.scope, FIELD_WEIGHTS.scope);
  for (const deliverable of workPackage.deliverables) {
    accumulate(weights, deliverable, FIELD_WEIGHTS.deliverable);
  }
  for (const requirement of requirements) {
    accumulate(weights, requirement.text, FIELD_WEIGHTS.requirement);
  }
  // Project context is included at a low weight so a package inherits the
  // domain of its project without the project's vocabulary swamping it — the
  // whole point of matching per package is that packages differ.
  accumulate(weights, projectTitle, FIELD_WEIGHTS.projectContext);
  accumulate(weights, projectProblemDescription, FIELD_WEIGHTS.projectContext);

  const terms = [...weights.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([term]) => term);

  const requirementTexts = requirements.map((requirement) => requirement.text);
  const complianceTexts = requirements
    .filter((requirement) => requirement.category === "COMPLIANCE")
    .map((requirement) => requirement.text);
  const budgetTexts = requirements
    .filter((requirement) => requirement.category === "BUDGET")
    .map((requirement) => requirement.text);

  return {
    workPackageId: workPackage.id,
    projectId: workPackage.projectId,
    packageNumber: workPackage.packageNumber,
    title: workPackage.title,
    category: workPackage.estimatedCategory,
    complexity: workPackage.complexity,
    priority: workPackage.priority,
    document: buildWorkPackageDocument(source, requirements),
    semanticDocument: buildSemanticDocument(workPackage, requirements),
    terms,
    termWeights: Object.fromEntries(weights),
    requirements: requirements.map((requirement) => ({
      id: requirement.id,
      kind: requirement.kind,
      category: requirement.category,
      text: requirement.text,
    })),
    deliverables: [...workPackage.deliverables],
    mandatoryCertifications: extractCertificationRequirements(complianceTexts),
    // The package's own text only. A state named in the parent project's
    // description is context, not a constraint this package states, and the
    // eligibility gate quotes what it reads here back to the officer as the
    // requirement being enforced — so inheriting the project's geography would
    // exclude suppliers against a requirement nobody wrote.
    requiredRegions: extractRegions([
      workPackage.title,
      workPackage.description,
      workPackage.scope,
      ...workPackage.deliverables,
      ...requirementTexts,
    ]),
    estimatedValueCeilingInr: extractMonetaryCeilingInr(budgetTexts),
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

/**
 * What is being procured, for the embedding model.
 *
 * The mirror of the vendor-side semantic document: subject matter only. A
 * compliance clause ("the contractor must hold a valid licence"), a budget line
 * and a delivery schedule appear in nearly every package in nearly the same
 * words, so including them makes every package look alike to an encoder that
 * averages over what it reads. They are not discarded — the eligibility gate
 * reads them as structured constraints, which is a stronger use of them than a
 * vector could be.
 */
function buildSemanticDocument(
  workPackage: WorkPackageDetail,
  requirements: readonly RequirementRef[],
): string {
  const SUBJECT_MATTER = new Set(["FUNCTIONAL", "NON_FUNCTIONAL", "OTHER"]);

  return [
    workPackage.title,
    workPackage.estimatedCategory,
    workPackage.description,
    workPackage.scope,
    ...workPackage.deliverables,
    ...requirements
      .filter((requirement) => SUBJECT_MATTER.has(requirement.category))
      .map((requirement) => requirement.text),
  ]
    .filter((line) => line.trim() !== "")
    .join("\n");
}

/**
 * The natural-language form of the package, written the way the vendor
 * capability document is written so the two sit in comparable language when
 * they are embedded. Requirements are grouped by category rather than listed
 * flat, because a compliance clause and a functional requirement mean different
 * things to a supplier reading it.
 */
function buildWorkPackageDocument(
  source: NormalizationSource,
  requirements: readonly RequirementRef[],
): string {
  const { workPackage } = source;
  const sections: string[] = [];

  sections.push(
    [
      `WORK PACKAGE: ${workPackage.title}`,
      `Procurement category: ${workPackage.estimatedCategory}`,
      `Complexity: ${workPackage.complexity}`,
      `Priority: ${workPackage.priority}`,
    ].join("\n"),
  );

  sections.push(`WHAT IS BEING PROCURED\n${workPackage.description}`);
  sections.push(`SCOPE OF WORK\n${workPackage.scope}`);

  if (workPackage.deliverables.length > 0) {
    sections.push(
      `EXPECTED DELIVERABLES\n${workPackage.deliverables.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  const byCategory = new Map<string, string[]>();
  for (const requirement of requirements) {
    const list = byCategory.get(requirement.category) ?? [];
    list.push(`- [${requirement.kind}] ${requirement.text}`);
    byCategory.set(requirement.category, list);
  }
  for (const [category, lines] of byCategory) {
    sections.push(`${category} REQUIREMENTS\n${lines.join("\n")}`);
  }

  sections.push(
    `PROCUREMENT CONTEXT\nProject: ${source.projectTitle}\n${source.projectProblemDescription}`,
  );

  return sections.join("\n\n");
}
