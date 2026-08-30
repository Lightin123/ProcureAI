/**
 * What a department may evaluate a response on.
 *
 * One declaration, served to the frontend rather than duplicated in it — the
 * same rule the response section catalogue follows (D79) and for the same
 * reason: the configuration screen, the validator, the scorer and the
 * explanation all have to agree about what a criterion is, and three of them
 * run on the server.
 *
 * Each criterion type names the stored field it is scored from and the response
 * section that field lives in. That pairing is what makes the internal
 * consistency check possible at all: a department cannot score suppliers on a
 * price it never asked any of them to quote.
 *
 * Nothing in this file scores anything. It declares the vocabulary; the
 * arithmetic is in `scoring.ts`.
 */

import { RESPONSE_SECTIONS, type SectionMode } from "../responses/schema.js";

export const CRITERION_TYPES = [
  "PRICE",
  "TIMELINE",
  "CAPACITY",
  "COMPLIANCE",
  "EXPERIENCE",
  "TECHNICAL",
  "REQUIREMENT_COMPLIANCE",
  "CUSTOM",
] as const;

export type CriterionType = (typeof CRITERION_TYPES)[number];

export const CRITERION_DIRECTIONS = ["HIGHER_IS_BETTER", "LOWER_IS_BETTER"] as const;
export type CriterionDirection = (typeof CRITERION_DIRECTIONS)[number];

/** How a criterion's number is arrived at. Shown to the official verbatim. */
export type ScoringMethod =
  | "RELATIVE_BEST"
  | "TARGET_THRESHOLD"
  | "COVERAGE_RATIO"
  | "STATED_POSITION"
  | "PRESENCE";

export interface CriterionTypeDefinition {
  type: CriterionType;
  label: string;
  /** What the criterion measures, in an official's language. */
  description: string;
  /** How the score is computed, stated plainly. Rendered in the UI. */
  method: string;
  /**
   * The response section that carries the data. A criterion whose section is
   * `OFF` in the response configuration cannot be scored, because nothing was
   * collected for it.
   */
  requiresSection: string | null;
  direction: CriterionDirection;
  /** Whether the department may state a threshold (ceiling, maximum, minimum). */
  supportsTarget: boolean;
  targetLabel: string | null;
  targetHint: string | null;
  /** `CUSTOM` alone is bound to one of the department's own questions. */
  requiresQuestion: boolean;
  /** Sensible starting weight when the criterion is added. */
  defaultWeight: number;
}

export const CRITERION_TYPE_DEFINITIONS: readonly CriterionTypeDefinition[] = [
  {
    type: "PRICE",
    label: "Price",
    description:
      "The value quoted by the supplier, compared against the other quotes received and against any ceiling the department has stated.",
    method:
      "The lowest compliant quote scores 100; every other quote scores in proportion to it. A quote above a stated ceiling scores nothing and is reported as over the ceiling.",
    requiresSection: "commercial",
    direction: "LOWER_IS_BETTER",
    supportsTarget: true,
    targetLabel: "Budget ceiling (INR)",
    targetHint:
      "Leave blank to take the ceiling from the confirmed requirements, where one is stated there.",
    requiresQuestion: false,
    defaultWeight: 30,
  },
  {
    type: "TIMELINE",
    label: "Delivery timeline",
    description:
      "The duration the supplier committed to, compared against the other responses and against any maximum the department has stated.",
    method:
      "The shortest stated duration scores 100; every other duration scores in proportion to it. A duration beyond a stated maximum scores nothing and is reported as beyond it.",
    requiresSection: "timeline",
    direction: "LOWER_IS_BETTER",
    supportsTarget: true,
    targetLabel: "Maximum acceptable duration (weeks)",
    targetHint: "Leave blank to compare the responses against each other only.",
    requiresQuestion: false,
    defaultWeight: 15,
  },
  {
    type: "CAPACITY",
    label: "Capacity",
    description:
      "The people the supplier committed to this package, and the delivery capacity recorded on its capability profile.",
    method:
      "The largest committed team scores 100; every other commitment scores in proportion to it. A commitment below a stated minimum scores nothing and is reported as below it.",
    requiresSection: "capacity",
    direction: "HIGHER_IS_BETTER",
    supportsTarget: true,
    targetLabel: "Minimum committed team size",
    targetHint: "Leave blank to compare the responses against each other only.",
    requiresQuestion: false,
    defaultWeight: 10,
  },
  {
    type: "COMPLIANCE",
    label: "Certifications and compliance",
    description:
      "The certifications the confirmed requirements make mandatory, checked against the credentials recorded on the supplier's verified profile, together with the compliance confirmation the supplier gave.",
    method:
      "The proportion of mandatory certifications evidenced on the supplier's profile. Where the requirements name none, the score reflects the compliance confirmation and statement given in the response.",
    requiresSection: "compliance",
    direction: "HIGHER_IS_BETTER",
    supportsTarget: false,
    targetLabel: null,
    targetHint: null,
    requiresQuestion: false,
    defaultWeight: 15,
  },
  {
    type: "EXPERIENCE",
    label: "Relevant experience",
    description:
      "Comparable work recorded against the supplier's profile, weighed for relevance to this package, together with its declared public-sector delivery.",
    method:
      "Counts the recorded engagements whose text overlaps this package's subject matter, and adds the supplier's declared level of government delivery. Nothing is credited that the supplier has not recorded.",
    requiresSection: "experience",
    direction: "HIGHER_IS_BETTER",
    supportsTarget: false,
    targetLabel: null,
    targetHint: null,
    requiresQuestion: false,
    defaultWeight: 15,
  },
  {
    type: "TECHNICAL",
    label: "Technical response",
    description:
      "Whether the technical sections the department asked for were answered, and how the supplier positioned itself against the functional and non-functional requirements.",
    method:
      "Coverage of the technical fields asked for, combined with the supplier's stated positions on the functional and non-functional requirements. No model contributes to this number.",
    requiresSection: "technical",
    direction: "HIGHER_IS_BETTER",
    supportsTarget: false,
    targetLabel: null,
    targetHint: null,
    requiresQuestion: false,
    defaultWeight: 10,
  },
  {
    type: "REQUIREMENT_COMPLIANCE",
    label: "Requirement compliance",
    description:
      "The requirement-by-requirement comparison: how many of the confirmed requirements the response demonstrably meets.",
    method:
      "A requirement met with a substantiated answer counts in full, one partially met counts as half, and one that is not met or is unanswered counts as nothing. Missing information is never counted as compliance.",
    requiresSection: "requirements",
    direction: "HIGHER_IS_BETTER",
    supportsTarget: false,
    targetLabel: null,
    targetHint: null,
    requiresQuestion: false,
    defaultWeight: 20,
  },
  {
    type: "CUSTOM",
    label: "Departmental question",
    description:
      "One of the department's own questions on the response form, scored on the answer the supplier gave.",
    method:
      "A yes/no answer scores 100 or nothing. A number is compared against the other responses in the direction chosen. Any other answer scores on whether it was given, and its content is placed in front of the official to read rather than scored by machine.",
    requiresSection: null,
    direction: "HIGHER_IS_BETTER",
    supportsTarget: false,
    targetLabel: null,
    targetHint: null,
    requiresQuestion: true,
    defaultWeight: 10,
  },
];

export function criterionDefinition(type: CriterionType): CriterionTypeDefinition {
  const found = CRITERION_TYPE_DEFINITIONS.find((definition) => definition.type === type);
  // Every member of the union has an entry; the union is closed above.
  return found as CriterionTypeDefinition;
}

export function isCriterionType(value: string): value is CriterionType {
  return (CRITERION_TYPES as readonly string[]).includes(value);
}

export function isCriterionDirection(value: string): value is CriterionDirection {
  return (CRITERION_DIRECTIONS as readonly string[]).includes(value);
}

/**
 * The criteria a department starts from, per response type.
 *
 * Defaults, not rules. What they encode is that the four response types collect
 * different things: an expression of interest carries no price, so proposing a
 * price criterion for one would be proposing to score suppliers on a blank
 * field.
 */
export interface CriterionPreset {
  criterionType: CriterionType;
  label: string;
  weight: number;
}

export const CRITERIA_PRESETS: Record<string, readonly CriterionPreset[]> = {
  PROPOSAL: [
    { criterionType: "REQUIREMENT_COMPLIANCE", label: "Requirement compliance", weight: 25 },
    { criterionType: "PRICE", label: "Price", weight: 25 },
    { criterionType: "TECHNICAL", label: "Technical response", weight: 15 },
    { criterionType: "EXPERIENCE", label: "Relevant experience", weight: 15 },
    { criterionType: "TIMELINE", label: "Delivery timeline", weight: 10 },
    { criterionType: "COMPLIANCE", label: "Certifications and compliance", weight: 10 },
  ],
  QUOTATION: [
    { criterionType: "PRICE", label: "Price", weight: 50 },
    { criterionType: "TIMELINE", label: "Delivery timeline", weight: 20 },
    { criterionType: "COMPLIANCE", label: "Certifications and compliance", weight: 20 },
    { criterionType: "REQUIREMENT_COMPLIANCE", label: "Requirement compliance", weight: 10 },
  ],
  RFI: [
    { criterionType: "REQUIREMENT_COMPLIANCE", label: "Requirement compliance", weight: 30 },
    { criterionType: "TECHNICAL", label: "Technical response", weight: 30 },
    { criterionType: "EXPERIENCE", label: "Relevant experience", weight: 25 },
    { criterionType: "COMPLIANCE", label: "Certifications and compliance", weight: 15 },
  ],
  EXPRESSION_OF_INTEREST: [
    { criterionType: "EXPERIENCE", label: "Relevant experience", weight: 45 },
    { criterionType: "REQUIREMENT_COMPLIANCE", label: "Requirement compliance", weight: 30 },
    { criterionType: "COMPLIANCE", label: "Certifications and compliance", weight: 25 },
  ],
};

// ---------------------------------------------------------------------------
// The configured criteria
// ---------------------------------------------------------------------------

/** One criterion as an official configured it. */
export interface EvaluationCriterion {
  id: string;
  criterionKey: string;
  criterionType: CriterionType;
  direction: CriterionDirection;
  label: string;
  description: string | null;
  weight: number;
  targetValue: number | null;
  questionId: string | null;
  displayOrder: number;
}

/** A criterion as it arrives from the configuration screen. */
export interface CriterionInput {
  criterionKey: string;
  criterionType: CriterionType;
  direction: CriterionDirection;
  label: string;
  description: string | null;
  weight: number;
  targetValue: number | null;
  questionId: string | null;
}

export interface ConsistencyProblem {
  /** Points at the offending criterion, or at the set as a whole. */
  field: string;
  message: string;
}

export const TOTAL_WEIGHT = 100;

/**
 * Whether a criteria set can be scored at all.
 *
 * Every rule here refuses a configuration that would produce a number nobody
 * could defend: weights that do not add up, a criterion scored twice, a
 * criterion scored from a section no supplier was asked to fill in, or a
 * departmental question that does not exist on this work package's form.
 *
 * Called on save and again immediately before a run, because the response
 * configuration can change between the two — switching the commercial section
 * off after a price criterion was configured would otherwise leave the run
 * scoring every supplier zero on a field none of them was asked for.
 */
export function validateCriteria(input: {
  criteria: readonly CriterionInput[];
  sections: Readonly<Record<string, SectionMode>>;
  questionIds: readonly string[];
}): ConsistencyProblem[] {
  const problems: ConsistencyProblem[] = [];
  const { criteria, sections, questionIds } = input;

  if (criteria.length === 0) {
    problems.push({
      field: "criteria",
      message: "Add at least one evaluation criterion before responses can be evaluated.",
    });
    return problems;
  }

  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (total !== TOTAL_WEIGHT) {
    problems.push({
      field: "criteria",
      message: `The weights must add up to ${TOTAL_WEIGHT}. They currently add up to ${total}.`,
    });
  }

  const seenKeys = new Set<string>();
  const seenBuiltIn = new Set<CriterionType>();
  const seenQuestions = new Set<string>();

  criteria.forEach((criterion, index) => {
    const field = `criteria.${index}`;

    if (seenKeys.has(criterion.criterionKey)) {
      problems.push({
        field: `${field}.criterionKey`,
        message: `Two criteria share the identifier "${criterion.criterionKey}".`,
      });
    }
    seenKeys.add(criterion.criterionKey);

    const definition = criterionDefinition(criterion.criterionType);

    if (criterion.criterionType === "CUSTOM") {
      if (criterion.questionId === null) {
        problems.push({
          field: `${field}.questionId`,
          message: `"${criterion.label}" must be attached to one of the questions on the response form.`,
        });
      } else if (!questionIds.includes(criterion.questionId)) {
        problems.push({
          field: `${field}.questionId`,
          message: `"${criterion.label}" is attached to a question that is not on this work package's response form.`,
        });
      } else if (seenQuestions.has(criterion.questionId)) {
        problems.push({
          field: `${field}.questionId`,
          message: `The same departmental question is scored by two criteria.`,
        });
      }

      if (criterion.questionId !== null) seenQuestions.add(criterion.questionId);
    } else {
      if (criterion.questionId !== null) {
        problems.push({
          field: `${field}.questionId`,
          message: `"${criterion.label}" is scored from the response itself and cannot be attached to a question.`,
        });
      }

      if (seenBuiltIn.has(criterion.criterionType)) {
        problems.push({
          field: `${field}.criterionType`,
          message: `${definition.label} is configured twice. Combine the two into one weighted criterion.`,
        });
      }
      seenBuiltIn.add(criterion.criterionType);
    }

    // The load-bearing consistency rule: a criterion can only be scored from
    // information the department actually asked every supplier for.
    if (definition.requiresSection !== null) {
      const mode = sections[definition.requiresSection] ?? "OFF";
      if (mode === "OFF") {
        const section = RESPONSE_SECTIONS.find((s) => s.id === definition.requiresSection);
        problems.push({
          field: `${field}.criterionType`,
          message:
            `${definition.label} is scored from the "${section?.label ?? definition.requiresSection}" ` +
            "section, which this work package does not ask suppliers to complete. Switch the section " +
            "on in the response configuration, or remove this criterion.",
        });
      }
    }

    if (!definition.supportsTarget && criterion.targetValue !== null) {
      problems.push({
        field: `${field}.targetValue`,
        message: `${definition.label} does not take a threshold.`,
      });
    }

    if (criterion.targetValue !== null && criterion.targetValue <= 0) {
      problems.push({
        field: `${field}.targetValue`,
        message: "A threshold must be greater than zero.",
      });
    }
  });

  return problems;
}
