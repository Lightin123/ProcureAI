/**
 * The thresholds a response is measured against, read out of the procurement
 * itself.
 *
 * Same discipline as `matching/requirementSignals.ts`, which this module reuses
 * rather than reimplements: every function matches an explicit written pattern
 * and returns the phrase it matched, so a finding can quote the clause that
 * produced it. Where nothing matches, nothing is asserted — an absent ceiling
 * means the criterion is scored against the other responses only, never against
 * a number somebody guessed.
 *
 * The department's own configured threshold always wins over anything extracted
 * here. Extraction is the fallback for a department that stated its constraint
 * in the requirement text and not in the evaluation configuration.
 */

import type { CertificationRequirement } from "../matching/requirementSignals.js";

export type { CertificationRequirement };

export interface DurationCeiling {
  weeks: number;
  sourceText: string;
}

const WEEKS_PER_MONTH = 4.345;

/**
 * Obligation wording. A requirement that merely mentions a period ("comparable
 * projects delivered over 12 months") is not a deadline; only an obligation on
 * this procurement is.
 */
const DURATION_OBLIGATION =
  /\b(?:within|no later than|not later than|not exceeding|must be (?:completed|delivered|commissioned)|shall be (?:completed|delivered|commissioned)|completion (?:period|within)|delivery (?:period|within)|maximum (?:period|duration)|deadline of)\b/i;

const DURATION_PATTERN =
  /\b(\d{1,3})\s*(week|weeks|month|months|day|days)\b/i;

function clausesOf(text: string): string[] {
  return text
    .split(/(?<=[.;:])\s+|\n+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause !== "");
}

/**
 * The shortest stated completion period the procurement obliges, in whole
 * weeks.
 *
 * The shortest rather than the first: where a requirement set states more than
 * one deadline, the binding one is the tightest, and reporting a looser one
 * would let a response that misses the real deadline read as compliant.
 */
export function extractDurationCeilingWeeks(
  texts: readonly string[],
): DurationCeiling | null {
  let best: DurationCeiling | null = null;

  for (const text of texts) {
    for (const clause of clausesOf(text)) {
      if (!DURATION_OBLIGATION.test(clause)) continue;

      const match = DURATION_PATTERN.exec(clause);
      if (match === null) continue;

      const amount = Number.parseInt(match[1] ?? "", 10);
      const unit = (match[2] ?? "").toLowerCase();
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const weeks =
        unit.startsWith("week")
          ? amount
          : unit.startsWith("month")
            ? Math.round(amount * WEEKS_PER_MONTH)
            : Math.max(1, Math.round(amount / 7));

      if (weeks <= 0) continue;

      if (best === null || weeks < best.weeks) {
        best = { weeks, sourceText: clause };
      }
    }
  }

  return best;
}

export interface EvaluationTargets {
  budgetCeilingInr: number | null;
  budgetCeilingSource: "CONFIGURED" | "REQUIREMENT" | null;
  durationCeilingWeeks: number | null;
  durationCeilingSource: "CONFIGURED" | "REQUIREMENT" | null;
  durationSourceText: string | null;
  minimumTeamSize: number | null;
  mandatoryCertifications: CertificationRequirement[];
}

/**
 * Resolves every threshold the deterministic scorer needs, recording where each
 * came from so the explanation can say so.
 *
 * The budget ceiling and the mandatory certifications come from
 * `normalizeWorkPackage` — the same extraction the eligibility gate ran in
 * Milestone 6 — rather than being re-derived here. Two extractions of the same
 * clause that disagreed would put an official in front of two systems reading
 * one requirement differently.
 */
export function resolveTargets(input: {
  requirementTexts: readonly string[];
  normalizedCeilingInr: number | null;
  mandatoryCertifications: readonly CertificationRequirement[];
  configuredBudgetCeilingInr: number | null;
  configuredDurationCeilingWeeks: number | null;
  configuredMinimumTeamSize: number | null;
}): EvaluationTargets {
  const extractedDuration = extractDurationCeilingWeeks(input.requirementTexts);

  const budgetCeilingInr = input.configuredBudgetCeilingInr ?? input.normalizedCeilingInr;
  const durationCeilingWeeks =
    input.configuredDurationCeilingWeeks ?? extractedDuration?.weeks ?? null;

  return {
    budgetCeilingInr,
    budgetCeilingSource:
      input.configuredBudgetCeilingInr !== null
        ? "CONFIGURED"
        : input.normalizedCeilingInr !== null
          ? "REQUIREMENT"
          : null,
    durationCeilingWeeks,
    durationCeilingSource:
      input.configuredDurationCeilingWeeks !== null
        ? "CONFIGURED"
        : extractedDuration !== null
          ? "REQUIREMENT"
          : null,
    durationSourceText:
      input.configuredDurationCeilingWeeks !== null ? null : (extractedDuration?.sourceText ?? null),
    minimumTeamSize: input.configuredMinimumTeamSize,
    mandatoryCertifications: [...input.mandatoryCertifications],
  };
}
