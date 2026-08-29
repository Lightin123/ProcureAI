/**
 * Storage and lifecycle for the vectors semantic retrieval searches.
 *
 * The rule this file enforces is that an embedding is regenerated when — and
 * only when — the text it was made from has changed, or the model that made it
 * has. Regenerating on every profile write would mean an API call per keystroke
 * during onboarding; not regenerating at all would mean matching against a
 * supplier's capabilities as they were months ago. The source digest is what
 * distinguishes the two cases (D67).
 */

import { createHash } from "node:crypto";

import { query } from "../db/pool.js";
import {
  EMBEDDING_DIMENSIONS,
  requestEmbeddings,
  toVectorLiteral,
} from "../services/embeddingClient.js";

/** Bumped when the embedding pipeline changes such that stored vectors are stale. */
export const EMBEDDING_PIPELINE_VERSION = 1;

let vectorSupport: boolean | undefined;

/**
 * Whether pgvector is installed and migration 006 created its tables.
 *
 * Cached for the life of the process: the extension cannot appear or disappear
 * without a migration and a restart, and checking per request would put a
 * catalogue query in front of every match.
 */
export async function semanticStorageAvailable(): Promise<boolean> {
  if (vectorSupport !== undefined) return vectorSupport;

  const result = await query<{ available: boolean }>(
    `SELECT to_regclass('vendor_capability_embeddings') IS NOT NULL
        AND to_regclass('work_package_embeddings') IS NOT NULL AS available`,
  );

  vectorSupport = result.rows[0]?.available === true;
  if (!vectorSupport) {
    console.warn(
      "[matching] pgvector tables are absent. Vendor matching will use lexical retrieval only. " +
        "Install pgvector and re-run migration 006 to enable semantic retrieval.",
    );
  }

  return vectorSupport;
}

export function sourceDigest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

interface StaleTarget {
  id: string;
  text: string;
  digest: string;
}

/**
 * Brings a set of vendor capability embeddings up to date.
 *
 * Returns the model actually used, or `undefined` when semantic retrieval is
 * unavailable — a caller that gets `undefined` proceeds on lexical retrieval
 * alone rather than failing.
 */
export async function syncVendorEmbeddings(
  profiles: ReadonlyArray<{ id: string; semanticDocument: string | null }>,
): Promise<{ model: string; refreshed: number } | undefined> {
  if (!(await semanticStorageAvailable())) return undefined;

  const withText = profiles.filter(
    (profile): profile is { id: string; semanticDocument: string } =>
      profile.semanticDocument !== null && profile.semanticDocument.trim() !== "",
  );
  if (withText.length === 0) return undefined;

  const existing = await query<{
    vendor_profile_id: string;
    source_hash: string;
    embedding_version: number;
    embedding_model: string;
  }>(
    `SELECT vendor_profile_id, source_hash, embedding_version, embedding_model
     FROM vendor_capability_embeddings
     WHERE vendor_profile_id = ANY($1::uuid[])`,
    [withText.map((profile) => profile.id)],
  );

  const current = new Map(existing.rows.map((row) => [row.vendor_profile_id, row]));
  const stale: StaleTarget[] = [];

  for (const profile of withText) {
    const digest = sourceDigest(profile.semanticDocument);
    const stored = current.get(profile.id);

    const upToDate =
      stored !== undefined &&
      stored.source_hash === digest &&
      stored.embedding_version === EMBEDDING_PIPELINE_VERSION;

    if (!upToDate) {
      stale.push({ id: profile.id, text: profile.semanticDocument, digest });
    }
  }

  if (stale.length === 0) {
    const model = existing.rows[0]?.embedding_model;
    return model === undefined ? undefined : { model, refreshed: 0 };
  }

  const batch = await requestEmbeddings(stale.map((target) => target.text));
  if (batch === undefined) {
    // The stored vectors, if any, stay in place. A stale embedding still
    // retrieves better than no embedding, and the alternative — deleting it —
    // would turn a transient outage into lost data.
    return undefined;
  }

  for (const [index, target] of stale.entries()) {
    const vector = batch.vectors[index];
    if (vector === undefined) continue;

    await query(
      `INSERT INTO vendor_capability_embeddings
         (vendor_profile_id, source_hash, embedding_model, embedding_version, dimensions, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)
       ON CONFLICT (vendor_profile_id) DO UPDATE
         SET source_hash       = EXCLUDED.source_hash,
             embedding_model   = EXCLUDED.embedding_model,
             embedding_version = EXCLUDED.embedding_version,
             dimensions        = EXCLUDED.dimensions,
             embedding         = EXCLUDED.embedding,
             updated_at        = now()`,
      [
        target.id,
        target.digest,
        batch.model,
        EMBEDDING_PIPELINE_VERSION,
        EMBEDDING_DIMENSIONS,
        toVectorLiteral(vector),
      ],
    );
  }

  return { model: batch.model, refreshed: stale.length };
}

/**
 * Returns the work package's query vector, regenerating it if the normalized
 * document has changed since it was last embedded.
 */
export async function ensureWorkPackageEmbedding(input: {
  workPackageId: string;
  document: string;
  normalizationVersion: number;
}): Promise<{ vector: number[]; model: string } | undefined> {
  if (!(await semanticStorageAvailable())) return undefined;

  const digest = sourceDigest(input.document);

  const existing = await query<{ embedding: string; embedding_model: string }>(
    `SELECT embedding::text AS embedding, embedding_model
     FROM work_package_embeddings
     WHERE work_package_id = $1
       AND source_hash = $2
       AND normalization_version = $3
       AND embedding_version = $4`,
    [input.workPackageId, digest, input.normalizationVersion, EMBEDDING_PIPELINE_VERSION],
  );

  const stored = existing.rows[0];
  if (stored !== undefined) {
    return { vector: parseVectorLiteral(stored.embedding), model: stored.embedding_model };
  }

  const batch = await requestEmbeddings([input.document]);
  const vector = batch?.vectors[0];
  if (batch === undefined || vector === undefined) return undefined;

  await query(
    `INSERT INTO work_package_embeddings
       (work_package_id, source_hash, normalization_version, embedding_model,
        embedding_version, dimensions, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
     ON CONFLICT (work_package_id) DO UPDATE
       SET source_hash           = EXCLUDED.source_hash,
           normalization_version = EXCLUDED.normalization_version,
           embedding_model       = EXCLUDED.embedding_model,
           embedding_version     = EXCLUDED.embedding_version,
           dimensions            = EXCLUDED.dimensions,
           embedding             = EXCLUDED.embedding,
           updated_at            = now()`,
    [
      input.workPackageId,
      digest,
      input.normalizationVersion,
      batch.model,
      EMBEDDING_PIPELINE_VERSION,
      EMBEDDING_DIMENSIONS,
      toVectorLiteral(vector),
    ],
  );

  return { vector, model: batch.model };
}

function parseVectorLiteral(literal: string): number[] {
  return literal
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((value) => Number.parseFloat(value));
}

/** Test seam: forces the pgvector capability check to run again. */
export function resetSemanticStorageCache(): void {
  vectorSupport = undefined;
}
