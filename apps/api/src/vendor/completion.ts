/**
 * Completion tracking, derived from the onboarding schema rather than from a
 * hand-maintained checklist. A field that is not visible for this vendor is not
 * counted against them — a professional-services firm is not marked incomplete
 * for leaving production capacity blank (D58).
 */

import {
  COLLECTION_DEFINITIONS,
  ONBOARDING_STEPS,
  type CollectionId,
  type OnboardingField,
  type OnboardingStep,
  type ShowIf,
} from "./onboardingSchema.js";

export type ProfileValues = Record<string, unknown>;

export interface CollectionCounts {
  offerings: number;
  experience: number;
  credentials: number;
  documents: number;
}

export const EMPTY_COLLECTION_COUNTS: CollectionCounts = {
  offerings: 0,
  experience: 0,
  credentials: 0,
  documents: 0,
};

export function getByPath(values: ProfileValues, path: string): unknown {
  let current: unknown = values;

  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function setByPath(values: ProfileValues, path: string, value: unknown): void {
  const segments = path.split(".");
  const last = segments.pop();
  if (last === undefined) return;

  let current: Record<string, unknown> = values;
  for (const segment of segments) {
    const next = current[segment];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[last] = value;
}

/** Blank means blank: empty strings, empty arrays and nulls are all unanswered. */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Conditions compare as strings so one evaluator covers array-valued fields
 * (industries), scalars (solutionNovelty) and booleans (hasIntellectualProperty).
 */
export function matchesCondition(values: ProfileValues, path: string, expected: readonly string[]): boolean {
  const actual = getByPath(values, path);

  if (Array.isArray(actual)) {
    return actual.some((item) => expected.includes(String(item)));
  }

  if (actual === undefined || actual === null) {
    return false;
  }

  return expected.includes(String(actual));
}

export function evaluateShowIf(showIf: ShowIf | undefined, values: ProfileValues): boolean {
  if (showIf === undefined) return true;
  return showIf.any.some((condition) => matchesCondition(values, condition.path, condition.includesAny));
}

export interface VisibleField extends OnboardingField {
  stepId: string;
  groupId: string;
}

/** Every field this vendor is actually being asked, in schema order. */
export function visibleFields(values: ProfileValues, step?: OnboardingStep): VisibleField[] {
  const steps = step === undefined ? ONBOARDING_STEPS : [step];
  const result: VisibleField[] = [];

  for (const current of steps) {
    for (const group of current.groups) {
      if (!evaluateShowIf(group.showIf, values)) continue;

      for (const field of group.fields) {
        if (!evaluateShowIf(field.showIf, values)) continue;
        result.push({ ...field, stepId: current.id, groupId: group.id });
      }
    }
  }

  return result;
}

export interface SectionProgress {
  id: string;
  title: string;
  shortTitle: string;
  requiredTotal: number;
  requiredAnswered: number;
  optionalTotal: number;
  optionalAnswered: number;
  percentage: number;
  complete: boolean;
}

export interface MissingField {
  stepId: string;
  path: string;
  label: string;
}

export interface CompletionResult {
  percentage: number;
  sections: SectionProgress[];
  missingRequired: MissingField[];
  /** The first step with unanswered required fields, or undefined when none. */
  nextStepId: string | undefined;
  readyToSubmit: boolean;
}

/**
 * A collection counts as one required entry on the step that owns it, except
 * for documents, which are encouraged but never block submission — a vendor
 * without a scanner should still be able to complete a profile.
 */
const REQUIRED_COLLECTIONS: readonly CollectionId[] = ["offerings", "experience"];

function collectionLabel(id: CollectionId): string {
  return `At least one entry under “${COLLECTION_DEFINITIONS[id].title}”`;
}

export function evaluateCompletion(
  values: ProfileValues,
  counts: CollectionCounts,
): CompletionResult {
  const sections: SectionProgress[] = [];
  const missingRequired: MissingField[] = [];

  let weightedScore = 0;
  let totalWeight = 0;

  for (const step of ONBOARDING_STEPS) {
    const fields = visibleFields(values, step);

    let requiredTotal = 0;
    let requiredAnswered = 0;
    let optionalTotal = 0;
    let optionalAnswered = 0;

    for (const field of fields) {
      const answered = isAnswered(getByPath(values, field.path));

      if (field.required === true) {
        requiredTotal += 1;
        if (answered) {
          requiredAnswered += 1;
        } else {
          missingRequired.push({ stepId: step.id, path: field.path, label: field.label });
        }
      } else {
        optionalTotal += 1;
        if (answered) optionalAnswered += 1;
      }
    }

    for (const collection of step.collections ?? []) {
      const present = counts[collection] > 0;

      if (REQUIRED_COLLECTIONS.includes(collection)) {
        requiredTotal += 1;
        if (present) {
          requiredAnswered += 1;
        } else {
          missingRequired.push({
            stepId: step.id,
            path: `collection:${collection}`,
            label: collectionLabel(collection),
          });
        }
      } else {
        optionalTotal += 1;
        if (present) optionalAnswered += 1;
      }
    }

    // Required answers carry three quarters of a step's score: a profile that
    // answers everything mandatory is substantially complete, and optional
    // depth then takes it the rest of the way.
    const requiredRatio = requiredTotal === 0 ? 1 : requiredAnswered / requiredTotal;
    const optionalRatio = optionalTotal === 0 ? 1 : optionalAnswered / optionalTotal;
    const ratio = requiredTotal === 0 ? optionalRatio : requiredRatio * 0.75 + optionalRatio * 0.25;

    weightedScore += ratio * step.weight;
    totalWeight += step.weight;

    sections.push({
      id: step.id,
      title: step.title,
      shortTitle: step.shortTitle,
      requiredTotal,
      requiredAnswered,
      optionalTotal,
      optionalAnswered,
      percentage: Math.round(ratio * 100),
      complete: requiredAnswered === requiredTotal,
    });
  }

  const percentage = totalWeight === 0 ? 0 : Math.round((weightedScore / totalWeight) * 100);
  const nextStepId = sections.find((section) => !section.complete)?.id;

  return {
    percentage,
    sections,
    missingRequired,
    nextStepId,
    readyToSubmit: missingRequired.length === 0,
  };
}

export function completedSectionIds(result: CompletionResult): string[] {
  return result.sections.filter((section) => section.complete).map((section) => section.id);
}
