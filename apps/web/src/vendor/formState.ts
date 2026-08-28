import type { OnboardingField, OnboardingGroup, OnboardingStep, ShowIf } from "../api/vendor.js";

/**
 * Client-side evaluation of the onboarding schema.
 *
 * This mirrors `apps/api/src/vendor/completion.ts`, because a form has to know
 * which question to draw before it can ask it. The server remains authoritative:
 * it re-evaluates the same rules on every write and recomputes the completion
 * percentage itself, so a client that got this wrong would be corrected rather
 * than believed.
 */

export type FormValues = Record<string, unknown>;

export function getByPath(values: FormValues, path: string): unknown {
  let current: unknown = values;

  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/** Returns a new object; the caller's state is never mutated in place. */
export function setByPath(values: FormValues, path: string, value: unknown): FormValues {
  const segments = path.split(".");
  const [head, ...rest] = segments;
  if (head === undefined) return values;

  if (rest.length === 0) {
    return { ...values, [head]: value };
  }

  const existing = values[head];
  const branch =
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? (existing as FormValues)
      : {};

  return { ...values, [head]: setByPath(branch, rest.join("."), value) };
}

export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** Conditions compare as strings, so arrays, scalars and booleans share a path. */
export function evaluateShowIf(showIf: ShowIf | undefined, values: FormValues): boolean {
  if (showIf === undefined) return true;

  return showIf.any.some((condition) => {
    const actual = getByPath(values, condition.path);

    if (Array.isArray(actual)) {
      return actual.some((item) => condition.includesAny.includes(String(item)));
    }
    if (actual === undefined || actual === null) return false;
    return condition.includesAny.includes(String(actual));
  });
}

export function visibleGroups(step: OnboardingStep, values: FormValues): OnboardingGroup[] {
  return step.groups
    .filter((group) => evaluateShowIf(group.showIf, values))
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => evaluateShowIf(field.showIf, values)),
    }))
    .filter((group) => group.fields.length > 0);
}

export function visibleFields(step: OnboardingStep, values: FormValues): OnboardingField[] {
  return visibleGroups(step, values).flatMap((group) => group.fields);
}

/**
 * Only the fields this vendor is actually being asked are sent. A conditional
 * answer that has become irrelevant is left untouched in storage rather than
 * cleared, so re-selecting the industry that asked for it brings it back.
 */
export function collectStepValues(step: OnboardingStep, values: FormValues): FormValues {
  const payload: FormValues = {};

  for (const field of visibleFields(step, values)) {
    const [head] = field.path.split(".");
    if (head === undefined || head in payload) continue;
    if (!(head in values)) continue;
    payload[head] = values[head];
  }

  return payload;
}

const EMPTY_TO_NULL = new Set(["text", "textarea", "url", "email", "tel"]);

/** Normalises form input into the shapes the API's validator expects. */
export function normaliseFieldValue(field: OnboardingField, raw: unknown): unknown {
  if (field.type === "number" || field.type === "year" || field.type === "currency") {
    if (raw === "" || raw === null || raw === undefined) return null;
    const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (field.type === "boolean") {
    return raw === null || raw === undefined ? null : Boolean(raw);
  }

  if (EMPTY_TO_NULL.has(field.type)) {
    const text = typeof raw === "string" ? raw.trim() : "";
    return text === "" ? null : text;
  }

  return raw;
}

export function missingRequiredOnStep(step: OnboardingStep, values: FormValues): OnboardingField[] {
  return visibleFields(step, values).filter(
    (field) => field.required === true && !isAnswered(getByPath(values, field.path)),
  );
}
