/**
 * Deterministic multi-factor ranking.
 *
 * No model decides a position in this list. Every number below is computed from
 * stored supplier data by arithmetic that can be read, re-run and disputed,
 * because an official who cannot say why a supplier ranked first cannot defend
 * the decision that follows from it (see ../../docs/ai/evaluation-and-ranking.md).
 *
 * Ranking runs only on suppliers that already passed the eligibility gate.
 * Nothing here can compensate for a failed mandatory requirement, and nothing
 * here excludes anyone: the two stages answer different questions and are kept
 * apart on purpose.
 */

import { tokenise } from "../vendor/capabilityDocument.js";
import { calibrationFor, type SemanticCalibration } from "./calibration.js";
import type { CandidateVendor, RetrievedCandidate } from "./candidate.js";
import type { EligibilityResult } from "./eligibility.js";
import type { NormalizedWorkPackage } from "./normalization.js";
import { formatInr } from "./requirementSignals.js";

/** Bumped when weights or dimension formulas change (provenance). */
export const RANKING_VERSION = 1;

/**
 * Dimension weights, summing to 100.
 *
 * Capability and semantic fit together carry 45: what a supplier can do is the
 * question, and the two measure it from different directions. Experience is
 * weighted heavily because demonstrated delivery is the strongest single signal
 * in public procurement. Credibility is deliberately small — verification
 * status qualifies a relevant supplier and must never be able to lift an
 * irrelevant one, which is enforced structurally below as well as by weight.
 */
export const DIMENSION_WEIGHTS = {
  capability: 25,
  semantic: 20,
  experience: 18,
  capacity: 12,
  geographic: 10,
  compliance: 9,
  credibility: 6,
} as const;

export type DimensionKey = keyof typeof DIMENSION_WEIGHTS;

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  capability: "Capability fit",
  semantic: "Semantic relevance",
  experience: "Relevant experience",
  capacity: "Capacity and delivery fit",
  geographic: "Geographic fit",
  compliance: "Compliance and credentials",
  credibility: "Verification and credibility",
};

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  /** 0-100, comparable across suppliers within a run. */
  score: number;
  weight: number;
  detail: string;
}

export interface MatchEvidence {
  matchedCapabilities: string[];
  missingCapabilities: string[];
  relevantExperience: Array<{ title: string; detail: string; year: string | null }>;
  relevantOfferings: Array<{ name: string; kind: string; detail: string }>;
  credentials: string[];
  strengths: string[];
  gaps: string[];
}

export interface RankedVendor {
  vendor: CandidateVendor;
  overallScore: number;
  band: "STRONG" | "MODERATE" | "LIMITED";
  dimensions: DimensionScore[];
  evidence: MatchEvidence;
  eligibility: EligibilityResult;
  retrieval: RetrievedCandidate;
  explanation: string;
}

const COVERAGE_SCORE: Record<string, number> = {
  SINGLE_DISTRICT: 0.2,
  STATE: 0.5,
  MULTI_STATE: 0.8,
  NATIONAL: 1,
  INTERNATIONAL: 1,
};

const READINESS_SCORE: Record<string, number> = {
  PILOT_ONLY: 0.15,
  DISTRICT_SCALE: 0.45,
  STATE_SCALE: 0.8,
  NATIONAL_SCALE: 1,
};

const GOVERNMENT_EXPERIENCE_SCORE: Record<string, number> = {
  NONE: 0,
  LOCAL_BODY: 0.5,
  STATE: 0.75,
  CENTRAL: 0.9,
  PSU: 0.75,
  MULTIPLE: 1,
};

const VERIFICATION_SCORE: Record<string, number> = {
  UNVERIFIED: 0.1,
  PENDING: 0.5,
  VERIFIED: 1,
  REJECTED: 0,
};

/** Complexity is a proxy for the delivery capacity a package demands. */
const COMPLEXITY_DEMAND: Record<string, number> = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.75,
  VERY_HIGH: 1,
};

/**
 * Capability fit — weighted overlap between the package's vocabulary and the
 * supplier's declared capabilities.
 *
 * Weighted rather than counted: a supplier matching the word in the package
 * title is answering the requirement, and a supplier matching one incidental
 * word from a scope paragraph is not. Counting them equally is precisely how a
 * keyword matcher produces confident nonsense.
 */
function scoreCapability(
  workPackage: NormalizedWorkPackage,
  vendor: CandidateVendor,
): { score: number; matched: string[]; missing: string[]; detail: string } {
  const keywords = new Set(vendor.capabilityKeywords.map((keyword) => keyword.toLowerCase()));

  let matchedWeight = 0;
  let totalWeight = 0;
  const matched: string[] = [];
  const missing: string[] = [];

  for (const term of workPackage.terms) {
    const weight = workPackage.termWeights[term] ?? 0;
    totalWeight += weight;

    if (keywords.has(term)) {
      matchedWeight += weight;
      matched.push(term);
    } else {
      missing.push(term);
    }
  }

  // Covering the entire vocabulary of a long package is not a realistic bar;
  // covering 55 per cent of its weighted vocabulary is treated as a complete
  // capability match.
  const ratio = totalWeight === 0 ? 0 : Math.min(1, matchedWeight / (totalWeight * 0.55));

  return {
    score: Math.round(ratio * 100),
    matched: matched.slice(0, 20),
    missing: missing.slice(0, 20),
    detail:
      matched.length === 0
        ? "None of this work package's capability terms appear in the supplier's profile."
        : `Matches ${matched.length} of ${workPackage.terms.length} capability terms, weighted by where each appears in the package.`,
  };
}

/**
 * Semantic relevance, rescaled from cosine similarity.
 *
 * Cosine over long domain documents is compressed into a narrow band whose
 * position depends entirely on the model: a trained sentence encoder puts
 * genuinely unrelated procurement text near 0.68 and a strong match near 0.83,
 * while the concept model puts unrelated text at 0. Rescaling the model's own
 * working range across 0-100 is what keeps this dimension able to discriminate
 * instead of reporting every supplier as roughly seventy — which is why the
 * floor and ceiling come from ./calibration.js rather than being constants.
 */
function scoreSemantic(
  retrieval: RetrievedCandidate,
  semanticEnabled: boolean,
  calibration: SemanticCalibration,
): { score: number; detail: string; available: boolean } {
  if (!semanticEnabled) {
    return {
      score: 0,
      available: false,
      detail: "Semantic retrieval was unavailable for this run; matching used keywords alone.",
    };
  }

  if (retrieval.semanticSimilarity === null) {
    // Found by keyword search but outside the retrieved neighbourhood. All that
    // is known is that the similarity is below the retrieval threshold — not
    // what it is. Scoring that as a hard zero at full weight would deduct
    // twenty points for an unmeasured quantity and could drop a supplier a
    // whole band on where the top-K cut happened to fall, so the dimension is
    // withheld for this candidate and its weight redistributed instead.
    return {
      score: 0,
      available: false,
      detail:
        "This supplier was found by keyword overlap and was not among the closest capability statements to this work package, so semantic relevance was not scored for them.",
    };
  }

  const normalised =
    (retrieval.semanticSimilarity - calibration.scoreFloor) /
    Math.max(1e-6, calibration.scoreCeiling - calibration.scoreFloor);
  const score = Math.round(Math.max(0, Math.min(1, normalised)) * 100);

  const foundOnlySemantically = !retrieval.sources.includes("LEXICAL");

  return {
    score,
    available: true,
    detail: foundOnlySemantically
      ? `Capability statement is conceptually close to this work package (similarity ${retrieval.semanticSimilarity.toFixed(2)}), although the wording differs from the package's own terms.`
      : `Capability statement is conceptually close to this work package (similarity ${retrieval.semanticSimilarity.toFixed(2)}).`,
  };
}

/**
 * Relevant experience. Past work is only counted where its own text overlaps
 * the package's vocabulary — a supplier's twenty unrelated projects say nothing
 * about this one.
 */
function scoreExperience(
  workPackage: NormalizedWorkPackage,
  vendor: CandidateVendor,
): {
  score: number;
  relevant: MatchEvidence["relevantExperience"];
  detail: string;
} {
  const packageTerms = new Set(workPackage.terms);
  const relevant: Array<{ title: string; detail: string; year: string | null; overlap: number }> = [];

  for (const entry of vendor.experience) {
    const text = [entry.title, entry.sector ?? "", entry.description ?? "", entry.outcome ?? ""].join(" ");
    const overlap = [...new Set(tokenise(text))].filter((token) => packageTerms.has(token));
    if (overlap.length === 0) continue;

    const period =
      entry.startYear === null
        ? null
        : entry.endYear === null
          ? `${entry.startYear} onwards`
          : `${entry.startYear}–${entry.endYear}`;

    relevant.push({
      title: entry.title,
      year: period,
      overlap: overlap.length,
      detail: [
        entry.clientName === null ? null : `Client: ${entry.clientName}`,
        entry.sector === null ? null : `Sector: ${entry.sector}`,
        entry.contractValueInr === null ? null : `Value: ${formatInr(entry.contractValueInr)}`,
        entry.outcome === null ? null : `Outcome: ${entry.outcome}`,
      ]
        .filter((line): line is string => line !== null)
        .join(" | "),
    });
  }

  relevant.sort((left, right) => right.overlap - left.overlap);

  // Three comparable engagements is treated as a full record. Beyond that the
  // marginal assurance from a fourth is small, and rewarding it would favour
  // volume over fit.
  const depth = Math.min(1, relevant.length / 3);
  const publicSector = GOVERNMENT_EXPERIENCE_SCORE[vendor.governmentExperience ?? ""] ?? 0;
  const score = Math.round((depth * 0.7 + publicSector * 0.3) * 100);

  return {
    score,
    relevant: relevant.slice(0, 5).map(({ title, detail, year }) => ({ title, detail, year })),
    detail:
      relevant.length === 0
        ? vendor.experience.length === 0
          ? "No previous projects are recorded on this supplier's profile."
          : `${vendor.experience.length} previous project(s) are recorded, none of them comparable to this work package.`
        : `${relevant.length} recorded project(s) overlap this work package's subject matter.`,
  };
}

/**
 * Capacity and delivery fit. Where the package states a value, capacity is
 * judged against that figure; where it does not, it is judged against the
 * demand implied by the package's complexity.
 */
function scoreCapacity(
  workPackage: NormalizedWorkPackage,
  vendor: CandidateVendor,
): { score: number; detail: string } {
  const readiness = READINESS_SCORE[vendor.governmentScaleReadiness ?? ""] ?? 0;
  const ceiling = workPackage.estimatedValueCeilingInr;

  if (ceiling !== null && vendor.maxProjectValueInr !== null) {
    // Headroom, not just sufficiency: a supplier whose stated maximum is
    // exactly the package value is at the edge of what they say they can do.
    const headroom = Math.min(1, vendor.maxProjectValueInr / (ceiling * 1.25));
    const typicalFit =
      vendor.typicalProjectValueInr === null
        ? headroom
        : Math.min(1, vendor.typicalProjectValueInr / Math.max(1, ceiling));

    const score = Math.round((headroom * 0.5 + typicalFit * 0.2 + readiness * 0.3) * 100);
    return {
      score,
      detail: `States a maximum project value of ${formatInr(vendor.maxProjectValueInr)} against this package's stated ${formatInr(ceiling)}.`,
    };
  }

  const demand = COMPLEXITY_DEMAND[workPackage.complexity] ?? 0.5;
  const teamSignal = vendor.teamSize === null ? 0.4 : Math.min(1, vendor.teamSize / 100);
  // A supplier is credited to the extent their readiness meets the package's
  // demand; exceeding it is not additional credit.
  const readinessFit = demand === 0 ? 1 : Math.min(1, readiness / demand);

  const score = Math.round((readinessFit * 0.6 + teamSignal * 0.4) * 100);
  return {
    score,
    detail:
      vendor.governmentScaleReadiness === null
        ? "The supplier has not stated their government-scale readiness. Capacity is judged on team size alone."
        : `Declared readiness is ${vendor.governmentScaleReadiness} against a ${workPackage.complexity} complexity package.`,
  };
}

function scoreGeographic(
  workPackage: NormalizedWorkPackage,
  vendor: CandidateVendor,
): { score: number; detail: string } {
  const coverage = COVERAGE_SCORE[vendor.serviceCoverage ?? ""] ?? 0;

  if (workPackage.requiredRegions.length === 0) {
    return {
      score: Math.round(coverage * 100),
      detail:
        vendor.serviceCoverage === null
          ? "The package names no delivery state, and the supplier has not declared their coverage."
          : `The package names no delivery state. The supplier's declared coverage is ${vendor.serviceCoverage}.`,
    };
  }

  const operating = new Set(vendor.operatingStates.map((state) => state.trim().toLowerCase()));
  const covered = workPackage.requiredRegions.filter((region) => operating.has(region.toLowerCase()));

  if (covered.length > 0) {
    // Naming the state outright is stronger evidence than a broad coverage
    // claim, so it is scored above what coverage alone can reach.
    const ratio = covered.length / workPackage.requiredRegions.length;
    return {
      score: Math.round((0.7 + 0.3 * ratio) * 100),
      detail: `Operates in ${covered.join(", ")}, which this package requires.`,
    };
  }

  return {
    score: Math.round(coverage * 60),
    detail: `Does not list ${workPackage.requiredRegions.join(", ")} among their operating states; scored on declared coverage of ${vendor.serviceCoverage ?? "unknown"} alone.`,
  };
}

/**
 * Compliance and credentials. Mandatory certifications are already enforced by
 * the eligibility gate, so what this measures is the depth of the supplier's
 * verified credential record beyond the minimum.
 */
function scoreCompliance(
  vendor: CandidateVendor,
  eligibility: EligibilityResult,
): { score: number; credentials: string[]; detail: string } {
  const mandatoryPassed = eligibility.passedChecks.filter(
    (check) => check.code === "MANDATORY_CERTIFICATION",
  ).length;

  const verified = vendor.credentials.filter(
    (credential) => credential.verificationState === "VERIFIED",
  ).length;

  const breadth = Math.min(1, vendor.credentials.length / 3);
  const assurance = vendor.credentials.length === 0 ? 0 : verified / vendor.credentials.length;
  const mandatory = mandatoryPassed > 0 ? 1 : 0;

  const score = Math.round((breadth * 0.4 + assurance * 0.3 + mandatory * 0.3) * 100);

  return {
    score,
    credentials: vendor.credentials.map((credential) =>
      credential.issuingAuthority === null
        ? credential.name
        : `${credential.name} (${credential.issuingAuthority})`,
    ),
    detail:
      vendor.credentials.length === 0
        ? "No certifications, licences or standards are recorded on this supplier's profile."
        : `${vendor.credentials.length} credential(s) recorded, ${verified} of them verified by the portal administration.`,
  };
}

function scoreCredibility(vendor: CandidateVendor): { score: number; detail: string } {
  const verification = VERIFICATION_SCORE[vendor.verificationState] ?? 0;
  const completeness = Math.min(1, vendor.completionPercentage / 100);
  const score = Math.round((verification * 0.65 + completeness * 0.35) * 100);

  return {
    score,
    detail: `Verification state is ${vendor.verificationState}; the capability profile is ${vendor.completionPercentage}% complete.`,
  };
}

export interface RankingContext {
  semanticEnabled: boolean;
  /** Per-model similarity scale. Defaults to the uncalibrated conservative one. */
  calibration?: SemanticCalibration;
}

/**
 * Bands, shared between a fresh run and a stored one so the same score never
 * reads as "strong" on one screen and "moderate" on another.
 */
export function bandFor(score: number): RankedVendor["band"] {
  return score >= 65 ? "STRONG" : score >= 40 ? "MODERATE" : "LIMITED";
}

export function scoreVendor(
  workPackage: NormalizedWorkPackage,
  vendor: CandidateVendor,
  retrieval: RetrievedCandidate,
  eligibility: EligibilityResult,
  context: RankingContext,
): RankedVendor {
  const capability = scoreCapability(workPackage, vendor);
  const semantic = scoreSemantic(
    retrieval,
    context.semanticEnabled,
    context.calibration ?? calibrationFor(null),
  );
  const experience = scoreExperience(workPackage, vendor);
  const capacity = scoreCapacity(workPackage, vendor);
  const geographic = scoreGeographic(workPackage, vendor);
  const compliance = scoreCompliance(vendor, eligibility);
  const credibility = scoreCredibility(vendor);

  const dimensions: DimensionScore[] = (
    [
      { key: "capability", score: capability.score, detail: capability.detail },
      { key: "semantic", score: semantic.score, detail: semantic.detail },
      { key: "experience", score: experience.score, detail: experience.detail },
      { key: "capacity", score: capacity.score, detail: capacity.detail },
      { key: "geographic", score: geographic.score, detail: geographic.detail },
      { key: "compliance", score: compliance.score, detail: compliance.detail },
      { key: "credibility", score: credibility.score, detail: credibility.detail },
    ] as const
  ).map((entry) => ({
    ...entry,
    label: DIMENSION_LABELS[entry.key],
    weight: DIMENSION_WEIGHTS[entry.key],
  }));

  // Relevance is what the supplier can actually do for this package. Delivery,
  // compliance and credibility qualify a relevant supplier; they cannot make an
  // irrelevant one relevant. Scaling them is what stops a verified national
  // supplier of the wrong thing outranking a local supplier of the right thing
  // — the failure mode that makes an otherwise plausible matcher useless.
  const relevance = Math.max(capability.score, semantic.score) / 100;
  const QUALIFIER_DIMENSIONS = new Set<DimensionKey>([
    "capacity",
    "geographic",
    "compliance",
    "credibility",
  ]);

  // When semantic retrieval is unavailable its weight is redistributed rather
  // than lost, so scores stay on the same 0-100 scale and a lexical-only run
  // is not silently deflated by twenty points.
  const activeWeights = new Map<DimensionKey, number>();
  for (const dimension of dimensions) {
    if (dimension.key === "semantic" && !semantic.available) continue;
    activeWeights.set(dimension.key, dimension.weight);
  }
  const totalActiveWeight = [...activeWeights.values()].reduce((sum, weight) => sum + weight, 0);

  let weighted = 0;
  for (const dimension of dimensions) {
    const weight = activeWeights.get(dimension.key);
    if (weight === undefined) continue;

    const effective = QUALIFIER_DIMENSIONS.has(dimension.key)
      ? dimension.score * relevance
      : dimension.score;
    weighted += effective * weight;
  }

  const overallScore = Math.round(weighted / Math.max(1, totalActiveWeight));

  const evidence: MatchEvidence = {
    matchedCapabilities: capability.matched,
    missingCapabilities: capability.missing,
    relevantExperience: experience.relevant,
    relevantOfferings: relevantOfferings(workPackage, vendor),
    credentials: compliance.credentials,
    strengths: [],
    gaps: [],
  };

  const { strengths, gaps } = buildFindings({
    workPackage,
    vendor,
    dimensions,
    evidence,
    eligibility,
    retrieval,
  });
  evidence.strengths = strengths;
  evidence.gaps = gaps;

  return {
    vendor,
    overallScore,
    band: bandFor(overallScore),
    dimensions,
    evidence,
    eligibility,
    retrieval,
    explanation: buildExplanation(vendor, overallScore, strengths, gaps),
  };
}

function relevantOfferings(
  workPackage: NormalizedWorkPackage,
  vendor: CandidateVendor,
): MatchEvidence["relevantOfferings"] {
  const packageTerms = new Set(workPackage.terms);
  const scored: Array<{ name: string; kind: string; detail: string; overlap: number }> = [];

  for (const offering of vendor.offerings) {
    const text = [
      offering.name,
      offering.description ?? "",
      ...offering.categories,
      ...offering.tags,
      ...offering.sectors,
    ].join(" ");

    const overlap = [...new Set(tokenise(text))].filter((token) => packageTerms.has(token));
    if (overlap.length === 0) continue;

    scored.push({
      name: offering.name,
      kind: offering.kind,
      overlap: overlap.length,
      detail: offering.description ?? offering.categories.join(", "),
    });
  }

  scored.sort((left, right) => right.overlap - left.overlap);
  return scored.slice(0, 5).map(({ name, kind, detail }) => ({ name, kind, detail }));
}

/**
 * The bullet points shown under a recommendation.
 *
 * Every line is generated from a value that was read out of the database and is
 * quoted back with it. Nothing here is written by a model, and nothing asserts a
 * capability, credential or engagement the supplier did not record — the point
 * of an explanation is that an official can check it.
 */
function buildFindings(input: {
  workPackage: NormalizedWorkPackage;
  vendor: CandidateVendor;
  dimensions: DimensionScore[];
  evidence: MatchEvidence;
  eligibility: EligibilityResult;
  retrieval: RetrievedCandidate;
}): { strengths: string[]; gaps: string[] } {
  const { vendor, evidence, eligibility, retrieval } = input;
  const strengths: string[] = [];
  const gaps: string[] = [];

  const relevantCount = evidence.relevantExperience.length;
  if (relevantCount > 0) {
    const first = evidence.relevantExperience[0];
    strengths.push(
      `Recorded ${relevantCount} comparable engagement(s), including "${first?.title ?? ""}"` +
        (first?.year === null || first?.year === undefined ? "." : ` (${first.year}).`),
    );
  }

  for (const offering of evidence.relevantOfferings.slice(0, 2)) {
    strengths.push(`Offers ${offering.name.toLowerCase()}, which this work package requires.`);
  }

  if (evidence.matchedCapabilities.length > 0) {
    strengths.push(
      `Capability statement covers: ${evidence.matchedCapabilities.slice(0, 6).join(", ")}.`,
    );
  }

  if (
    retrieval.semanticSimilarity !== null &&
    retrieval.semanticSimilarity >= 0.5 &&
    !retrieval.sources.includes("LEXICAL")
  ) {
    strengths.push(
      "Found by semantic matching: their capability statement describes this kind of work in different terms from the package.",
    );
  }

  for (const check of eligibility.passedChecks) {
    if (check.code === "MANDATORY_CERTIFICATION") {
      strengths.push(`${check.label} — ${check.evidence}`);
    }
  }

  if (vendor.verificationState === "VERIFIED") {
    strengths.push("Capability profile has been verified by the portal administration.");
  }

  if (vendor.governmentExperience !== null && vendor.governmentExperience !== "NONE") {
    strengths.push(`Declares prior public-sector delivery (${vendor.governmentExperience}).`);
  }

  for (const warning of eligibility.warnings) {
    gaps.push(`${warning.label}: ${warning.detail}`);
  }

  if (relevantCount === 0) {
    gaps.push(
      vendor.experience.length === 0
        ? "No previous projects are recorded, so delivery of comparable work cannot be evidenced."
        : "None of the recorded previous projects are comparable to this work package.",
    );
  }

  if (evidence.missingCapabilities.length > 0) {
    gaps.push(
      `Profile does not mention: ${evidence.missingCapabilities.slice(0, 6).join(", ")}.`,
    );
  }

  if (vendor.credentials.length === 0) {
    gaps.push("No certifications or standards are recorded against this supplier.");
  }

  return { strengths: strengths.slice(0, 8), gaps: gaps.slice(0, 6) };
}

export function buildExplanation(
  vendor: { legalName: string | null; organizationName: string },
  score: number,
  strengths: readonly string[],
  gaps: readonly string[],
): string {
  const name = vendor.legalName ?? vendor.organizationName;
  const verdict =
    score >= 65
      ? "is a strong fit for this work package"
      : score >= 40
        ? "is a partial fit for this work package"
        : "is a weak fit for this work package";

  const lead = `${name} ${verdict} (${score}/100).`;
  const because = strengths.length === 0 ? "" : ` ${strengths[0]}`;
  const caveat = gaps.length === 0 ? "" : ` Note: ${gaps[0]}`;

  return `${lead}${because}${caveat}`;
}
