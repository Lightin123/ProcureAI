/**
 * What a vendor response can contain.
 *
 * One declaration, served to the frontend rather than duplicated in it (D58),
 * and read by three things that must never disagree:
 *
 *   - the government configuration screen, which decides which sections are
 *     required, which are optional and which are not asked for at all;
 *   - the supplier's response form and its progress indicator;
 *   - the server-side submission check, which refuses an incomplete response.
 *
 * A second copy of this list in the browser would let a supplier be shown a
 * progress bar reading 100% for a response the API then refuses, which is the
 * failure this module exists to prevent.
 *
 * Adding a section is an entry here plus a column on `work_package_responses`.
 * The mode a section is in is stored per work package in the configuration's
 * `sections` jsonb and validated against this catalogue on write, so the column
 * can never hold a section id nobody declared.
 */

export const RESPONSE_TYPES = [
  "EXPRESSION_OF_INTEREST",
  "RFI",
  "PROPOSAL",
  "QUOTATION",
] as const;

export type ResponseType = (typeof RESPONSE_TYPES)[number];

export const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  EXPRESSION_OF_INTEREST: "Expression of Interest",
  RFI: "Request for Information",
  PROPOSAL: "Proposal",
  QUOTATION: "Quotation",
};

export const RESPONSE_TYPE_DESCRIPTIONS: Record<ResponseType, string> = {
  EXPRESSION_OF_INTEREST:
    "A short statement of willingness and relevant standing. No price is asked for.",
  RFI: "Information the department needs before it can specify the procurement precisely. No price is asked for.",
  PROPOSAL:
    "A complete technical and commercial response covering approach, execution, timeline, capacity and price.",
  QUOTATION: "A priced response against a specification the department has already settled.",
};

/** How a section is treated for one work package. */
export const SECTION_MODES = ["OFF", "OPTIONAL", "REQUIRED"] as const;
export type SectionMode = (typeof SECTION_MODES)[number];

export type ResponseFieldType = "TEXT" | "LONG_TEXT" | "NUMBER" | "MONEY" | "DATE" | "BOOLEAN";

export interface ResponseFieldDefinition {
  /** The key on the wire, and the property on the draft the vendor edits. */
  key: string;
  /** The column on `work_package_responses` it is stored in. */
  column: string;
  label: string;
  type: ResponseFieldType;
  hint?: string;
  maxLength?: number;
  /**
   * Whether a REQUIRED section demands this field. A required section can still
   * carry fields that are merely useful — asking for every one of them would
   * make "required" mean "exhaustive", which no supplier would ever satisfy.
   */
  essential: boolean;
  /**
   * Set where the underlying column is NOT NULL, so clearing the field writes
   * the column's own empty value rather than a null the schema refuses.
   */
  notNull?: boolean;
}

export interface ResponseSectionDefinition {
  id: string;
  label: string;
  description: string;
  fields: readonly ResponseFieldDefinition[];
  /**
   * The requirement section has no fields of its own: what it asks for is one
   * answer per confirmed requirement on the work package, which is a table, not
   * a column.
   */
  perRequirement?: boolean;
  /** Officials cannot switch this section off; it is what a response *is*. */
  alwaysOn?: boolean;
}

export const RESPONSE_SECTIONS: readonly ResponseSectionDefinition[] = [
  {
    id: "overview",
    label: "Response summary",
    description: "What your organisation is offering, stated in short.",
    alwaysOn: true,
    fields: [
      {
        key: "summary",
        column: "summary",
        label: "Summary of your response",
        type: "LONG_TEXT",
        hint: "A few sentences the reviewing official reads first.",
        maxLength: 4000,
        essential: true,
      },
    ],
  },
  {
    id: "requirements",
    label: "Requirement-by-requirement response",
    description:
      "Each confirmed requirement on this work package, answered individually with a stated position.",
    perRequirement: true,
    fields: [],
  },
  {
    id: "technical",
    label: "Technical response",
    description: "The solution offered, and the standards it is built to.",
    fields: [
      {
        key: "technicalApproach",
        column: "technical_approach",
        label: "Technical approach",
        type: "LONG_TEXT",
        hint: "The solution proposed, and why it fits this work package.",
        maxLength: 8000,
        essential: true,
      },
      {
        key: "technicalStandards",
        column: "technical_standards",
        label: "Standards and specifications applied",
        type: "LONG_TEXT",
        hint: "BIS, ISO, IS codes, statutory specifications or departmental standards you will work to.",
        maxLength: 4000,
        essential: false,
      },
    ],
  },
  {
    id: "execution",
    label: "Execution plan",
    description: "How the work would actually be carried out, and by whom.",
    fields: [
      {
        key: "executionPlan",
        column: "execution_plan",
        label: "Execution methodology",
        type: "LONG_TEXT",
        hint: "Phases, milestones, site or deployment arrangements, handover.",
        maxLength: 8000,
        essential: true,
      },
      {
        key: "teamComposition",
        column: "team_composition",
        label: "Team composition",
        type: "LONG_TEXT",
        hint: "Roles assigned to this work package and the experience behind them.",
        maxLength: 4000,
        essential: false,
      },
    ],
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "When the work would start and how long it would take.",
    fields: [
      {
        key: "timelineSummary",
        column: "timeline_summary",
        label: "Delivery schedule",
        type: "LONG_TEXT",
        hint: "Major milestones and the dates or intervals attached to them.",
        maxLength: 4000,
        essential: true,
      },
      {
        key: "estimatedDurationWeeks",
        column: "estimated_duration_weeks",
        label: "Estimated duration (weeks)",
        type: "NUMBER",
        essential: true,
      },
      {
        key: "proposedStartDate",
        column: "proposed_start_date",
        label: "Earliest start date",
        type: "DATE",
        essential: false,
      },
    ],
  },
  {
    id: "capacity",
    label: "Capacity",
    description: "The resources your organisation can commit to this package.",
    fields: [
      {
        key: "capacityStatement",
        column: "capacity_statement",
        label: "Capacity statement",
        type: "LONG_TEXT",
        hint: "Personnel, plant, manufacturing or service capacity available for this work.",
        maxLength: 4000,
        essential: true,
      },
      {
        key: "committedTeamSize",
        column: "committed_team_size",
        label: "People committed to this package",
        type: "NUMBER",
        essential: false,
      },
    ],
  },
  {
    id: "experience",
    label: "Relevant experience",
    description: "Comparable work your organisation has already delivered.",
    fields: [
      {
        key: "experienceSummary",
        column: "experience_summary",
        label: "Relevant past work",
        type: "LONG_TEXT",
        hint: "Clients, scale and outcome. Reference this against the scope of this package.",
        maxLength: 8000,
        essential: true,
      },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    description: "Statutory, regulatory and departmental conditions.",
    fields: [
      {
        key: "complianceStatement",
        column: "compliance_statement",
        label: "Compliance statement",
        type: "LONG_TEXT",
        hint: "Registrations, certifications and statutory conditions your response relies on.",
        maxLength: 4000,
        essential: true,
      },
      {
        key: "complianceConfirmed",
        column: "compliance_confirmed",
        label: "Your organisation confirms it can satisfy the stated compliance conditions",
        type: "BOOLEAN",
        essential: true,
        notNull: true,
      },
    ],
  },
  {
    id: "commercial",
    label: "Commercial response",
    description: "Price and the terms it is offered on.",
    fields: [
      {
        key: "commercialSummary",
        column: "commercial_summary",
        label: "Commercial summary",
        type: "LONG_TEXT",
        hint: "What the quoted amount covers, and what it excludes.",
        maxLength: 4000,
        essential: true,
      },
      {
        key: "quotedValueInr",
        column: "quoted_value_inr",
        label: "Quoted value (INR)",
        type: "MONEY",
        essential: true,
      },
      {
        key: "priceValidityDays",
        column: "price_validity_days",
        label: "Price validity (days)",
        type: "NUMBER",
        essential: false,
      },
      {
        key: "paymentTerms",
        column: "payment_terms",
        label: "Payment terms sought",
        type: "TEXT",
        maxLength: 1000,
        essential: false,
      },
      {
        key: "taxesIncluded",
        column: "taxes_included",
        label: "The quoted value is inclusive of applicable taxes",
        type: "BOOLEAN",
        essential: false,
      },
    ],
  },
];

export const SECTION_IDS: readonly string[] = RESPONSE_SECTIONS.map((section) => section.id);

export function findSection(sectionId: string): ResponseSectionDefinition | undefined {
  return RESPONSE_SECTIONS.find((section) => section.id === sectionId);
}

/** Every editable field, keyed by its wire name. */
export const RESPONSE_FIELDS: ReadonlyMap<string, ResponseFieldDefinition> = new Map(
  RESPONSE_SECTIONS.flatMap((section) => section.fields).map((field) => [field.key, field]),
);

export function isSectionMode(value: string): value is SectionMode {
  return (SECTION_MODES as readonly string[]).includes(value);
}

export function isResponseType(value: string): value is ResponseType {
  return (RESPONSE_TYPES as readonly string[]).includes(value);
}

/**
 * The sections each response type starts with.
 *
 * Defaults, not rules: an official may change any of them. What they encode is
 * that the four types genuinely differ — asking a supplier for a price in an
 * expression of interest, or omitting one from a quotation, would be a
 * procurement error the form should not make easy.
 */
export const DEFAULT_SECTIONS: Record<ResponseType, Readonly<Record<string, SectionMode>>> = {
  EXPRESSION_OF_INTEREST: {
    overview: "REQUIRED",
    requirements: "OPTIONAL",
    technical: "OPTIONAL",
    execution: "OFF",
    timeline: "OPTIONAL",
    capacity: "OPTIONAL",
    experience: "REQUIRED",
    compliance: "OPTIONAL",
    commercial: "OFF",
  },
  RFI: {
    overview: "REQUIRED",
    requirements: "REQUIRED",
    technical: "REQUIRED",
    execution: "OPTIONAL",
    timeline: "OPTIONAL",
    capacity: "OPTIONAL",
    experience: "REQUIRED",
    compliance: "REQUIRED",
    commercial: "OFF",
  },
  PROPOSAL: {
    overview: "REQUIRED",
    requirements: "REQUIRED",
    technical: "REQUIRED",
    execution: "REQUIRED",
    timeline: "REQUIRED",
    capacity: "REQUIRED",
    experience: "REQUIRED",
    compliance: "REQUIRED",
    commercial: "REQUIRED",
  },
  QUOTATION: {
    overview: "REQUIRED",
    requirements: "OPTIONAL",
    technical: "OPTIONAL",
    execution: "OFF",
    timeline: "REQUIRED",
    capacity: "OFF",
    experience: "OPTIONAL",
    compliance: "OPTIONAL",
    commercial: "REQUIRED",
  },
};

/**
 * Fills in any section the caller did not mention and drops any it invented.
 *
 * The stored map is always total over the catalogue, so a section added in a
 * later release has a defined mode for configurations written before it
 * existed, rather than reading as undefined at the point a response is checked.
 */
export function normalizeSections(
  responseType: ResponseType,
  requested: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, SectionMode> {
  const defaults = DEFAULT_SECTIONS[responseType];
  const resolved: Record<string, SectionMode> = {};

  for (const section of RESPONSE_SECTIONS) {
    const fallback = defaults[section.id] ?? "OPTIONAL";

    if (section.alwaysOn === true) {
      resolved[section.id] = "REQUIRED";
      continue;
    }

    const supplied = requested?.[section.id];
    resolved[section.id] =
      typeof supplied === "string" && isSectionMode(supplied) ? supplied : fallback;
  }

  return resolved;
}

export function sectionMode(
  sections: Readonly<Record<string, SectionMode>>,
  sectionId: string,
): SectionMode {
  return sections[sectionId] ?? "OFF";
}

// ---------------------------------------------------------------------------
// Custom questions
// ---------------------------------------------------------------------------

export const QUESTION_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SHORT_TEXT: "Short text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  BOOLEAN: "Yes / no",
  DATE: "Date",
  SINGLE_CHOICE: "Choose one",
  MULTI_CHOICE: "Choose any",
};

export const CHOICE_QUESTION_TYPES: readonly QuestionType[] = ["SINGLE_CHOICE", "MULTI_CHOICE"];

export function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value);
}

/**
 * Whether an answer matches the shape its question declared.
 *
 * Applied on write, so the jsonb column never holds a value the question did
 * not ask for — a choice outside the offered options, a string where a number
 * was asked for, an empty multi-choice pretending to be an answer.
 */
export function validateQuestionAnswer(
  question: { answerType: QuestionType; options: readonly string[] },
  value: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  switch (question.answerType) {
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      if (typeof value !== "string") return { ok: false, message: "A written answer is expected." };
      const trimmed = value.trim();
      if (trimmed === "") return { ok: false, message: "A written answer is expected." };
      if (trimmed.length > 8000) return { ok: false, message: "The answer is too long." };
      return { ok: true, value: trimmed };
    }

    case "NUMBER": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, message: "A number is expected." };
      }
      return { ok: true, value };
    }

    case "BOOLEAN": {
      if (typeof value !== "boolean") return { ok: false, message: "Yes or no is expected." };
      return { ok: true, value };
    }

    case "DATE": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { ok: false, message: "A calendar date in YYYY-MM-DD form is expected." };
      }
      return { ok: true, value };
    }

    case "SINGLE_CHOICE": {
      if (typeof value !== "string" || !question.options.includes(value)) {
        return { ok: false, message: "Choose one of the offered options." };
      }
      return { ok: true, value };
    }

    case "MULTI_CHOICE": {
      if (!Array.isArray(value) || value.length === 0) {
        return { ok: false, message: "Choose at least one of the offered options." };
      }
      const chosen = value.filter(
        (item): item is string => typeof item === "string" && question.options.includes(item),
      );
      if (chosen.length !== value.length) {
        return { ok: false, message: "Choose only from the offered options." };
      }
      return { ok: true, value: [...new Set(chosen)] };
    }
  }
}

/** Whether a stored answer counts as present for completeness purposes. */
export function questionAnswered(answerType: QuestionType, value: unknown): boolean {
  if (value === null || value === undefined) return false;

  switch (answerType) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "DATE":
    case "SINGLE_CHOICE":
      return typeof value === "string" && value.trim() !== "";
    case "NUMBER":
      return typeof value === "number" && Number.isFinite(value);
    case "BOOLEAN":
      return typeof value === "boolean";
    case "MULTI_CHOICE":
      return Array.isArray(value) && value.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Requirement answers
// ---------------------------------------------------------------------------

export const REQUIREMENT_COMPLIANCE = [
  "MEETS",
  "PARTIALLY_MEETS",
  "DOES_NOT_MEET",
  "NOT_APPLICABLE",
] as const;

export type RequirementCompliance = (typeof REQUIREMENT_COMPLIANCE)[number];

export const REQUIREMENT_COMPLIANCE_LABELS: Record<RequirementCompliance, string> = {
  MEETS: "Meets the requirement",
  PARTIALLY_MEETS: "Partially meets the requirement",
  DOES_NOT_MEET: "Does not meet the requirement",
  NOT_APPLICABLE: "Not applicable to our response",
};

export function isRequirementCompliance(value: string): value is RequirementCompliance {
  return (REQUIREMENT_COMPLIANCE as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Response lifecycle
// ---------------------------------------------------------------------------

export const RESPONSE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUESTED",
  "RESUBMITTED",
  "READY_FOR_EVALUATION",
  "WITHDRAWN",
] as const;

export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const RESPONSE_STATUS_LABELS: Record<ResponseStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  CLARIFICATION_REQUESTED: "Clarification requested",
  RESUBMITTED: "Resubmitted",
  READY_FOR_EVALUATION: "Ready for evaluation",
  WITHDRAWN: "Withdrawn",
};

/**
 * The states in which the supplier may still change what it has written.
 *
 * This is the whole of "once submitted, it cannot be modified": every write
 * route checks it, and every state transition is a conditional UPDATE that
 * carries the permitted source states in its WHERE clause, so the check and the
 * write are one statement.
 */
export const EDITABLE_STATUSES: readonly ResponseStatus[] = ["DRAFT", "CLARIFICATION_REQUESTED"];

/** The states a supplier may abandon from. An evaluated response is not one. */
export const WITHDRAWABLE_STATUSES: readonly ResponseStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUESTED",
  "RESUBMITTED",
];

/** The states a department may open a review from. */
export const REVIEWABLE_STATUSES: readonly ResponseStatus[] = ["SUBMITTED", "RESUBMITTED"];

export function isEditableStatus(status: ResponseStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}
