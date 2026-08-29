/**
 * The single shape the portal receives for a vendor recommendation.
 *
 * A freshly computed run and a stored one are serialised through here so the
 * two can never drift: an official revisiting a work package sees exactly the
 * ranking they saw when it ran, in the same shape, with the same bands.
 */

import { query } from "../db/pool.js";
import type { CandidateVendor } from "./candidate.js";
import type { EligibilityResult } from "./eligibility.js";
import {
  bandFor,
  buildExplanation,
  type DimensionScore,
  type MatchEvidence,
  type RankedVendor,
} from "./ranking.js";

export interface VendorSummary {
  vendorProfileId: string;
  organizationId: string;
  organizationName: string;
  legalName: string | null;
  headline: string | null;
  verificationState: string;
  completionPercentage: number;
  industries: string[];
  serviceCoverage: string | null;
  operatingStates: string[];
}

export interface VendorRecommendation {
  vendor: VendorSummary;
  rank: number | null;
  overallScore: number;
  band: "STRONG" | "MODERATE" | "LIMITED";
  eligible: boolean;
  dimensions: DimensionScore[];
  eligibility: EligibilityResult;
  evidence: MatchEvidence;
  retrievalSources: string[];
  semanticSimilarity: number | null;
  explanation: string;
}

export function toVendorSummary(vendor: CandidateVendor): VendorSummary {
  return {
    vendorProfileId: vendor.profileId,
    organizationId: vendor.organizationId,
    organizationName: vendor.organizationName,
    legalName: vendor.legalName,
    headline: vendor.headline,
    verificationState: vendor.verificationState,
    completionPercentage: vendor.completionPercentage,
    industries: vendor.industries,
    serviceCoverage: vendor.serviceCoverage,
    operatingStates: vendor.operatingStates,
  };
}

export function toRecommendation(
  ranked: RankedVendor,
  rank: number | null,
): VendorRecommendation {
  return {
    vendor: toVendorSummary(ranked.vendor),
    rank,
    overallScore: ranked.overallScore,
    band: ranked.band,
    eligible: ranked.eligibility.eligible,
    dimensions: ranked.dimensions,
    eligibility: ranked.eligibility,
    evidence: ranked.evidence,
    retrievalSources: ranked.retrieval.sources,
    semanticSimilarity: ranked.retrieval.semanticSimilarity,
    explanation: ranked.explanation,
  };
}

/**
 * Rehydrates a stored run. The scores, eligibility result and evidence are read
 * back exactly as they were written; only the supplier's current identity is
 * re-read, so a renamed organisation shows under its present name without the
 * assessment changing.
 */
export async function loadStoredRecommendations(
  runId: string,
): Promise<{ recommendations: VendorRecommendation[]; excluded: VendorRecommendation[] }> {
  const result = await query<{
    vendor_profile_id: string;
    organization_id: string;
    organization_name: string;
    legal_name: string | null;
    headline: string | null;
    verification_state: string;
    completion_percentage: number;
    industries: string[];
    service_coverage: string | null;
    operating_states: string[];
    eligible: boolean;
    rank_position: number | null;
    overall_score: number;
    dimension_scores: DimensionScore[];
    eligibility: EligibilityResult;
    evidence: MatchEvidence;
    retrieval_sources: string[];
    semantic_similarity: number | null;
  }>(
    `SELECT res.vendor_profile_id, p.organization_id, o.name AS organization_name,
            p.legal_name, p.headline, p.verification_state, p.completion_percentage,
            p.industries, p.service_coverage, p.operating_states,
            res.eligible, res.rank_position, res.overall_score, res.dimension_scores,
            res.eligibility, res.evidence, res.retrieval_sources, res.semantic_similarity
     FROM work_package_match_results res
     JOIN vendor_profiles p ON p.id = res.vendor_profile_id
     JOIN organizations o ON o.id = p.organization_id
     WHERE res.run_id = $1
     ORDER BY res.eligible DESC, res.rank_position ASC NULLS LAST, res.overall_score DESC`,
    [runId],
  );

  const recommendations: VendorRecommendation[] = [];
  const excluded: VendorRecommendation[] = [];

  for (const row of result.rows) {
    const vendor: VendorSummary = {
      vendorProfileId: row.vendor_profile_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      legalName: row.legal_name,
      headline: row.headline,
      verificationState: row.verification_state,
      completionPercentage: row.completion_percentage,
      industries: row.industries ?? [],
      serviceCoverage: row.service_coverage,
      operatingStates: row.operating_states ?? [],
    };

    // Both columns carry a `'{}'::jsonb` default, so a row that ever landed on
    // it would hand the portal an object with no arrays on it and blank the
    // whole page on the first `.length`. Filling the shape here keeps a
    // malformed row to a degraded card rather than a broken screen.
    const storedEvidence = row.evidence as Partial<MatchEvidence> | null;
    const evidence: MatchEvidence = {
      matchedCapabilities: storedEvidence?.matchedCapabilities ?? [],
      missingCapabilities: storedEvidence?.missingCapabilities ?? [],
      relevantExperience: storedEvidence?.relevantExperience ?? [],
      relevantOfferings: storedEvidence?.relevantOfferings ?? [],
      credentials: storedEvidence?.credentials ?? [],
      strengths: storedEvidence?.strengths ?? [],
      gaps: storedEvidence?.gaps ?? [],
    };

    const storedEligibility = row.eligibility as Partial<EligibilityResult> | null;
    const eligibility: EligibilityResult = {
      eligible: row.eligible,
      passedChecks: storedEligibility?.passedChecks ?? [],
      failedChecks: storedEligibility?.failedChecks ?? [],
      warnings: storedEligibility?.warnings ?? [],
      eligibilityVersion: storedEligibility?.eligibilityVersion ?? 0,
    };

    const recommendation: VendorRecommendation = {
      vendor,
      rank: row.rank_position,
      overallScore: row.overall_score,
      band: bandFor(row.overall_score),
      eligible: row.eligible,
      dimensions: row.dimension_scores ?? [],
      eligibility,
      evidence,
      retrievalSources: row.retrieval_sources ?? [],
      semanticSimilarity:
        row.semantic_similarity === null ? null : Number(row.semantic_similarity),
      explanation: buildExplanation(vendor, row.overall_score, evidence.strengths, evidence.gaps),
    };

    (row.eligible ? recommendations : excluded).push(recommendation);
  }

  return { recommendations, excluded };
}
