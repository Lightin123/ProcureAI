/**
 * Whether a response is complete enough to submit, and how far off it is.
 *
 * One function serves both questions, deliberately. The supplier's progress
 * indicator and the server's submission check are the same computation over the
 * same inputs, so the portal cannot show a response as ready that the API then
 * refuses, and cannot show one as incomplete that the API would accept.
 *
 * Nothing here reads the request. Every input is either the department's stored
 * configuration or the supplier's stored draft, which is what makes this
 * callable from a GET (to render progress) and from the submit handler (to
 * decide) without the two diverging.
 */

import {
  RESPONSE_SECTIONS,
  questionAnswered,
  sectionMode,
  type QuestionType,
  type SectionMode,
} from "./schema.js";

export interface CompletenessInputs {
  sections: Readonly<Record<string, SectionMode>>;
  documentsRequired: boolean;
  allowDocuments: boolean;

  /** The stored draft, keyed by field name as declared in the catalogue. */
  values: Readonly<Record<string, unknown>>;

  /** Every confirmed requirement on the work package, in display order. */
  requirements: ReadonlyArray<{ id: string; text: string }>;

  requirementAnswers: ReadonlyArray<{
    requirementId: string;
    compliance: string;
    answer: string | null;
  }>;

  questions: ReadonlyArray<{
    id: string;
    section: string;
    prompt: string;
    answerType: QuestionType;
    isRequired: boolean;
  }>;

  questionAnswers: ReadonlyArray<{ questionId: string; value: unknown }>;

  documentCount: number;
}

export interface ChecklistItem {
  sectionId: string;
  /** Field key, requirement id, question id, or the literal "documents". */
  key: string;
  label: string;
  required: boolean;
  complete: boolean;
}

export interface SectionProgress {
  sectionId: string;
  label: string;
  mode: SectionMode;
  requiredTotal: number;
  requiredComplete: number;
  optionalTotal: number;
  optionalComplete: number;
  complete: boolean;
}

export interface MissingItem {
  field: string;
  message: string;
}

export interface ResponseCompleteness {
  complete: boolean;
  requiredTotal: number;
  requiredComplete: number;
  optionalTotal: number;
  optionalComplete: number;
  /** Percentage of the *required* work done, which is what "can I submit" means. */
  percent: number;
  sections: SectionProgress[];
  items: ChecklistItem[];
  missing: MissingItem[];
}

function textPresent(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function numberPresent(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Whether one catalogue field carries a value.
 *
 * An essential boolean is complete only when it is `true`. A field an official
 * made mandatory is a confirmation the supplier is being asked to give, and an
 * unticked box is the absence of that confirmation rather than a negative
 * answer to it.
 */
function fieldPresent(type: string, essential: boolean, value: unknown): boolean {
  switch (type) {
    case "TEXT":
    case "LONG_TEXT":
    case "DATE":
      return textPresent(value);
    case "NUMBER":
    case "MONEY":
      return numberPresent(value);
    case "BOOLEAN":
      return essential ? value === true : typeof value === "boolean";
    default:
      return value !== null && value !== undefined;
  }
}

export function evaluateResponseCompleteness(
  inputs: CompletenessInputs,
): ResponseCompleteness {
  const items: ChecklistItem[] = [];
  const sections: SectionProgress[] = [];
  const missing: MissingItem[] = [];

  const answerByRequirement = new Map(
    inputs.requirementAnswers.map((answer) => [answer.requirementId, answer]),
  );
  const answerByQuestion = new Map(
    inputs.questionAnswers.map((answer) => [answer.questionId, answer.value]),
  );

  for (const section of RESPONSE_SECTIONS) {
    const mode = section.alwaysOn === true ? "REQUIRED" : sectionMode(inputs.sections, section.id);
    if (mode === "OFF") continue;

    const sectionItems: ChecklistItem[] = [];

    if (section.perRequirement === true) {
      for (const requirement of inputs.requirements) {
        const answer = answerByRequirement.get(requirement.id);
        // A requirement marked not applicable needs no prose; every other
        // position does, because "meets" without a statement of how is an
        // assertion the department cannot read anything into.
        const complete =
          answer !== undefined &&
          (answer.compliance === "NOT_APPLICABLE" || textPresent(answer.answer));

        sectionItems.push({
          sectionId: section.id,
          key: requirement.id,
          label: requirement.text,
          required: mode === "REQUIRED",
          complete,
        });
      }
    }

    for (const field of section.fields) {
      const complete = fieldPresent(field.type, field.essential, inputs.values[field.key]);
      sectionItems.push({
        sectionId: section.id,
        key: field.key,
        label: field.label,
        required: mode === "REQUIRED" && field.essential,
        complete,
      });
    }

    for (const question of inputs.questions) {
      if (question.section !== section.id) continue;

      sectionItems.push({
        sectionId: section.id,
        key: question.id,
        label: question.prompt,
        required: question.isRequired,
        complete: questionAnswered(question.answerType, answerByQuestion.get(question.id)),
      });
    }

    const requiredItems = sectionItems.filter((item) => item.required);
    const optionalItems = sectionItems.filter((item) => !item.required);

    sections.push({
      sectionId: section.id,
      label: section.label,
      mode,
      requiredTotal: requiredItems.length,
      requiredComplete: requiredItems.filter((item) => item.complete).length,
      optionalTotal: optionalItems.length,
      optionalComplete: optionalItems.filter((item) => item.complete).length,
      complete: requiredItems.every((item) => item.complete),
    });

    items.push(...sectionItems);
  }

  // Supporting documents sit outside the section catalogue: they are not a
  // field of any one section, and whether they are mandatory is its own switch
  // on the configuration.
  if (inputs.allowDocuments) {
    items.push({
      sectionId: "documents",
      key: "documents",
      label: "Supporting documents",
      required: inputs.documentsRequired,
      complete: inputs.documentCount > 0,
    });

    sections.push({
      sectionId: "documents",
      label: "Supporting documents",
      mode: inputs.documentsRequired ? "REQUIRED" : "OPTIONAL",
      requiredTotal: inputs.documentsRequired ? 1 : 0,
      requiredComplete: inputs.documentsRequired && inputs.documentCount > 0 ? 1 : 0,
      optionalTotal: inputs.documentsRequired ? 0 : 1,
      optionalComplete: !inputs.documentsRequired && inputs.documentCount > 0 ? 1 : 0,
      complete: !inputs.documentsRequired || inputs.documentCount > 0,
    });
  }

  for (const item of items) {
    if (item.required && !item.complete) {
      missing.push({
        field: `${item.sectionId}.${item.key}`,
        message: item.label,
      });
    }
  }

  const requiredItems = items.filter((item) => item.required);
  const optionalItems = items.filter((item) => !item.required);
  const requiredComplete = requiredItems.filter((item) => item.complete).length;
  const optionalComplete = optionalItems.filter((item) => item.complete).length;

  return {
    complete: missing.length === 0,
    requiredTotal: requiredItems.length,
    requiredComplete,
    optionalTotal: optionalItems.length,
    optionalComplete,
    percent:
      requiredItems.length === 0
        ? 100
        : Math.round((requiredComplete / requiredItems.length) * 100),
    sections,
    items,
    missing,
  };
}
