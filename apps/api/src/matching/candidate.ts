/**
 * The vendor projection the matching pipeline works from.
 *
 * Eligibility and ranking both read this one shape, loaded for the whole
 * candidate pool in a fixed number of queries. Nothing downstream may reach
 * back into the database for a vendor detail, which is what keeps the pipeline
 * free of per-candidate queries and keeps every explanation traceable to a
 * field that was actually loaded.
 */

export interface CandidateCredential {
  id: string;
  kind: string;
  name: string;
  issuingAuthority: string | null;
  validUntil: string | null;
  verificationState: string;
}

export interface CandidateExperience {
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
}

export interface CandidateOffering {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  categories: string[];
  tags: string[];
  sectors: string[];
}

export interface CandidateVendor {
  profileId: string;
  organizationId: string;
  organizationName: string;
  legalName: string | null;
  headline: string | null;

  status: string;
  verificationState: string;
  completionPercentage: number;

  capabilityKeywords: string[];
  industries: string[];
  subDomains: string[];
  solutionTypes: string[];
  sectorsServed: string[];
  coreCapabilities: string[];
  expertiseAreas: string[];
  problemDomains: string[];

  operatingStates: string[];
  serviceCoverage: string | null;
  deliveryModels: string[];

  teamSize: number | null;
  governmentExperience: string | null;
  governmentScaleReadiness: string | null;
  deliveryCapability: string | null;
  minProjectValueInr: number | null;
  typicalProjectValueInr: number | null;
  maxProjectValueInr: number | null;

  credentials: CandidateCredential[];
  experience: CandidateExperience[];
  offerings: CandidateOffering[];
}

/** Where a candidate came from. A candidate can be found by both. */
export type RetrievalSource = "LEXICAL" | "SEMANTIC";

export interface RetrievedCandidate {
  profileId: string;
  sources: RetrievalSource[];
  lexicalRank: number | null;
  semanticRank: number | null;
  /** Cosine similarity in [0,1], present only when semantic retrieval ran. */
  semanticSimilarity: number | null;
}
