/**
 * The work-package matching pipeline.
 *
 *   confirmed work package
 *     -> requirement normalization
 *     -> hybrid retrieval (lexical + semantic, unioned and deduplicated)
 *     -> candidate pool
 *     -> deterministic eligibility gate
 *     -> multi-factor ranking
 *     -> explainable recommendations
 *     -> government review
 *
 * The stages stay separate on purpose. Collapsing eligibility into the score
 * would let a weighted average quietly readmit a supplier who cannot satisfy a
 * mandatory requirement, and collapsing retrieval into ranking would mean
 * whichever half found a supplier decided how they placed.
 *
 * The gate runs over the candidate pool rather than the whole registry: it
 * needs each supplier's credentials, expiry dates, operating states and stated
 * contract values, and loading all of that for every supplier on the platform
 * in order to discard most of them is the scan retrieval exists to avoid. The
 * verdict is the same for every supplier who could have been recommended,
 * because one neither half retrieved was never going to be ranked. What is
 * load-bearing is the ordering below: nothing that fails the gate is scored.
 *
 * Nothing here selects, shortlists or awards. It produces a ranking and the
 * reasons behind it; the official decides.
 */

import type { PoolClient } from "pg";

import { ApiError } from "../middleware/errors.js";
import {
  EMBEDDING_PIPELINE_VERSION,
  semanticStorageAvailable,
  syncVendorEmbeddings,
} from "../repositories/embeddings.js";
import { currentEmbeddingModel, EMBEDDING_DIMENSIONS } from "../services/embeddingClient.js";
import { findWorkPackageById } from "../repositories/workPackages.js";
import { calibrationFor, isCalibrated } from "./calibration.js";
import { evaluateEligibility, ELIGIBILITY_VERSION } from "./eligibility.js";
import { normalizeWorkPackage, NORMALIZATION_VERSION, type NormalizedWorkPackage } from "./normalization.js";
import { DIMENSION_WEIGHTS, RANKING_VERSION, scoreVendor, type RankedVendor } from "./ranking.js";
import {
  listStaleEmbeddingProfiles,
  loadCandidateVendors,
  retrieveCandidates,
} from "./retrieval.js";
import { getPool, query } from "../db/pool.js";

/** Bumped when the shape of the pipeline itself changes (provenance). */
export const STRATEGY_VERSION = 1;

// Every eligible supplier is returned and stored. There was a cap here, but it
// made `eligibleCount` describe more suppliers than the run actually recorded:
// the header read "Eligible: 40 / 120" above 25 cards, and the other 15 were
// silently unrecoverable on reload. The pool is already bounded by the
// retrieval limits, so the honest number and the stored set are the same set.

export interface MatchRunProvenance {
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
}

export interface MatchOutcome {
  workPackage: NormalizedWorkPackage;
  recommendations: RankedVendor[];
  excluded: RankedVendor[];
  provenance: MatchRunProvenance;
}

export interface MatchRequest {
  workPackageId: string;
  organizationId: string;
  userId: string;
}

/**
 * A package must be confirmed before it can be matched. Matching a draft would
 * put suppliers in front of an official against requirements that have not been
 * agreed, and every downstream act — comparison, shortlisting, invitation —
 * would inherit that.
 */
const MATCHABLE_STATUSES = new Set(["CONFIRMED"]);

export async function runMatching(request: MatchRequest): Promise<MatchOutcome> {
  const startedAt = Date.now();

  const context = await loadWorkPackageContext(request);

  if (!MATCHABLE_STATUSES.has(context.workPackage.status)) {
    throw new ApiError(
      409,
      "WORK_PACKAGE_NOT_CONFIRMED",
      "Vendor matching runs against confirmed work packages. Confirm this package before searching for suppliers.",
    );
  }

  if (context.workPackage.isDeleted) {
    throw new ApiError(
      409,
      "WORK_PACKAGE_DELETED",
      "This work package has been removed and cannot be matched.",
    );
  }

  const normalized = normalizeWorkPackage({
    workPackage: context.workPackage,
    projectTitle: context.projectTitle,
    projectProblemDescription: context.projectProblemDescription,
  });

  // Bring supplier vectors up to date before searching. Staleness is decided in
  // SQL, so a registry where nothing has changed costs one indexed query and no
  // embedding calls: the cost is paid once per edited profile rather than once
  // per match (D67).
  //
  // The availability check has to happen before the staleness query, not inside
  // the sync: the staleness query reads the embedding table, which does not
  // exist at all where pgvector is absent (D64).
  if (await semanticStorageAvailable()) {
    await syncVendorEmbeddings(
      await listStaleEmbeddingProfiles(EMBEDDING_PIPELINE_VERSION, await currentEmbeddingModel()),
    );
  }

  const retrieval = await retrieveCandidates(normalized);

  if (retrieval.semanticEnabled && !isCalibrated(retrieval.embeddingModel)) {
    // Similarity scales are not comparable between models, so an unmeasured one
    // runs on conservative defaults. Saying so is the honest alternative to
    // presenting its scores as though they meant the same as a measured model's.
    console.warn(
      `[matching] Embedding model "${retrieval.embeddingModel}" has no measured calibration; ` +
        "semantic scores use conservative defaults. See src/matching/calibration.ts.",
    );
  }
  const vendors = await loadCandidateVendors(
    retrieval.candidates.map((candidate) => candidate.profileId),
  );

  const recommendations: RankedVendor[] = [];
  const excluded: RankedVendor[] = [];

  for (const candidate of retrieval.candidates) {
    const vendor = vendors.get(candidate.profileId);
    if (vendor === undefined) continue;

    const eligibility = evaluateEligibility(normalized, vendor);
    const ranked = scoreVendor(normalized, vendor, candidate, eligibility, {
      semanticEnabled: retrieval.semanticEnabled,
      calibration: calibrationFor(retrieval.embeddingModel),
    });

    (eligibility.eligible ? recommendations : excluded).push(ranked);
  }

  // Deterministic ordering: score first, then a stable tiebreak, so the same
  // data always produces the same ranking and two suppliers on the same score
  // do not swap places between runs.
  recommendations.sort(compareRanked);
  excluded.sort(compareRanked);

  const durationMs = Date.now() - startedAt;

  const runId = await recordMatchRun({
    request,
    projectId: context.projectId,
    retrieval,
    poolSize: retrieval.candidates.length,
    eligibleCount: recommendations.length,
    excludedCount: excluded.length,
    durationMs,
    recommendations,
    excluded,
  });

  return {
    workPackage: normalized,
    recommendations,
    excluded,
    provenance: {
      runId,
      strategyVersion: STRATEGY_VERSION,
      normalizationVersion: NORMALIZATION_VERSION,
      eligibilityVersion: ELIGIBILITY_VERSION,
      rankingVersion: RANKING_VERSION,
      weights: { ...DIMENSION_WEIGHTS },
      semanticEnabled: retrieval.semanticEnabled,
      embeddingModel: retrieval.embeddingModel,
      lexicalCandidates: retrieval.lexicalCount,
      semanticCandidates: retrieval.semanticCount,
      poolSize: retrieval.candidates.length,
      eligibleCount: recommendations.length,
      excludedCount: excluded.length,
      durationMs,
      createdAt: new Date().toISOString(),
    },
  };
}

function compareRanked(left: RankedVendor, right: RankedVendor): number {
  if (right.overallScore !== left.overallScore) return right.overallScore - left.overallScore;

  const leftCapability = left.dimensions.find((d) => d.key === "capability")?.score ?? 0;
  const rightCapability = right.dimensions.find((d) => d.key === "capability")?.score ?? 0;
  if (rightCapability !== leftCapability) return rightCapability - leftCapability;

  return left.vendor.profileId.localeCompare(right.vendor.profileId);
}

interface WorkPackageContext {
  workPackage: Awaited<ReturnType<typeof findWorkPackageById>> extends infer T
    ? T extends undefined
      ? never
      : NonNullable<T>
    : never;
  projectId: string;
  projectTitle: string;
  projectProblemDescription: string;
}

/**
 * Loads the package and its project, scoped to the caller's organization in
 * SQL. A package belonging to another department reads as absent rather than
 * forbidden, so this endpoint cannot be used to discover that it exists.
 */
async function loadWorkPackageContext(request: MatchRequest): Promise<WorkPackageContext> {
  const project = await query<{
    id: string;
    title: string;
    problem_description: string;
  }>(
    `SELECT pr.id, pr.title, pr.problem_description
     FROM work_packages wp
     JOIN procurement_projects pr ON pr.id = wp.project_id
     WHERE wp.id = $1 AND pr.organization_id = $2`,
    [request.workPackageId, request.organizationId],
  );

  const projectRow = project.rows[0];
  if (projectRow === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }

  const workPackage = await findWorkPackageById(request.workPackageId);
  if (workPackage === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The work package was not found.");
  }

  return {
    workPackage,
    projectId: projectRow.id,
    projectTitle: projectRow.title,
    projectProblemDescription: projectRow.problem_description,
  };
}

/**
 * Persists the run and its results.
 *
 * Excluded suppliers are stored alongside recommended ones. A gate whose
 * decisions are not written down cannot be audited, and "who did the system
 * rule out, and on what ground" is a question an official is entitled to ask
 * after the fact (D68).
 */
async function recordMatchRun(input: {
  request: MatchRequest;
  projectId: string;
  retrieval: { semanticEnabled: boolean; embeddingModel: string | null; lexicalCount: number; semanticCount: number };
  poolSize: number;
  eligibleCount: number;
  excludedCount: number;
  durationMs: number;
  recommendations: readonly RankedVendor[];
  excluded: readonly RankedVendor[];
}): Promise<string> {
  // The run and its results are one record. Written separately, a failure on
  // the results would leave a run row whose summary counts describe suppliers
  // that were never stored, and the portal would render a ranking header over
  // an empty list.
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const runId = await writeRun(client, input);
    await client.query("COMMIT");
    return runId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function writeRun(
  client: PoolClient,
  input: Parameters<typeof recordMatchRun>[0],
): Promise<string> {
  const run = await client.query<{ id: string }>(
    `INSERT INTO work_package_match_runs
       (work_package_id, project_id, requested_by, strategy_version, normalization_version,
        eligibility_version, ranking_version, weights, semantic_enabled, embedding_model,
        embedding_dimensions, lexical_candidates, semantic_candidates, pool_size,
        eligible_count, excluded_count, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id`,
    [
      input.request.workPackageId,
      input.projectId,
      input.request.userId,
      STRATEGY_VERSION,
      NORMALIZATION_VERSION,
      ELIGIBILITY_VERSION,
      RANKING_VERSION,
      JSON.stringify(DIMENSION_WEIGHTS),
      input.retrieval.semanticEnabled,
      input.retrieval.embeddingModel,
      input.retrieval.semanticEnabled ? EMBEDDING_DIMENSIONS : null,
      input.retrieval.lexicalCount,
      input.retrieval.semanticCount,
      input.poolSize,
      input.eligibleCount,
      input.excludedCount,
      input.durationMs,
    ],
  );

  const runId = run.rows[0]?.id;
  if (runId === undefined) {
    throw new Error("The matching run could not be recorded.");
  }

  const rows: Array<{ ranked: RankedVendor; rank: number | null }> = [
    ...input.recommendations.map((ranked, index) => ({ ranked, rank: index + 1 })),
    ...input.excluded.map((ranked) => ({ ranked, rank: null })),
  ];

  if (rows.length === 0) return runId;

  // One multi-row insert rather than a statement per supplier.
  const values: unknown[] = [];
  const tuples: string[] = [];

  for (const { ranked, rank } of rows) {
    const base = values.length;
    values.push(
      runId,
      input.request.workPackageId,
      ranked.vendor.profileId,
      ranked.eligibility.eligible,
      rank,
      ranked.overallScore,
      // The whole dimension array, not a key-to-score map: the label, weight
      // and per-dimension detail are what make a stored result readable months
      // later, and reconstructing them would require the weights of the day.
      JSON.stringify(ranked.dimensions),
      JSON.stringify(ranked.eligibility),
      JSON.stringify(ranked.evidence),
      ranked.retrieval.sources,
      ranked.retrieval.semanticSimilarity,
    );
    tuples.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, ` +
        `$${base + 7}::jsonb, $${base + 8}::jsonb, $${base + 9}::jsonb, $${base + 10}::text[], $${base + 11})`,
    );
  }

  await client.query(
    `INSERT INTO work_package_match_results
       (run_id, work_package_id, vendor_profile_id, eligible, rank_position, overall_score,
        dimension_scores, eligibility, evidence, retrieval_sources, semantic_similarity)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (run_id, vendor_profile_id) DO NOTHING`,
    values,
  );

  return runId;
}
