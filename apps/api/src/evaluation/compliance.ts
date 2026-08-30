/**
 * Requirement-by-requirement comparison.
 *
 * Produces one row per confirmed requirement per response:
 *
 *   Requirement | What the supplier said | Compliance | Evidence | Note
 *
 * The load-bearing rule is that **missing information is never compliance**.
 * A supplier that ticked "meets" and wrote nothing has stated a position, not
 * evidenced one, and this module reports that as `INSUFFICIENT_INFORMATION`
 * rather than as agreement. The department may still accept it; what it may not
 * do is have the system accept it silently.
 *
 * The supplier's own stated position (`MEETS` / `PARTIALLY_MEETS` /
 * `DOES_NOT_MEET` / `NOT_APPLICABLE`, collected in Milestone 8) is preserved
 * alongside the derived status, so an official can always see the difference
 * between what was claimed and what the comparison concluded.
 *
 * Nothing here is a score and no model is involved. `scoring.ts` turns these
 * rows into a number; this module decides what is true.
 */

import type { RequirementCompliance } from "../responses/schema.js";

export const COMPLIANCE_STATUSES = [
  "COMPLIANT",
  "PARTIALLY_COMPLIANT",
  "NON_COMPLIANT",
  "INSUFFICIENT_INFORMATION",
] as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  COMPLIANT: "Compliant",
  PARTIALLY_COMPLIANT: "Partially compliant",
  NON_COMPLIANT: "Non-compliant",
  INSUFFICIENT_INFORMATION: "Insufficient information",
};

/**
 * The shortest answer that can carry evidence.
 *
 * Below this, a response is an acknowledgement rather than a statement of how
 * the requirement is met. Set low on purpose: the module's job is to catch an
 * empty or one-word answer, not to judge the quality of a real one — that
 * judgement belongs to the official reading it.
 */
const MINIMUM_SUBSTANTIVE_ANSWER = 20;

export interface RequirementInput {
  id: string;
  kind: string;
  category: string;
  text: string;
}

export interface RequirementAnswerInput {
  requirementId: string;
  compliance: string;
  answer: string | null;
  notes: string | null;
}

export interface ComplianceFinding {
  requirementId: string;
  requirementText: string;
  requirementKind: string;
  requirementCategory: string;

  /** What the supplier itself declared, or null where it answered nothing. */
  statedPosition: RequirementCompliance | null;
  /** The supplier's own words, which is the evidence for the row. */
  vendorStatement: string | null;
  vendorNotes: string | null;

  status: ComplianceStatus;
  /** Where the row was read from, named so an official can go and check it. */
  evidenceSource: string;
  /** Why the derived status differs from the stated position, where it does. */
  note: string | null;
}

export interface ComplianceSummary {
  total: number;
  compliant: number;
  partiallyCompliant: number;
  nonCompliant: number;
  insufficientInformation: number;
  /** 0–100. Partial counts half; nothing else counts at all. */
  coverage: number;
}

function isStatedPosition(value: string): value is RequirementCompliance {
  return (
    value === "MEETS" ||
    value === "PARTIALLY_MEETS" ||
    value === "DOES_NOT_MEET" ||
    value === "NOT_APPLICABLE"
  );
}

function substantive(answer: string | null): boolean {
  return answer !== null && answer.trim().length >= MINIMUM_SUBSTANTIVE_ANSWER;
}

/**
 * Derives one requirement's verdict from the supplier's answer.
 *
 * The mapping is deliberately conservative in one direction only: a supplier is
 * never credited with more than it evidenced, and is never marked
 * non-compliant on the strength of an absence. "Did not answer" and "answered
 * that it cannot meet this" are different facts and stay different.
 */
export function deriveComplianceStatus(
  answer: RequirementAnswerInput | undefined,
): { status: ComplianceStatus; note: string | null } {
  if (answer === undefined) {
    return {
      status: "INSUFFICIENT_INFORMATION",
      note: "The supplier did not answer this requirement.",
    };
  }

  const position = isStatedPosition(answer.compliance) ? answer.compliance : null;

  switch (position) {
    case "MEETS":
      return substantive(answer.answer)
        ? { status: "COMPLIANT", note: null }
        : {
            status: "INSUFFICIENT_INFORMATION",
            note:
              "The supplier stated that it meets this requirement but gave no substantiating " +
              "statement. A stated position is not evidence.",
          };

    case "PARTIALLY_MEETS":
      return substantive(answer.answer)
        ? { status: "PARTIALLY_COMPLIANT", note: null }
        : {
            status: "INSUFFICIENT_INFORMATION",
            note:
              "The supplier stated that it partially meets this requirement but did not say in " +
              "what respect.",
          };

    case "DOES_NOT_MEET":
      return { status: "NON_COMPLIANT", note: null };

    case "NOT_APPLICABLE":
      return {
        status: "INSUFFICIENT_INFORMATION",
        note:
          "The supplier considers this requirement not applicable to its response. Whether that " +
          "is accepted is a decision for the department; it is not recorded as compliance.",
      };

    default:
      return {
        status: "INSUFFICIENT_INFORMATION",
        note: "The supplier's stated position could not be read.",
      };
  }
}

export function compareRequirements(input: {
  requirements: readonly RequirementInput[];
  answers: readonly RequirementAnswerInput[];
}): { findings: ComplianceFinding[]; summary: ComplianceSummary } {
  const byRequirement = new Map(
    input.answers.map((answer) => [answer.requirementId, answer] as const),
  );

  const findings: ComplianceFinding[] = input.requirements.map((requirement) => {
    const answer = byRequirement.get(requirement.id);
    const { status, note } = deriveComplianceStatus(answer);
    const position =
      answer !== undefined && isStatedPosition(answer.compliance) ? answer.compliance : null;

    return {
      requirementId: requirement.id,
      requirementText: requirement.text,
      requirementKind: requirement.kind,
      requirementCategory: requirement.category,
      statedPosition: position,
      vendorStatement: answer?.answer ?? null,
      vendorNotes: answer?.notes ?? null,
      status,
      evidenceSource:
        answer === undefined
          ? "No answer recorded in the submitted response"
          : "Requirement-by-requirement section of the submitted response",
      note,
    };
  });

  const count = (status: ComplianceStatus): number =>
    findings.filter((finding) => finding.status === status).length;

  const compliant = count("COMPLIANT");
  const partial = count("PARTIALLY_COMPLIANT");
  const total = findings.length;

  return {
    findings,
    summary: {
      total,
      compliant,
      partiallyCompliant: partial,
      nonCompliant: count("NON_COMPLIANT"),
      insufficientInformation: count("INSUFFICIENT_INFORMATION"),
      coverage: total === 0 ? 0 : Math.round(((compliant + partial * 0.5) / total) * 100),
    },
  };
}
