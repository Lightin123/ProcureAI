/**
 * Unit tests for Milestone 8's pure logic: the response catalogue, the answer
 * validators, and the completeness computation that decides both what the
 * supplier's progress indicator shows and whether the server accepts a
 * submission.
 *
 * No database and no HTTP. These are the parts that must be right before any
 * request reaches them — a completeness rule that is wrong here is wrong in the
 * progress bar and in the submission gate simultaneously, because both read
 * this one function.
 *
 *   npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateResponseCompleteness } from "../src/responses/completeness.js";
import {
  DEFAULT_SECTIONS,
  RESPONSE_SECTIONS,
  RESPONSE_TYPES,
  isRequirementCompliance,
  normalizeSections,
  questionAnswered,
  validateQuestionAnswer,
  type SectionMode,
} from "../src/responses/schema.js";

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

describe("response section catalogue", () => {
  it("gives every response type a mode for every section", () => {
    for (const type of RESPONSE_TYPES) {
      for (const section of RESPONSE_SECTIONS) {
        assert.ok(
          DEFAULT_SECTIONS[type][section.id] !== undefined,
          `${type} has no default for section ${section.id}`,
        );
      }
    }
  });

  it("keeps field keys unique across sections", () => {
    const keys = RESPONSE_SECTIONS.flatMap((section) => section.fields.map((f) => f.key));
    assert.equal(new Set(keys).size, keys.length, "a field key is declared twice");
  });

  it("asks for no price in an expression of interest or an RFI", () => {
    assert.equal(DEFAULT_SECTIONS.EXPRESSION_OF_INTEREST.commercial, "OFF");
    assert.equal(DEFAULT_SECTIONS.RFI.commercial, "OFF");
  });

  it("requires a price in a quotation", () => {
    assert.equal(DEFAULT_SECTIONS.QUOTATION.commercial, "REQUIRED");
  });

  it("fills in sections the caller omitted and drops ones it invented", () => {
    const sections = normalizeSections("PROPOSAL", {
      technical: "OPTIONAL",
      "not-a-section": "REQUIRED",
    });

    assert.equal(sections.technical, "OPTIONAL", "an explicit mode is kept");
    assert.equal(sections.commercial, "REQUIRED", "an omitted section falls back to the default");
    assert.equal(sections["not-a-section"], undefined, "an unknown section is not stored");
  });

  it("refuses to switch off a section that is always on", () => {
    const sections = normalizeSections("QUOTATION", { overview: "OFF" });
    assert.equal(sections.overview, "REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// Answer validation
// ---------------------------------------------------------------------------

describe("custom question answers", () => {
  it("refuses a choice outside the offered options", () => {
    const result = validateQuestionAnswer(
      { answerType: "SINGLE_CHOICE", options: ["Yes", "No"] },
      "Maybe",
    );
    assert.equal(result.ok, false);
  });

  it("accepts an offered choice", () => {
    const result = validateQuestionAnswer(
      { answerType: "SINGLE_CHOICE", options: ["Yes", "No"] },
      "No",
    );
    assert.equal(result.ok, true);
  });

  it("de-duplicates a multi-choice answer", () => {
    const result = validateQuestionAnswer(
      { answerType: "MULTI_CHOICE", options: ["A", "B"] },
      ["A", "A", "B"],
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.value : null, ["A", "B"]);
  });

  it("refuses an empty multi-choice answer", () => {
    const result = validateQuestionAnswer({ answerType: "MULTI_CHOICE", options: ["A"] }, []);
    assert.equal(result.ok, false);
  });

  it("refuses a string where a number was asked for", () => {
    const result = validateQuestionAnswer({ answerType: "NUMBER", options: [] }, "12");
    assert.equal(result.ok, false);
  });

  it("refuses a date that is not a calendar day", () => {
    const result = validateQuestionAnswer({ answerType: "DATE", options: [] }, "next Tuesday");
    assert.equal(result.ok, false);
  });

  it("treats a blank written answer as no answer", () => {
    assert.equal(questionAnswered("LONG_TEXT", "   "), false);
    assert.equal(questionAnswered("LONG_TEXT", "something"), true);
  });

  it("treats false as an answer to a yes/no question", () => {
    assert.equal(questionAnswered("BOOLEAN", false), true);
    assert.equal(questionAnswered("BOOLEAN", null), false);
  });

  it("recognises only the declared compliance positions", () => {
    assert.equal(isRequirementCompliance("MEETS"), true);
    assert.equal(isRequirementCompliance("MOSTLY_MEETS"), false);
  });
});

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

function inputs(overrides: Partial<Parameters<typeof evaluateResponseCompleteness>[0]> = {}) {
  const sections: Record<string, SectionMode> = normalizeSections("PROPOSAL", {});

  return {
    sections,
    documentsRequired: false,
    allowDocuments: true,
    values: {} as Record<string, unknown>,
    requirements: [] as Array<{ id: string; text: string }>,
    requirementAnswers: [] as Array<{ requirementId: string; compliance: string; answer: string | null }>,
    questions: [] as Array<{
      id: string;
      section: string;
      prompt: string;
      answerType: "SHORT_TEXT";
      isRequired: boolean;
    }>,
    questionAnswers: [] as Array<{ questionId: string; value: unknown }>,
    documentCount: 0,
    ...overrides,
  };
}

describe("response completeness", () => {
  it("reports an empty proposal as incomplete and 0% done", () => {
    const result = evaluateResponseCompleteness(inputs());

    assert.equal(result.complete, false);
    assert.equal(result.percent, 0);
    assert.ok(result.requiredTotal > 0);
    assert.ok(result.missing.some((item) => item.field === "overview.summary"));
  });

  it("ignores a section the department switched off", () => {
    const off = evaluateResponseCompleteness(
      inputs({ sections: normalizeSections("PROPOSAL", { commercial: "OFF" }) }),
    );

    assert.ok(
      !off.missing.some((item) => item.field.startsWith("commercial.")),
      "a section that is OFF must not appear as missing",
    );
    assert.ok(
      !off.items.some((item) => item.sectionId === "commercial"),
      "a section that is OFF is not shown at all",
    );
  });

  it("does not demand the non-essential fields of a required section", () => {
    const result = evaluateResponseCompleteness(
      inputs({ sections: normalizeSections("PROPOSAL", {}) }),
    );

    // `paymentTerms` sits in a REQUIRED section but is not essential.
    assert.ok(!result.missing.some((item) => item.field === "commercial.paymentTerms"));
    assert.ok(result.missing.some((item) => item.field === "commercial.quotedValueInr"));
  });

  it("treats an unticked mandatory confirmation as unanswered", () => {
    const result = evaluateResponseCompleteness(
      inputs({
        sections: normalizeSections("PROPOSAL", {}),
        values: { complianceStatement: "We hold every registration.", complianceConfirmed: false },
      }),
    );

    assert.ok(result.missing.some((item) => item.field === "compliance.complianceConfirmed"));
  });

  it("counts a requirement as answered only with a stated position and prose", () => {
    const base = inputs({
      sections: normalizeSections("PROPOSAL", {}),
      requirements: [{ id: "req-1", text: "Provide a two-year warranty." }],
    });

    const noAnswer = evaluateResponseCompleteness({
      ...base,
      requirementAnswers: [{ requirementId: "req-1", compliance: "MEETS", answer: null }],
    });
    assert.ok(noAnswer.missing.some((item) => item.field === "requirements.req-1"));

    const answered = evaluateResponseCompleteness({
      ...base,
      requirementAnswers: [
        { requirementId: "req-1", compliance: "MEETS", answer: "Two-year on-site warranty." },
      ],
    });
    assert.ok(!answered.missing.some((item) => item.field === "requirements.req-1"));
  });

  it("accepts a requirement marked not applicable without prose", () => {
    const result = evaluateResponseCompleteness(
      inputs({
        sections: normalizeSections("PROPOSAL", {}),
        requirements: [{ id: "req-1", text: "Provide a two-year warranty." }],
        requirementAnswers: [
          { requirementId: "req-1", compliance: "NOT_APPLICABLE", answer: null },
        ],
      }),
    );

    assert.ok(!result.missing.some((item) => item.field === "requirements.req-1"));
  });

  it("does not require requirement answers when the section is optional", () => {
    const result = evaluateResponseCompleteness(
      inputs({
        sections: normalizeSections("PROPOSAL", { requirements: "OPTIONAL" }),
        requirements: [{ id: "req-1", text: "Provide a two-year warranty." }],
      }),
    );

    assert.ok(!result.missing.some((item) => item.field === "requirements.req-1"));
    assert.ok(
      result.items.some((item) => item.key === "req-1" && !item.required),
      "an optional requirement is still shown, just not demanded",
    );
  });

  it("demands a required question even in an optional section", () => {
    const result = evaluateResponseCompleteness(
      inputs({
        sections: normalizeSections("PROPOSAL", { technical: "OPTIONAL" }),
        questions: [
          {
            id: "q-1",
            section: "technical",
            prompt: "Which standard applies?",
            answerType: "SHORT_TEXT",
            isRequired: true,
          },
        ],
      }),
    );

    assert.ok(result.missing.some((item) => item.field === "technical.q-1"));
  });

  it("drops a question whose section the department switched off", () => {
    const result = evaluateResponseCompleteness(
      inputs({
        sections: normalizeSections("PROPOSAL", { technical: "OFF" }),
        questions: [
          {
            id: "q-1",
            section: "technical",
            prompt: "Which standard applies?",
            answerType: "SHORT_TEXT",
            isRequired: true,
          },
        ],
      }),
    );

    assert.ok(!result.items.some((item) => item.key === "q-1"));
  });

  it("demands a document only where documents are mandatory", () => {
    const optional = evaluateResponseCompleteness(inputs());
    assert.ok(!optional.missing.some((item) => item.field === "documents.documents"));

    const required = evaluateResponseCompleteness(inputs({ documentsRequired: true }));
    assert.ok(required.missing.some((item) => item.field === "documents.documents"));

    const supplied = evaluateResponseCompleteness(
      inputs({ documentsRequired: true, documentCount: 1 }),
    );
    assert.ok(!supplied.missing.some((item) => item.field === "documents.documents"));
  });

  it("omits documents entirely where the department does not accept them", () => {
    const result = evaluateResponseCompleteness(inputs({ allowDocuments: false }));
    assert.ok(!result.items.some((item) => item.sectionId === "documents"));
  });

  it("reaches 100% and complete when every required item is answered", () => {
    const result = evaluateResponseCompleteness(
      inputs({
        sections: normalizeSections("QUOTATION", {}),
        values: {
          summary: "Priced supply of the specified units.",
          timelineSummary: "Delivery in phases over twelve weeks.",
          estimatedDurationWeeks: 12,
          commercialSummary: "Inclusive of delivery and installation.",
          quotedValueInr: 4_500_000,
        },
      }),
    );

    assert.deepEqual(result.missing, []);
    assert.equal(result.complete, true);
    assert.equal(result.percent, 100);
  });

  it("names every missing item so the refusal is actionable", () => {
    const result = evaluateResponseCompleteness(
      inputs({ sections: normalizeSections("QUOTATION", {}) }),
    );

    assert.equal(result.complete, false);
    for (const item of result.missing) {
      assert.ok(item.message.length > 0, "a missing item must carry a readable label");
      assert.match(item.field, /^[a-z]+\./);
    }
  });
});
