/**
 * Hybrid candidate retrieval: lexical and semantic, run independently and
 * unioned.
 *
 * The two find different suppliers, which is the whole reason both exist.
 * Lexical retrieval catches the exact procurement terminology — a standard, a
 * technique, a named commodity — where an approximate match is worthless.
 * Semantic retrieval catches the supplier who does the work but describes it in
 * their own words: a firm offering "horticultural produce" will never appear in
 * a keyword search for "fresh agricultural vegetables", and excluding them
 * would be a failure of the system rather than of the supplier.
 *
 * Neither is a filter on the other. A candidate found by one is a candidate,
 * and the union is scored as a whole (see ../../docs/ai/rag-and-semantic-search.md).
 */

import { query } from "../db/pool.js";
import { ensureWorkPackageEmbedding, semanticStorageAvailable } from "../repositories/embeddings.js";
import { toVectorLiteral } from "../services/embeddingClient.js";
import { calibrationFor } from "./calibration.js";
import type { CandidateVendor, RetrievedCandidate, RetrievalSource } from "./candidate.js";
import type { NormalizedWorkPackage } from "./normalization.js";

/**
 * How many candidates each half contributes. Set well above the number of
 * recommendations shown: the ranking stage reorders substantially, and a
 * supplier who is fifteenth on keyword overlap can be first once experience and
 * capacity are counted.
 */
export const LEXICAL_LIMIT = 60;
export const SEMANTIC_LIMIT = 60;

/**
 * Terms whose weight is high enough to be worth searching on. Retrieval uses
 * only the strongest terms — the tail of a long scope paragraph would match
 * almost every supplier and turn retrieval into a full scan.
 */
const RETRIEVAL_TERM_THRESHOLD = 0.45;
const MAX_RETRIEVAL_TERMS = 40;

/**
 * A supplier must share at least this many of the package's strong terms to be
 * a lexical candidate. One shared word is a coincidence, not a match: capability
 * documents are long, and on a single-term rule the entire registry qualifies
 * for every package, which makes retrieval a formality and hands the whole
 * decision to the ranking stage.
 */
const MIN_LEXICAL_OVERLAP = 2;

// The minimum cosine for a semantic candidate is per-model and lives in
// ./calibration.js. Nearest-neighbour search always returns its top K, so on a
// small registry every supplier comes back regardless of relevance; the
// threshold is what makes "found semantically" mean the capability statement is
// genuinely close rather than merely closest among the few that exist. It
// cannot be one constant because the two encoders place unrelated text at
// wildly different similarities.

export interface RetrievalOutcome {
  candidates: RetrievedCandidate[];
  lexicalCount: number;
  semanticCount: number;
  semanticEnabled: boolean;
  embeddingModel: string | null;
  queryVector: number[] | null;
}

export function retrievalTerms(workPackage: NormalizedWorkPackage): string[] {
  return workPackage.terms
    .filter((term) => (workPackage.termWeights[term] ?? 0) >= RETRIEVAL_TERM_THRESHOLD)
    .slice(0, MAX_RETRIEVAL_TERMS);
}

/**
 * Keyword-overlap retrieval against the GIN-indexed capability keywords the
 * vendor portal already maintains. Ordering here is by raw overlap only; the
 * weighted capability score is computed in the ranking stage from the full
 * keyword set, so this query stays a cheap index probe.
 */
async function retrieveLexical(
  terms: readonly string[],
): Promise<Array<{ profileId: string; rank: number }>> {
  if (terms.length === 0) return [];

  const result = await query<{ id: string }>(
    `SELECT p.id
     FROM vendor_profiles p,
          LATERAL cardinality(
            ARRAY(SELECT unnest(p.capability_keywords) INTERSECT SELECT unnest($1::text[]))
          ) AS overlap
     WHERE p.capability_keywords && $1::text[]
       AND overlap >= $2
     ORDER BY overlap DESC, p.completion_percentage DESC, p.id
     LIMIT $3`,
    [terms, MIN_LEXICAL_OVERLAP, LEXICAL_LIMIT],
  );

  return result.rows.map((row, index) => ({ profileId: row.id, rank: index + 1 }));
}

/**
 * Nearest-neighbour retrieval over the stored capability embeddings. Cosine
 * distance, converted to a similarity in [0,1] so downstream scoring never has
 * to know which distance metric the index was built with.
 */
async function retrieveSemantic(
  vector: readonly number[],
  model: string,
  threshold: number,
): Promise<{
  hits: Array<{ profileId: string; rank: number; similarity: number }>;
  indexed: number;
}> {
  // Only vectors from the same model are comparable. Restricting on it here
  // means a half-migrated registry returns fewer candidates rather than
  // silently ranking on cosine between two different vector spaces.
  const indexed = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM vendor_capability_embeddings WHERE embedding_model = $1`,
    [model],
  );

  const result = await query<{ vendor_profile_id: string; distance: string }>(
    `SELECT e.vendor_profile_id, (e.embedding <=> $1::vector) AS distance
     FROM vendor_capability_embeddings e
     WHERE e.embedding_model = $2
       AND (e.embedding <=> $1::vector) <= $3
     ORDER BY e.embedding <=> $1::vector
     LIMIT $4`,
    [toVectorLiteral(vector), model, 1 - threshold, SEMANTIC_LIMIT],
  );

  return {
    hits: result.rows.map((row, index) => ({
      profileId: row.vendor_profile_id,
      rank: index + 1,
      similarity: Math.max(0, Math.min(1, 1 - Number.parseFloat(row.distance))),
    })),
    indexed: Number.parseInt(indexed.rows[0]?.count ?? "0", 10),
  };
}

export async function retrieveCandidates(
  workPackage: NormalizedWorkPackage,
): Promise<RetrievalOutcome> {
  const terms = retrievalTerms(workPackage);

  const semanticPossible = await semanticStorageAvailable();
  const embedding = semanticPossible
    ? await ensureWorkPackageEmbedding({
        // The subject matter alone, not the full document: compliance, budget
        // and timeline clauses are near identical across packages and blur the
        // vector towards a corpus average.
        workPackageId: workPackage.workPackageId,
        document: workPackage.semanticDocument,
        normalizationVersion: workPackage.normalizationVersion,
      })
    : undefined;

  const calibration = calibrationFor(embedding?.model);

  const [lexical, semanticResult] = await Promise.all([
    retrieveLexical(terms),
    embedding === undefined
      ? Promise.resolve({ hits: [], indexed: 0 })
      : retrieveSemantic(embedding.vector, embedding.model, calibration.retrievalThreshold),
  ]);

  const semantic = semanticResult.hits;

  // Having a query vector is not the same as having something to compare it
  // against. With no supplier embedded under this model, the semantic half
  // contributed nothing and must say so — otherwise every candidate is scored
  // against an empty index and silently loses the dimension's weight.
  const semanticEnabled = embedding !== undefined && semanticResult.indexed > 0;

  const merged = new Map<string, RetrievedCandidate>();

  for (const hit of lexical) {
    merged.set(hit.profileId, {
      profileId: hit.profileId,
      sources: ["LEXICAL"],
      lexicalRank: hit.rank,
      semanticRank: null,
      semanticSimilarity: null,
    });
  }

  for (const hit of semantic) {
    const existing = merged.get(hit.profileId);
    if (existing === undefined) {
      merged.set(hit.profileId, {
        profileId: hit.profileId,
        sources: ["SEMANTIC"],
        lexicalRank: null,
        semanticRank: hit.rank,
        semanticSimilarity: hit.similarity,
      });
      continue;
    }

    // Deduplication: one candidate, both provenances. Which halves found a
    // supplier is kept because it is exactly what demonstrates the semantic
    // layer earning its place — a candidate marked SEMANTIC only is one the
    // keyword search could not have produced.
    const sources: RetrievalSource[] = [...existing.sources, "SEMANTIC"];
    merged.set(hit.profileId, {
      ...existing,
      sources,
      semanticRank: hit.rank,
      semanticSimilarity: hit.similarity,
    });
  }

  return {
    candidates: [...merged.values()],
    lexicalCount: lexical.length,
    semanticCount: semantic.length,
    semanticEnabled,
    embeddingModel: semanticEnabled ? (embedding?.model ?? null) : null,
    queryVector: embedding?.vector ?? null,
  };
}

/**
 * Loads the full projection for a candidate pool in a fixed number of queries,
 * regardless of pool size.
 */
export async function loadCandidateVendors(
  profileIds: readonly string[],
): Promise<Map<string, CandidateVendor>> {
  if (profileIds.length === 0) return new Map();

  const ids = [...profileIds];

  const [profiles, credentials, experience, offerings] = await Promise.all([
    query<{
      id: string;
      organization_id: string;
      organization_name: string;
      legal_name: string | null;
      headline: string | null;
      status: string;
      verification_state: string;
      completion_percentage: number;
      capability_keywords: string[];
      industries: string[];
      sub_domains: string[];
      solution_types: string[];
      sectors_served: string[];
      core_capabilities: string[];
      expertise_areas: string[];
      problem_domains: string[];
      operating_states: string[];
      service_coverage: string | null;
      delivery_models: string[];
      team_size: number | null;
      government_experience: string | null;
      government_scale_readiness: string | null;
      delivery_capability: string | null;
      min_project_value_inr: string | null;
      typical_project_value_inr: string | null;
      max_project_value_inr: string | null;
    }>(
      `SELECT p.id, p.organization_id, o.name AS organization_name, p.legal_name, p.headline,
              p.status, p.verification_state, p.completion_percentage,
              p.capability_keywords, p.industries, p.sub_domains, p.solution_types,
              p.sectors_served, p.core_capabilities, p.expertise_areas, p.problem_domains,
              p.operating_states, p.service_coverage, p.delivery_models,
              p.team_size, p.government_experience, p.government_scale_readiness,
              p.delivery_capability, p.min_project_value_inr, p.typical_project_value_inr,
              p.max_project_value_inr
       FROM vendor_profiles p
       JOIN organizations o ON o.id = p.organization_id
       WHERE p.id = ANY($1::uuid[])`,
      [ids],
    ),
    query<{
      id: string;
      vendor_profile_id: string;
      kind: string;
      name: string;
      issuing_authority: string | null;
      valid_until: Date | null;
      verification_state: string;
    }>(
      `SELECT id, vendor_profile_id, kind, name, issuing_authority, valid_until, verification_state
       FROM vendor_credentials WHERE vendor_profile_id = ANY($1::uuid[]) ORDER BY created_at`,
      [ids],
    ),
    query<{
      id: string;
      vendor_profile_id: string;
      title: string;
      client_name: string | null;
      client_type: string | null;
      sector: string | null;
      description: string | null;
      outcome: string | null;
      contract_value_inr: string | null;
      start_year: number | null;
      end_year: number | null;
    }>(
      `SELECT id, vendor_profile_id, title, client_name, client_type, sector, description,
              outcome, contract_value_inr, start_year, end_year
       FROM vendor_experience WHERE vendor_profile_id = ANY($1::uuid[]) ORDER BY created_at`,
      [ids],
    ),
    query<{
      id: string;
      vendor_profile_id: string;
      kind: string;
      name: string;
      description: string | null;
      categories: string[];
      tags: string[];
      sectors: string[];
    }>(
      `SELECT id, vendor_profile_id, kind, name, description, categories, tags, sectors
       FROM vendor_offerings WHERE vendor_profile_id = ANY($1::uuid[]) ORDER BY created_at`,
      [ids],
    ),
  ]);

  const numeric = (value: string | null): number | null => {
    if (value === null) return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  /**
   * A Postgres `date` reaches node-postgres as local midnight, so
   * `toISOString()` shifts it a day back everywhere east of UTC — including
   * India, where this runs. Reading the local date parts keeps the calendar
   * date the supplier actually entered, which matters because this value
   * decides whether a mandatory credential has expired.
   */
  const toCalendarDate = (value: Date | null): string | null => {
    if (value === null) return null;
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  };

  const vendors = new Map<string, CandidateVendor>();
  for (const row of profiles.rows) {
    vendors.set(row.id, {
      profileId: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      legalName: row.legal_name,
      headline: row.headline,
      status: row.status,
      verificationState: row.verification_state,
      completionPercentage: row.completion_percentage,
      capabilityKeywords: row.capability_keywords ?? [],
      industries: row.industries ?? [],
      subDomains: row.sub_domains ?? [],
      solutionTypes: row.solution_types ?? [],
      sectorsServed: row.sectors_served ?? [],
      coreCapabilities: row.core_capabilities ?? [],
      expertiseAreas: row.expertise_areas ?? [],
      problemDomains: row.problem_domains ?? [],
      operatingStates: row.operating_states ?? [],
      serviceCoverage: row.service_coverage,
      deliveryModels: row.delivery_models ?? [],
      teamSize: row.team_size,
      governmentExperience: row.government_experience,
      governmentScaleReadiness: row.government_scale_readiness,
      deliveryCapability: row.delivery_capability,
      minProjectValueInr: numeric(row.min_project_value_inr),
      typicalProjectValueInr: numeric(row.typical_project_value_inr),
      maxProjectValueInr: numeric(row.max_project_value_inr),
      credentials: [],
      experience: [],
      offerings: [],
    });
  }

  for (const row of credentials.rows) {
    vendors.get(row.vendor_profile_id)?.credentials.push({
      id: row.id,
      kind: row.kind,
      name: row.name,
      issuingAuthority: row.issuing_authority,
      validUntil: toCalendarDate(row.valid_until),
      verificationState: row.verification_state,
    });
  }

  for (const row of experience.rows) {
    vendors.get(row.vendor_profile_id)?.experience.push({
      id: row.id,
      title: row.title,
      clientName: row.client_name,
      clientType: row.client_type,
      sector: row.sector,
      description: row.description,
      outcome: row.outcome,
      contractValueInr: numeric(row.contract_value_inr),
      startYear: row.start_year,
      endYear: row.end_year,
    });
  }

  for (const row of offerings.rows) {
    vendors.get(row.vendor_profile_id)?.offerings.push({
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      categories: row.categories ?? [],
      tags: row.tags ?? [],
      sectors: row.sectors ?? [],
    });
  }

  return vendors;
}

/**
 * Profiles whose stored embedding is missing or stale, for the refresh sweep.
 *
 * The staleness comparison is done in SQL rather than by loading every
 * capability document and hashing it here: the documents are long, they are
 * unchanged on almost every run, and transferring the whole registry's prose
 * to decide that nothing needs doing is the kind of cost that only shows up
 * once the registry is large. Postgres' `sha256` produces the same digest as
 * `sourceDigest`, so the two sides agree on what "unchanged" means.
 */
export async function listStaleEmbeddingProfiles(
  pipelineVersion: number,
  currentModel: string | undefined,
): Promise<Array<{ id: string; semanticDocument: string | null }>> {
  const result = await query<{ id: string; semantic_document: string | null }>(
    `SELECT p.id, p.semantic_document
     FROM vendor_profiles p
     LEFT JOIN vendor_capability_embeddings e ON e.vendor_profile_id = p.id
     WHERE p.semantic_document IS NOT NULL
       AND p.semantic_document <> ''
       AND (
         e.vendor_profile_id IS NULL
         OR e.embedding_version <> $1
         OR e.source_hash <> encode(sha256(convert_to(p.semantic_document, 'UTF8')), 'hex')
         -- A vector from a different model is not comparable to one from this
         -- model, so switching the embedding provider makes every stored vector
         -- stale even though its source text is unchanged.
         OR ($2::text IS NOT NULL AND e.embedding_model <> $2)
       )`,
    [pipelineVersion, currentModel ?? null],
  );

  return result.rows.map((row) => ({ id: row.id, semanticDocument: row.semantic_document }));
}
