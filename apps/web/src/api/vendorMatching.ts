import { apiRequest } from "./client.js";

/**
 * Government-facing work-package vendor matching.
 *
 * Every score, band and eligibility verdict in these types is computed on the
 * server from stored supplier data. Nothing here is sent back up: the browser
 * displays a decision, it does not participate in making one.
 */

export type MatchBand = "STRONG" | "MODERATE" | "LIMITED";
export type RetrievalSource = "LEXICAL" | "SEMANTIC";

export type DimensionKey =
  | "capability"
  | "semantic"
  | "experience"
  | "capacity"
  | "geographic"
  | "compliance"
  | "credibility";

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface EligibilityCheck {
  code: string;
  label: string;
  requirement: string;
  evidence: string;
}

export interface EligibilityWarning {
  code: string;
  label: string;
  detail: string;
}

export interface EligibilityResult {
  eligible: boolean;
  passedChecks: EligibilityCheck[];
  failedChecks: EligibilityCheck[];
  warnings: EligibilityWarning[];
  eligibilityVersion: number;
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
  band: MatchBand;
  eligible: boolean;
  dimensions: DimensionScore[];
  eligibility: EligibilityResult;
  evidence: MatchEvidence;
  retrievalSources: RetrievalSource[];
  semanticSimilarity: number | null;
  explanation: string;
}

export interface MatchRun {
  runId: string;
  strategyVersion: number;
  normalizationVersion: number;
  eligibilityVersion: number;
  rankingVersion: number;
  weights: Record<string, number>;
  semanticEnabled: boolean;
  embeddingModel: string | null;
  lexicalCandidates: number;
  semanticCandidates: number;
  poolSize: number;
  eligibleCount: number;
  excludedCount: number;
  durationMs: number;
  createdAt: string;
  requestedByName?: string;
}

export interface MatchableWorkPackage {
  id: string;
  projectId: string;
  packageNumber: string;
  title: string;
  description: string;
  scope: string;
  category: string;
  complexity: string;
  priority: string;
  status: string;
  deliverables: string[];
  requirements: Array<{
    id: string;
    kind: string;
    category: string;
    text: string;
    status: string;
  }>;
}

export interface MatchingRequirements {
  mandatoryCertifications: Array<{ code: string; label: string; sourceText: string }>;
  requiredRegions: string[];
  estimatedValueCeilingInr: number | null;
  capabilityTerms: string[];
}

export interface ShortlistEntry {
  id: string;
  workPackageId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  verificationState: string;
  rankAtShortlist: number | null;
  scoreAtShortlist: number | null;
  reason: string | null;
  addedByName: string;
  createdAt: string;
}

export interface VendorMatchView {
  workPackage: MatchableWorkPackage;
  run: MatchRun | null;
  matchingRequirements?: MatchingRequirements;
  recommendations: VendorRecommendation[];
  excluded: VendorRecommendation[];
  shortlist: ShortlistEntry[];
}

export interface VendorMatchDetail {
  vendor: VendorSummary;
  offerings: Array<{
    id: string;
    kind: string;
    name: string;
    description: string | null;
    categories: string[];
    tags: string[];
    sectors: string[];
  }>;
  experience: Array<{
    id: string;
    title: string;
    clientName: string | null;
    clientType: string | null;
    sector: string | null;
    description: string | null;
    outcome: string | null;
    contractValueInr: number | null;
    startYear: number | null;
    endYear: number | null;
  }>;
  credentials: Array<{
    id: string;
    kind: string;
    name: string;
    issuingAuthority: string | null;
    validUntil: string | null;
    verificationState: string;
  }>;
  capacity: {
    teamSize: number | null;
    governmentExperience: string | null;
    governmentScaleReadiness: string | null;
    deliveryCapability: string | null;
    deliveryModels: string[];
    minProjectValueInr: number | null;
    typicalProjectValueInr: number | null;
    maxProjectValueInr: number | null;
  };
  assessment: VendorRecommendation | null;
}

const base = (workPackageId: string) => `/api/v1/work-packages/${workPackageId}/vendor-matches`;

/** The last stored ranking. Does not re-run retrieval. */
export async function getVendorMatches(workPackageId: string, signal?: AbortSignal) {
  return apiRequest<VendorMatchView>(base(workPackageId), { signal });
}

/** Runs the pipeline. This is "Find Suitable Vendors" and the recalculation. */
export async function runVendorMatching(workPackageId: string) {
  return apiRequest<VendorMatchView>(base(workPackageId), { method: "POST" });
}

export async function getVendorMatchDetail(workPackageId: string, vendorProfileId: string) {
  return apiRequest<VendorMatchDetail>(`${base(workPackageId)}/${vendorProfileId}`);
}

export async function shortlistVendor(
  workPackageId: string,
  vendorProfileId: string,
  reason: string | null,
) {
  return apiRequest<{ created: boolean; shortlist: ShortlistEntry[] }>(
    `${base(workPackageId)}/shortlist`,
    { method: "POST", body: { vendorProfileId, reason } },
  );
}

export async function removeShortlistedVendor(workPackageId: string, vendorProfileId: string) {
  return apiRequest<{ removed: boolean; shortlist: ShortlistEntry[] }>(
    `${base(workPackageId)}/shortlist/${vendorProfileId}`,
    { method: "DELETE" },
  );
}
