/**
 * Deterministic capability matching between a published procurement
 * opportunity and a vendor's capability profile.
 *
 * This is the structured-filtering half of the discovery design in
 * ../../docs/ai/vendor-discovery.md, and it is deliberately explainable: every
 * score comes with the terms that produced it, so a vendor can see why an
 * opportunity was surfaced and an official could later audit the same
 * reasoning. Semantic matching over embeddings is the other half and arrives
 * with pgvector in the remainder of Milestone 6; the two are additive, and the
 * capability document built alongside these keywords is what it will embed.
 */

import { tokenise } from "./capabilityDocument.js";

export interface MatchableOpportunity {
  title: string;
  problemDescription: string;
  opportunitySummary: string | null;
  requirementTexts: readonly string[];
}

export interface MatchableVendor {
  keywords: readonly string[];
  industries: readonly string[];
  sectorsServed: readonly string[];
  solutionTypes: readonly string[];
  serviceCoverage: string | null;
  governmentExperience: string | null;
  governmentScaleReadiness: string | null;
  verificationState: string;
  completionPercentage: number;
  minProjectValueInr: number | null;
  maxProjectValueInr: number | null;
}

export interface MatchComponent {
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface MatchResult {
  score: number;
  band: "STRONG" | "MODERATE" | "LIMITED";
  matchedTerms: string[];
  unmatchedTerms: string[];
  components: MatchComponent[];
}

/**
 * Qualifier scales. These start at zero rather than at a floor: a supplier who
 * works in one district and has never delivered for government scores nothing
 * here, instead of collecting a baseline that lifts every opportunity into the
 * same band.
 */
const COVERAGE_SCORE: Record<string, number> = {
  SINGLE_DISTRICT: 0,
  STATE: 0.35,
  MULTI_STATE: 0.7,
  NATIONAL: 1,
  INTERNATIONAL: 1,
};

const READINESS_SCORE: Record<string, number> = {
  PILOT_ONLY: 0,
  DISTRICT_SCALE: 0.4,
  STATE_SCALE: 0.75,
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
  UNVERIFIED: 0,
  PENDING: 0.5,
  VERIFIED: 1,
  REJECTED: 0,
};

/**
 * The terms that describe what an opportunity actually needs. Requirement text
 * is included alongside the description rather than multiplied, which keeps the
 * overlap interpretable as "share of the opportunity's vocabulary this vendor
 * covers".
 */
export function opportunityTerms(opportunity: MatchableOpportunity): string[] {
  const text = [
    opportunity.title,
    opportunity.opportunitySummary ?? "",
    opportunity.problemDescription,
    ...opportunity.requirementTexts,
  ].join(" ");

  return [...new Set(tokenise(text))];
}

/**
 * Words too ordinary to indicate a domain even after the generic procurement
 * vocabulary has been removed in `tokenise`.
 */
const GENERIC_DOMAIN_TOKENS = new Set([
  "other", "general", "development", "management", "operations", "professional",
  "digital", "innovation",
]);

export function scoreMatch(
  opportunity: MatchableOpportunity,
  vendor: MatchableVendor,
): MatchResult {
  const terms = opportunityTerms(opportunity);
  const vendorKeywords = new Set(vendor.keywords.map((keyword) => keyword.toLowerCase()));

  const matchedTerms = terms.filter((term) => vendorKeywords.has(term));
  const unmatchedTerms = terms.filter((term) => !vendorKeywords.has(term));

  // A plain share of the opportunity's vocabulary. Generic procurement wording
  // is stripped on both sides by `tokenise`, so what is compared is the
  // language of the subject matter itself: what is being bought, against what
  // the supplier says it does. Full coverage of a long requirement is not a
  // realistic bar, so covering 60 per cent of it counts as a complete match.
  const denominator = Math.max(1, terms.length) * 0.6;
  const capabilityRatio = Math.min(1, matchedTerms.length / denominator);

  // Domain alignment is judged on the vendor's declared industries and the
  // sectors they say they serve. Solution types are deliberately excluded: they
  // describe the shape of what a supplier offers ("physical products",
  // "operational services") rather than the domain it works in, and matching on
  // them credited an environmental supplier for a waste tender purely because
  // both mention ordinary words.
  const domainTerms = [...new Set(
    [...vendor.industries, ...vendor.sectorsServed]
      .flatMap((value) => tokenise(value.replace(/_/g, " ")))
      .filter((token) => token.length >= 5 && !GENERIC_DOMAIN_TOKENS.has(token))
      .filter((token) => terms.includes(token)),
  )];
  const domainRatio = Math.min(1, domainTerms.length / 3);

  const coverage = COVERAGE_SCORE[vendor.serviceCoverage ?? ""] ?? 0;
  const readiness = READINESS_SCORE[vendor.governmentScaleReadiness ?? ""] ?? 0;
  const deliveryRatio = (coverage + readiness) / 2;

  const experience = GOVERNMENT_EXPERIENCE_SCORE[vendor.governmentExperience ?? ""] ?? 0;
  const verification = VERIFICATION_SCORE[vendor.verificationState] ?? 0;
  const completeness = Math.min(1, vendor.completionPercentage / 100);
  const credibilityRatio = experience * 0.4 + verification * 0.4 + completeness * 0.2;

  // Delivery reach and credibility qualify a relevant supplier; they do not
  // make an irrelevant one relevant. Scaling them by relevance is what stops a
  // verified national supplier of the wrong thing outranking a local supplier
  // of the right thing.
  const relevance = capabilityRatio * 0.7 + domainRatio * 0.3;

  const components: MatchComponent[] = [
    {
      label: "Capability overlap",
      score: capabilityRatio,
      weight: 55,
      detail:
        matchedTerms.length === 0
          ? "No capability terms from this profile appear in the opportunity."
          : `${matchedTerms.length} capability term(s) from this profile appear in the opportunity.`,
    },
    {
      label: "Domain alignment",
      score: domainRatio,
      weight: 20,
      detail:
        domainTerms.length === 0
          ? "The declared industries and sectors do not appear in the opportunity text."
          : `Declared industry or sector matched on: ${domainTerms.join(", ")}.`,
    },
    {
      label: "Delivery fit",
      score: deliveryRatio * relevance,
      weight: 15,
      detail:
        "Declared geographic coverage and government-scale readiness, counted only to the " +
        "extent the capability is relevant to this requirement.",
    },
    {
      label: "Credibility",
      score: credibilityRatio * relevance,
      weight: 10,
      detail:
        "Public-sector experience, verification status and profile completeness, counted only " +
        "to the extent the capability is relevant to this requirement.",
    },
  ];

  const score = Math.round(
    components.reduce((total, component) => total + component.score * component.weight, 0),
  );

  return {
    score,
    band: score >= 55 ? "STRONG" : score >= 25 ? "MODERATE" : "LIMITED",
    matchedTerms: matchedTerms.slice(0, 12),
    unmatchedTerms: unmatchedTerms.slice(0, 12),
    components,
  };
}

export interface ProfileSuggestion {
  title: string;
  detail: string;
  stepId: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Improvement suggestions computed from the profile and from the vocabulary of
 * the opportunities this vendor is actually being matched against. These are
 * derived facts, not model output — the AI-authored insights are a separate
 * field on the profile and are labelled as such in the portal.
 */
export function buildProfileSuggestions(input: {
  vendor: MatchableVendor;
  missingRequired: ReadonlyArray<{ stepId: string; label: string }>;
  offeringCount: number;
  experienceCount: number;
  credentialCount: number;
  documentCount: number;
  unmatchedOpportunityTerms: readonly string[];
}): ProfileSuggestion[] {
  const suggestions: ProfileSuggestion[] = [];

  for (const missing of input.missingRequired.slice(0, 4)) {
    suggestions.push({
      title: `Complete: ${missing.label}`,
      detail: "This is a mandatory field. Your profile cannot be submitted for verification until it is answered.",
      stepId: missing.stepId,
      priority: "HIGH",
    });
  }

  if (input.offeringCount === 0) {
    suggestions.push({
      title: "Add at least one product or service",
      detail:
        "Each product or service is matched independently. A profile with none is matched only on its summary text.",
      stepId: "capabilities",
      priority: "HIGH",
    });
  }

  if (input.experienceCount === 0) {
    suggestions.push({
      title: "Record previous projects",
      detail:
        "Demonstrated delivery is the single strongest signal in public procurement. Private-sector work counts.",
      stepId: "experience",
      priority: "HIGH",
    });
  }

  if (input.documentCount === 0) {
    suggestions.push({
      title: "Upload your registration and tax documents",
      detail:
        "Your profile stays unverified until supporting documents are reviewed, and unverified profiles score lower in matching.",
      stepId: "compliance",
      priority: "MEDIUM",
    });
  }

  if (input.credentialCount === 0) {
    suggestions.push({
      title: "Record certifications, standards or awards",
      detail:
        "Many procurement requirements state a mandatory standard. Without a recorded credential you are filtered out before assessment.",
      stepId: "experience",
      priority: "MEDIUM",
    });
  }

  if (input.vendor.governmentScaleReadiness === null) {
    suggestions.push({
      title: "State your government-scale readiness",
      detail: "Buyers use this to decide whether to shortlist you for a pilot or a full rollout.",
      stepId: "capacity",
      priority: "MEDIUM",
    });
  }

  const gapTerms = [...new Set(input.unmatchedOpportunityTerms)].slice(0, 8);
  if (gapTerms.length >= 3) {
    suggestions.push({
      title: "Describe capabilities the current opportunities ask for",
      detail:
        `Recent opportunities repeatedly reference: ${gapTerms.join(", ")}. ` +
        "If your organisation can address any of these, say so in your capability statement — the matching only sees what you have written.",
      stepId: "capabilities",
      priority: "LOW",
    });
  }

  return suggestions;
}
