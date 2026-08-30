/**
 * Unit tests for Milestone 9's pure logic: the criterion catalogue and its
 * consistency rules, the requirement-by-requirement comparison, the
 * deterministic scoring, and the explainable ranking.
 *
 * No database and no HTTP. These are the parts that must be right before any
 * request reaches them — a scoring rule that is wrong here is wrong in the
 * ranking, in the comparison and in the record a procurement decision cites,
 * all at once.
 *
 *   npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareRequirements,
  deriveComplianceStatus,
  type RequirementAnswerInput,
} from "../src/evaluation/compliance.js";
import {
  CRITERIA_PRESETS,
  CRITERION_TYPES,
  CRITERION_TYPE_DEFINITIONS,
  TOTAL_WEIGHT,
  criterionDefinition,
  validateCriteria,
  type CriterionInput,
  type EvaluationCriterion,
} from "../src/evaluation/criteria.js";
import { rankEvaluations } from "../src/evaluation/ranking.js";
import {
  evaluateResponses,
  SCORING_VERSION,
  type EvaluationSubject,
  type ResponseValues,
  type ScoringContext,
} from "../src/evaluation/scoring.js";
import { extractDurationCeilingWeeks, resolveTargets } from "../src/evaluation/signals.js";
import type { SectionMode } from "../src/responses/schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALL_SECTIONS_ON: Record<string, SectionMode> = {
  overview: "REQUIRED",
  requirements: "REQUIRED",
  technical: "REQUIRED",
  execution: "REQUIRED",
  timeline: "REQUIRED",
  capacity: "REQUIRED",
  experience: "REQUIRED",
  compliance: "REQUIRED",
  commercial: "REQUIRED",
};

function criterion(overrides: Partial<EvaluationCriterion> = {}): EvaluationCriterion {
  return {
    id: overrides.id ?? "criterion-id",
    criterionKey: overrides.criterionKey ?? "price",
    criterionType: overrides.criterionType ?? "PRICE",
    direction: overrides.direction ?? "LOWER_IS_BETTER",
    label: overrides.label ?? "Price",
    description: overrides.description ?? null,
    weight: overrides.weight ?? 100,
    targetValue: overrides.targetValue ?? null,
    questionId: overrides.questionId ?? null,
    displayOrder: overrides.displayOrder ?? 0,
  };
}

function values(overrides: Partial<ResponseValues> = {}): ResponseValues {
  return {
    summary: "A complete response to the package.",
    technicalApproach: null,
    technicalStandards: null,
    executionPlan: null,
    teamComposition: null,
    timelineSummary: null,
    estimatedDurationWeeks: null,
    proposedStartDate: null,
    capacityStatement: null,
    committedTeamSize: null,
    experienceSummary: null,
    complianceStatement: null,
    complianceConfirmed: false,
    commercialSummary: null,
    quotedValueInr: null,
    priceValidityDays: null,
    paymentTerms: null,
    taxesIncluded: null,
    ...overrides,
  };
}

function subject(
  responseId: string,
  overrides: Partial<EvaluationSubject> = {},
): EvaluationSubject {
  return {
    responseId,
    vendorProfileId: `${responseId}-vendor`,
    organizationName: `Supplier ${responseId}`,
    legalName: null,
    submittedAt: "2026-08-01T10:00:00.000Z",
    submissionCount: 1,
    documentCount: 0,
    values: values(),
    requirementAnswers: [],
    questionAnswers: new Map(),
    vendor: undefined,
    outstandingItems: [],
    ...overrides,
  };
}

function context(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    criteria: [criterion()],
    requirements: [],
    questions: [],
    targets: {
      budgetCeilingInr: null,
      budgetCeilingSource: null,
      durationCeilingWeeks: null,
      durationCeilingSource: null,
      durationSourceText: null,
      minimumTeamSize: null,
      mandatoryCertifications: [],
    },
    packageTerms: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The criterion catalogue
// ---------------------------------------------------------------------------

describe("evaluation criterion catalogue", () => {
  it("declares every criterion type exactly once", () => {
    const declared = CRITERION_TYPE_DEFINITIONS.map((definition) => definition.type);
    assert.deepEqual([...declared].sort(), [...CRITERION_TYPES].sort());
    assert.equal(new Set(declared).size, declared.length);
  });

  it("gives every preset weights that add up to the required total", () => {
    for (const [responseType, preset] of Object.entries(CRITERIA_PRESETS)) {
      const total = preset.reduce((sum, entry) => sum + entry.weight, 0);
      assert.equal(total, TOTAL_WEIGHT, `${responseType} preset sums to ${total}`);
    }
  });

  it("proposes no price criterion where no price is collected", () => {
    // An expression of interest and an RFI collect no commercial section, so a
    // price preset for either would be a preset nobody can score.
    for (const responseType of ["EXPRESSION_OF_INTEREST", "RFI"]) {
      const preset = CRITERIA_PRESETS[responseType] ?? [];
      assert.ok(
        !preset.some((entry) => entry.criterionType === "PRICE"),
        `${responseType} proposes a price criterion`,
      );
    }
  });

  it("fixes the direction of price and timeline to lower-is-better", () => {
    assert.equal(criterionDefinition("PRICE").direction, "LOWER_IS_BETTER");
    assert.equal(criterionDefinition("TIMELINE").direction, "LOWER_IS_BETTER");
    assert.equal(criterionDefinition("CAPACITY").direction, "HIGHER_IS_BETTER");
  });
});

// ---------------------------------------------------------------------------
// Consistency validation
// ---------------------------------------------------------------------------

function input(overrides: Partial<CriterionInput> = {}): CriterionInput {
  return {
    criterionKey: "price",
    criterionType: "PRICE",
    direction: "LOWER_IS_BETTER",
    label: "Price",
    description: null,
    weight: 100,
    targetValue: null,
    questionId: null,
    ...overrides,
  };
}

describe("evaluation criteria consistency", () => {
  it("accepts a set whose weights add up to 100", () => {
    const problems = validateCriteria({
      criteria: [input({ weight: 60 }), input({ criterionKey: "timeline", criterionType: "TIMELINE", label: "Timeline", weight: 40 })],
      sections: ALL_SECTIONS_ON,
      questionIds: [],
    });

    assert.deepEqual(problems, []);
  });

  it("refuses a set whose weights do not add up to 100", () => {
    const problems = validateCriteria({
      criteria: [input({ weight: 60 })],
      sections: ALL_SECTIONS_ON,
      questionIds: [],
    });

    assert.equal(problems.length, 1);
    assert.match(problems[0]?.message ?? "", /add up to 100/);
  });

  it("refuses an empty set", () => {
    const problems = validateCriteria({ criteria: [], sections: ALL_SECTIONS_ON, questionIds: [] });
    assert.equal(problems.length, 1);
    assert.match(problems[0]?.message ?? "", /at least one/);
  });

  it("refuses a criterion scored from a section the department did not ask for", () => {
    const problems = validateCriteria({
      criteria: [input({ weight: 100 })],
      sections: { ...ALL_SECTIONS_ON, commercial: "OFF" },
      questionIds: [],
    });

    assert.ok(problems.some((problem) => /does not ask suppliers to complete/.test(problem.message)));
  });

  it("refuses the same built-in criterion configured twice", () => {
    const problems = validateCriteria({
      criteria: [
        input({ criterionKey: "price-a", weight: 50 }),
        input({ criterionKey: "price-b", weight: 50 }),
      ],
      sections: ALL_SECTIONS_ON,
      questionIds: [],
    });

    assert.ok(problems.some((problem) => /configured twice/.test(problem.message)));
  });

  it("refuses a duplicate criterion key", () => {
    const problems = validateCriteria({
      criteria: [
        input({ criterionKey: "same", weight: 50 }),
        input({
          criterionKey: "same",
          criterionType: "TIMELINE",
          label: "Timeline",
          weight: 50,
        }),
      ],
      sections: ALL_SECTIONS_ON,
      questionIds: [],
    });

    assert.ok(problems.some((problem) => /share the identifier/.test(problem.message)));
  });

  it("refuses a custom criterion with no question attached", () => {
    const problems = validateCriteria({
      criteria: [
        input({ criterionKey: "own", criterionType: "CUSTOM", label: "Our question", weight: 100 }),
      ],
      sections: ALL_SECTIONS_ON,
      questionIds: ["11111111-1111-4111-8111-111111111111"],
    });

    assert.ok(problems.some((problem) => /must be attached to one of the questions/.test(problem.message)));
  });

  it("refuses a custom criterion attached to a question on another form", () => {
    const problems = validateCriteria({
      criteria: [
        input({
          criterionKey: "own",
          criterionType: "CUSTOM",
          label: "Our question",
          weight: 100,
          questionId: "22222222-2222-4222-8222-222222222222",
        }),
      ],
      sections: ALL_SECTIONS_ON,
      questionIds: ["11111111-1111-4111-8111-111111111111"],
    });

    assert.ok(problems.some((problem) => /not on this work package's response form/.test(problem.message)));
  });

  it("refuses a threshold on a criterion that does not take one", () => {
    const problems = validateCriteria({
      criteria: [
        input({
          criterionKey: "compliance",
          criterionType: "COMPLIANCE",
          label: "Compliance",
          weight: 100,
          targetValue: 5,
        }),
      ],
      sections: ALL_SECTIONS_ON,
      questionIds: [],
    });

    assert.ok(problems.some((problem) => /does not take a threshold/.test(problem.message)));
  });
});

// ---------------------------------------------------------------------------
// Requirement-by-requirement comparison
// ---------------------------------------------------------------------------

function answer(overrides: Partial<RequirementAnswerInput> = {}): RequirementAnswerInput {
  return {
    requirementId: "r1",
    compliance: "MEETS",
    answer: "We already operate three identical installations in the district.",
    notes: null,
    ...overrides,
  };
}

describe("requirement compliance derivation", () => {
  it("treats a substantiated 'meets' as compliant", () => {
    assert.equal(deriveComplianceStatus(answer()).status, "COMPLIANT");
  });

  it("never treats a missing answer as compliance", () => {
    const derived = deriveComplianceStatus(undefined);
    assert.equal(derived.status, "INSUFFICIENT_INFORMATION");
    assert.match(derived.note ?? "", /did not answer/);
  });

  it("never treats an unsubstantiated 'meets' as compliance", () => {
    const derived = deriveComplianceStatus(answer({ answer: "Yes." }));
    assert.equal(derived.status, "INSUFFICIENT_INFORMATION");
    assert.match(derived.note ?? "", /not evidence/);
  });

  it("treats an empty answer as insufficient rather than non-compliant", () => {
    // "Did not answer" and "answered that it cannot meet this" are different
    // facts and must stay different.
    assert.equal(deriveComplianceStatus(answer({ answer: null })).status, "INSUFFICIENT_INFORMATION");
    assert.equal(
      deriveComplianceStatus(answer({ compliance: "DOES_NOT_MEET", answer: null })).status,
      "NON_COMPLIANT",
    );
  });

  it("treats a substantiated partial answer as partially compliant", () => {
    assert.equal(
      deriveComplianceStatus(answer({ compliance: "PARTIALLY_MEETS" })).status,
      "PARTIALLY_COMPLIANT",
    );
  });

  it("does not record 'not applicable' as compliance", () => {
    const derived = deriveComplianceStatus(answer({ compliance: "NOT_APPLICABLE" }));
    assert.equal(derived.status, "INSUFFICIENT_INFORMATION");
    assert.match(derived.note ?? "", /decision for the department/);
  });

  it("counts partial compliance as half and insufficient information as nothing", () => {
    const { summary } = compareRequirements({
      requirements: [
        { id: "r1", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "One" },
        { id: "r2", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Two" },
        { id: "r3", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Three" },
        { id: "r4", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Four" },
      ],
      answers: [
        answer({ requirementId: "r1" }),
        answer({ requirementId: "r2", compliance: "PARTIALLY_MEETS" }),
        answer({ requirementId: "r3", compliance: "DOES_NOT_MEET" }),
        // r4 is unanswered.
      ],
    });

    assert.equal(summary.total, 4);
    assert.equal(summary.compliant, 1);
    assert.equal(summary.partiallyCompliant, 1);
    assert.equal(summary.nonCompliant, 1);
    assert.equal(summary.insufficientInformation, 1);
    assert.equal(summary.coverage, 38); // (1 + 0.5) / 4
  });

  it("preserves the supplier's own stated position alongside the derived status", () => {
    const { findings } = compareRequirements({
      requirements: [{ id: "r1", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "One" }],
      answers: [answer({ answer: "Yes." })],
    });

    assert.equal(findings[0]?.statedPosition, "MEETS");
    assert.equal(findings[0]?.status, "INSUFFICIENT_INFORMATION");
    assert.equal(findings[0]?.vendorStatement, "Yes.");
  });

  it("produces one finding per requirement, in requirement order", () => {
    const { findings } = compareRequirements({
      requirements: [
        { id: "r1", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "One" },
        { id: "r2", kind: "CONSTRAINT", category: "COMPLIANCE", text: "Two" },
      ],
      answers: [],
    });

    assert.equal(findings.length, 2);
    assert.deepEqual(
      findings.map((finding) => finding.requirementId),
      ["r1", "r2"],
    );
  });
});

// ---------------------------------------------------------------------------
// Threshold extraction
// ---------------------------------------------------------------------------

describe("duration ceiling extraction", () => {
  it("reads an obligation stated in weeks", () => {
    const ceiling = extractDurationCeilingWeeks([
      "The work must be completed within 12 weeks of the award.",
    ]);
    assert.equal(ceiling?.weeks, 12);
  });

  it("converts months to whole weeks", () => {
    const ceiling = extractDurationCeilingWeeks(["Delivery period not exceeding 6 months."]);
    assert.equal(ceiling?.weeks, 26);
  });

  it("returns the tightest of several stated deadlines", () => {
    const ceiling = extractDurationCeilingWeeks([
      "Commissioning must be completed within 20 weeks.",
      "Handover shall be completed within 14 weeks of commissioning.",
    ]);
    assert.equal(ceiling?.weeks, 14);
  });

  it("asserts nothing where a period is mentioned without an obligation", () => {
    // A supplier's past project taking 12 months is not this procurement's
    // deadline, and treating it as one would score every response against a
    // constraint nobody imposed.
    assert.equal(
      extractDurationCeilingWeeks(["Bidders should have delivered comparable work over 12 months."]),
      null,
    );
  });

  it("prefers the department's configured threshold over the extracted one", () => {
    const targets = resolveTargets({
      requirementTexts: ["The work must be completed within 30 weeks."],
      normalizedCeilingInr: 5_000_000,
      mandatoryCertifications: [],
      configuredBudgetCeilingInr: 4_000_000,
      configuredDurationCeilingWeeks: 10,
      configuredMinimumTeamSize: 6,
    });

    assert.equal(targets.durationCeilingWeeks, 10);
    assert.equal(targets.durationCeilingSource, "CONFIGURED");
    assert.equal(targets.budgetCeilingInr, 4_000_000);
    assert.equal(targets.budgetCeilingSource, "CONFIGURED");
    assert.equal(targets.minimumTeamSize, 6);
  });

  it("falls back to the requirements where nothing was configured", () => {
    const targets = resolveTargets({
      requirementTexts: ["The work must be completed within 30 weeks."],
      normalizedCeilingInr: 5_000_000,
      mandatoryCertifications: [],
      configuredBudgetCeilingInr: null,
      configuredDurationCeilingWeeks: null,
      configuredMinimumTeamSize: null,
    });

    assert.equal(targets.durationCeilingWeeks, 30);
    assert.equal(targets.durationCeilingSource, "REQUIREMENT");
    assert.equal(targets.budgetCeilingInr, 5_000_000);
    assert.equal(targets.budgetCeilingSource, "REQUIREMENT");
  });
});

// ---------------------------------------------------------------------------
// Deterministic scoring
// ---------------------------------------------------------------------------

describe("deterministic price scoring", () => {
  const priceContext = context({ criteria: [criterion({ weight: 100 })] });

  it("scores the lowest compliant quote at 100 and the rest in proportion", () => {
    const results = evaluateResponses(
      [
        subject("a", { values: values({ quotedValueInr: 1_000_000 }) }),
        subject("b", { values: values({ quotedValueInr: 2_000_000 }) }),
      ],
      priceContext,
    );

    assert.equal(results[0]?.criterionScores[0]?.score, 100);
    assert.equal(results[1]?.criterionScores[0]?.score, 50);
  });

  it("scores a quote above a stated ceiling at nothing and says so", () => {
    const results = evaluateResponses(
      [
        subject("a", { values: values({ quotedValueInr: 1_000_000 }) }),
        subject("b", { values: values({ quotedValueInr: 9_000_000 }) }),
      ],
      context({
        criteria: [criterion({ weight: 100, targetValue: 5_000_000 })],
      }),
    );

    assert.equal(results[1]?.criterionScores[0]?.score, 0);
    assert.match(results[1]?.criterionScores[0]?.basis ?? "", /above the ceiling/);
  });

  it("excludes an over-ceiling quote from the comparison baseline", () => {
    // If an over-ceiling quote could set the baseline, a compliant quote would
    // be scored against a price the department already ruled out.
    const results = evaluateResponses(
      [
        subject("a", { values: values({ quotedValueInr: 4_000_000 }) }),
        subject("b", { values: values({ quotedValueInr: 1_000 }) }),
      ],
      context({ criteria: [criterion({ weight: 100, targetValue: 5_000_000 })] }),
    );

    // `b` is compliant and cheapest, so it is the baseline and `a` is scored
    // against it rather than against itself.
    assert.equal(results[1]?.criterionScores[0]?.score, 100);
    assert.ok((results[0]?.criterionScores[0]?.score ?? 100) < 100);
  });

  it("scores a missing price at nothing and reports it as missing", () => {
    const results = evaluateResponses(
      [subject("a", { values: values({ quotedValueInr: null }) })],
      priceContext,
    );

    assert.equal(results[0]?.criterionScores[0]?.score, 0);
    assert.equal(results[0]?.criterionScores[0]?.missing, true);
    assert.ok(results[0]?.missingInformation.length ?? 0 > 0);
  });

  it("quotes the values it scored from in the basis", () => {
    const results = evaluateResponses(
      [
        subject("a", { values: values({ quotedValueInr: 1_000_000 }) }),
        subject("b", { values: values({ quotedValueInr: 2_000_000 }) }),
      ],
      priceContext,
    );

    const basis = results[1]?.criterionScores[0]?.basis ?? "";
    assert.match(basis, /20,00,000|2,000,000|₹/);
    assert.ok((results[1]?.criterionScores[0]?.evidence.length ?? 0) >= 2);
  });
});

describe("deterministic timeline and capacity scoring", () => {
  it("scores the shortest duration at 100", () => {
    const results = evaluateResponses(
      [
        subject("a", { values: values({ estimatedDurationWeeks: 10 }) }),
        subject("b", { values: values({ estimatedDurationWeeks: 20 }) }),
      ],
      context({
        criteria: [
          criterion({
            criterionKey: "timeline",
            criterionType: "TIMELINE",
            label: "Timeline",
            weight: 100,
          }),
        ],
      }),
    );

    assert.equal(results[0]?.criterionScores[0]?.score, 100);
    assert.equal(results[1]?.criterionScores[0]?.score, 50);
  });

  it("scores a duration beyond a stated maximum at nothing", () => {
    const results = evaluateResponses(
      [subject("a", { values: values({ estimatedDurationWeeks: 40 }) })],
      context({
        criteria: [
          criterion({
            criterionKey: "timeline",
            criterionType: "TIMELINE",
            label: "Timeline",
            weight: 100,
            targetValue: 20,
          }),
        ],
      }),
    );

    assert.equal(results[0]?.criterionScores[0]?.score, 0);
    assert.match(results[0]?.criterionScores[0]?.basis ?? "", /beyond the maximum/);
  });

  it("scores the largest committed team at 100 and a shortfall at nothing", () => {
    const capacityContext = context({
      criteria: [
        criterion({
          criterionKey: "capacity",
          criterionType: "CAPACITY",
          direction: "HIGHER_IS_BETTER",
          label: "Capacity",
          weight: 100,
          targetValue: 5,
        }),
      ],
    });

    const results = evaluateResponses(
      [
        subject("a", { values: values({ committedTeamSize: 20 }) }),
        subject("b", { values: values({ committedTeamSize: 2 }) }),
      ],
      capacityContext,
    );

    assert.equal(results[0]?.criterionScores[0]?.score, 100);
    assert.equal(results[1]?.criterionScores[0]?.score, 0);
    assert.match(results[1]?.criterionScores[0]?.basis ?? "", /below the minimum/);
  });
});

describe("deterministic requirement-compliance scoring", () => {
  const requirements = [
    { id: "r1", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "One" },
    { id: "r2", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "Two" },
  ];

  const complianceContext = context({
    criteria: [
      criterion({
        criterionKey: "requirements",
        criterionType: "REQUIREMENT_COMPLIANCE",
        direction: "HIGHER_IS_BETTER",
        label: "Requirement compliance",
        weight: 100,
      }),
    ],
    requirements,
  });

  it("does not credit a requirement answered without a statement", () => {
    const results = evaluateResponses(
      [
        subject("a", {
          requirementAnswers: [
            answer({ requirementId: "r1" }),
            answer({ requirementId: "r2", answer: "Yes." }),
          ],
        }),
      ],
      complianceContext,
    );

    // One substantiated, one not: 50, not 100.
    assert.equal(results[0]?.criterionScores[0]?.score, 50);
    assert.equal(results[0]?.complianceSummary.compliant, 1);
    assert.equal(results[0]?.complianceSummary.insufficientInformation, 1);
  });

  it("scores an unanswered requirement set at nothing", () => {
    const results = evaluateResponses([subject("a")], complianceContext);
    assert.equal(results[0]?.criterionScores[0]?.score, 0);
  });
});

describe("deterministic custom-question scoring", () => {
  const questionId = "33333333-3333-4333-8333-333333333333";

  it("scores a yes at 100 and a no at nothing", () => {
    const customContext = context({
      criteria: [
        criterion({
          criterionKey: "own",
          criterionType: "CUSTOM",
          direction: "HIGHER_IS_BETTER",
          label: "Local presence",
          weight: 100,
          questionId,
        }),
      ],
      questions: [{ id: questionId, prompt: "Do you hold a local office?", answerType: "BOOLEAN" }],
    });

    const results = evaluateResponses(
      [
        subject("a", { questionAnswers: new Map([[questionId, true]]) }),
        subject("b", { questionAnswers: new Map([[questionId, false]]) }),
      ],
      customContext,
    );

    assert.equal(results[0]?.criterionScores[0]?.score, 100);
    assert.equal(results[1]?.criterionScores[0]?.score, 0);
  });

  it("scores a numeric answer relative to the best in the direction chosen", () => {
    const customContext = context({
      criteria: [
        criterion({
          criterionKey: "own",
          criterionType: "CUSTOM",
          direction: "HIGHER_IS_BETTER",
          label: "Years in operation",
          weight: 100,
          questionId,
        }),
      ],
      questions: [{ id: questionId, prompt: "Years in operation?", answerType: "NUMBER" }],
    });

    const results = evaluateResponses(
      [
        subject("a", { questionAnswers: new Map([[questionId, 20]]) }),
        subject("b", { questionAnswers: new Map([[questionId, 5]]) }),
      ],
      customContext,
    );

    assert.equal(results[0]?.criterionScores[0]?.score, 100);
    assert.equal(results[1]?.criterionScores[0]?.score, 25);
  });

  it("scores an unanswered question at nothing and reports it as missing", () => {
    const customContext = context({
      criteria: [
        criterion({
          criterionKey: "own",
          criterionType: "CUSTOM",
          direction: "HIGHER_IS_BETTER",
          label: "Local presence",
          weight: 100,
          questionId,
        }),
      ],
      questions: [{ id: questionId, prompt: "Do you hold a local office?", answerType: "BOOLEAN" }],
    });

    const results = evaluateResponses([subject("a")], customContext);
    assert.equal(results[0]?.criterionScores[0]?.score, 0);
    assert.equal(results[0]?.criterionScores[0]?.missing, true);
  });
});

// ---------------------------------------------------------------------------
// Weighting, totals and reproducibility
// ---------------------------------------------------------------------------

describe("weighted totals", () => {
  const mixed = context({
    criteria: [
      criterion({ criterionKey: "price", weight: 60 }),
      criterion({
        criterionKey: "timeline",
        criterionType: "TIMELINE",
        label: "Timeline",
        weight: 40,
      }),
    ],
  });

  it("contributes score x weight / 100 per criterion and sums them", () => {
    const results = evaluateResponses(
      [
        subject("a", { values: values({ quotedValueInr: 1_000_000, estimatedDurationWeeks: 10 }) }),
        subject("b", { values: values({ quotedValueInr: 2_000_000, estimatedDurationWeeks: 20 }) }),
      ],
      mixed,
    );

    assert.equal(results[0]?.totalScore, 100);
    // 50 x 0.6 + 50 x 0.4 = 50.
    assert.equal(results[1]?.totalScore, 50);
    assert.equal(results[1]?.criterionScores[0]?.weightedContribution, 30);
    assert.equal(results[1]?.criterionScores[1]?.weightedContribution, 20);
  });

  it("never exceeds 100 or falls below 0", () => {
    const results = evaluateResponses(
      [subject("a", { values: values({ quotedValueInr: 1, estimatedDurationWeeks: 1 }) })],
      mixed,
    );

    assert.ok((results[0]?.totalScore ?? -1) >= 0);
    assert.ok((results[0]?.totalScore ?? 101) <= 100);
  });

  it("produces identical output for identical input", () => {
    const subjects = [
      subject("a", { values: values({ quotedValueInr: 1_234_567, estimatedDurationWeeks: 11 }) }),
      subject("b", { values: values({ quotedValueInr: 2_345_678, estimatedDurationWeeks: 17 }) }),
      subject("c", { values: values({ quotedValueInr: 999_999, estimatedDurationWeeks: 23 }) }),
    ];

    const first = evaluateResponses(subjects, mixed);
    const second = evaluateResponses(subjects, mixed);

    assert.deepEqual(first, second);
  });

  it("keeps the scoring version pinned so a stored run can be interpreted", () => {
    assert.equal(typeof SCORING_VERSION, "number");
    assert.ok(SCORING_VERSION >= 1);
  });
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

describe("explainable ranking", () => {
  const mixed = context({
    criteria: [
      criterion({ criterionKey: "price", weight: 70 }),
      criterion({
        criterionKey: "timeline",
        criterionType: "TIMELINE",
        label: "Timeline",
        weight: 30,
      }),
    ],
  });

  function rank(subjects: EvaluationSubject[]) {
    const evaluated = evaluateResponses(subjects, mixed);
    return rankEvaluations(
      evaluated.map((evaluation) => ({
        ...evaluation,
        submittedAt:
          subjects.find((s) => s.responseId === evaluation.responseId)?.submittedAt ?? null,
      })),
    );
  }

  it("orders by total score, highest first", () => {
    const ranked = rank([
      subject("low", { values: values({ quotedValueInr: 4_000_000, estimatedDurationWeeks: 40 }) }),
      subject("high", { values: values({ quotedValueInr: 1_000_000, estimatedDurationWeeks: 10 }) }),
    ]);

    assert.equal(ranked[0]?.responseId, "high");
    assert.equal(ranked[0]?.rankPosition, 1);
    assert.equal(ranked[1]?.rankPosition, 2);
  });

  it("names the strongest factor by weighted contribution, not by raw score", () => {
    // Price is scored 50 at weight 70 (35 points); timeline 100 at weight 30
    // (30 points). The stronger factor is the one that moved the total more.
    const ranked = rank([
      subject("a", { values: values({ quotedValueInr: 2_000_000, estimatedDurationWeeks: 10 }) }),
      subject("b", { values: values({ quotedValueInr: 1_000_000, estimatedDurationWeeks: 20 }) }),
    ]);

    const a = ranked.find((entry) => entry.responseId === "a");
    assert.equal(a?.strongestFactors[0]?.criterionKey, "price");
    assert.equal(a?.strongestFactors[0]?.weightedContribution, 35);
  });

  it("names the weakest factor by the contribution forgone", () => {
    const ranked = rank([
      subject("a", { values: values({ quotedValueInr: 4_000_000, estimatedDurationWeeks: 10 }) }),
      subject("b", { values: values({ quotedValueInr: 1_000_000, estimatedDurationWeeks: 10 }) }),
    ]);

    const a = ranked.find((entry) => entry.responseId === "a");
    assert.equal(a?.weakestFactors[0]?.criterionKey, "price");
    assert.ok((a?.weakestFactors[0]?.forgoneContribution ?? 0) > 0);
  });

  it("carries an explanation quoting the position, the total and both factors", () => {
    const ranked = rank([
      subject("a", { values: values({ quotedValueInr: 2_000_000, estimatedDurationWeeks: 10 }) }),
      subject("b", { values: values({ quotedValueInr: 1_000_000, estimatedDurationWeeks: 20 }) }),
    ]);

    assert.match(ranked[0]?.explanation ?? "", /ranks 1 of 2/);
    assert.match(ranked[0]?.explanation ?? "", /Strongest factor/);
  });

  it("breaks a tie deterministically rather than by arrival order", () => {
    const subjects = [
      subject("zzz", {
        values: values({ quotedValueInr: 1_000_000, estimatedDurationWeeks: 10 }),
        submittedAt: "2026-08-02T10:00:00.000Z",
      }),
      subject("aaa", {
        values: values({ quotedValueInr: 1_000_000, estimatedDurationWeeks: 10 }),
        submittedAt: "2026-08-01T10:00:00.000Z",
      }),
    ];

    const forwards = rank(subjects).map((entry) => entry.responseId);
    const backwards = rank([...subjects].reverse()).map((entry) => entry.responseId);

    assert.deepEqual(forwards, backwards);
    // The earlier submission wins an otherwise exact tie.
    assert.equal(forwards[0], "aaa");
  });
});

// ---------------------------------------------------------------------------
// Missing information
// ---------------------------------------------------------------------------

describe("missing information", () => {
  it("carries forward what the Milestone 8 completeness check reported", () => {
    const results = evaluateResponses(
      [
        subject("a", {
          values: values({ quotedValueInr: 1_000_000 }),
          outstandingItems: [{ field: "technical.technicalApproach", message: "Technical approach" }],
        }),
      ],
      context({ criteria: [criterion({ weight: 100 })] }),
    );

    assert.ok(
      results[0]?.missingInformation.some((item) => /Technical approach/.test(item.message)),
    );
  });

  it("reports a requirement with insufficient information as missing", () => {
    const results = evaluateResponses(
      [subject("a", { values: values({ quotedValueInr: 1_000_000 }) })],
      context({
        criteria: [criterion({ weight: 100 })],
        requirements: [{ id: "r1", kind: "REQUIREMENT", category: "FUNCTIONAL", text: "A thing" }],
      }),
    );

    assert.ok(
      results[0]?.missingInformation.some((item) => item.source === "Requirement compliance"),
    );
  });

  it("does not repeat the same gap twice", () => {
    const results = evaluateResponses(
      [subject("a")],
      context({ criteria: [criterion({ weight: 100 })] }),
    );

    const messages = results[0]?.missingInformation.map((item) => item.message) ?? [];
    assert.equal(new Set(messages).size, messages.length);
  });
});
