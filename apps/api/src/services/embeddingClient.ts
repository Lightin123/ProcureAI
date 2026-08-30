/**
 * The backend's boundary to the embedding model.
 *
 * Everything about which model produces vectors lives behind this one function,
 * so replacing the local model with a hosted one is a configuration change in
 * the AI service and nothing here or downstream of here moves.
 *
 * This call is allowed to fail. Semantic retrieval is one half of a hybrid
 * pipeline, and the lexical half needs no model at all — so a failure here
 * degrades vendor discovery rather than breaking it (D64), which is why the
 * caller gets `undefined` instead of the ApiError the other AI calls throw.
 */

import { z } from "zod";

import { loadConfig } from "../config/env.js";

const embeddingResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  model: z.string().min(1),
  provider: z.string().min(1),
  dimensions: z.number().int().positive(),
});

export interface EmbeddingBatch {
  vectors: number[][];
  model: string;
  provider: string;
  dimensions: number;
}

/**
 * Must equal the width of the `vector(...)` columns, which migration 007 sets.
 * This is the native width of the default encoder (BAAI/bge-small-en-v1.5);
 * changing it means a migration and a full re-embed.
 */
export const EMBEDDING_DIMENSIONS = 384;

/**
 * Texts per request.
 *
 * The AI service accepts up to 64, but the batch size that matters here is the
 * one that keeps a single request inside `AI_SERVICE_TIMEOUT_MS`. The default
 * encoder runs on CPU at roughly two seconds per capability document, so a
 * batch of 64 takes about two minutes and aborts against a sixty-second
 * timeout — and because a failed batch returns nothing, the whole registry then
 * has no embeddings and matching silently degrades to lexical-only (D64).
 *
 * Sixteen keeps a request near thirty seconds on the same hardware, which
 * leaves headroom on a slower machine and turns a re-embed of the whole
 * registry into several short requests rather than one that cannot finish.
 */
const MAX_BATCH = 16;

export async function requestEmbeddings(
  texts: readonly string[],
): Promise<EmbeddingBatch | undefined> {
  if (texts.length === 0) {
    return { vectors: [], model: "none", provider: "none", dimensions: EMBEDDING_DIMENSIONS };
  }

  const config = loadConfig();
  const vectors: number[][] = [];
  let model = "";
  let provider = "";
  let dimensions = 0;

  for (let offset = 0; offset < texts.length; offset += MAX_BATCH) {
    const batch = texts.slice(offset, offset + MAX_BATCH);

    let response: Response;
    try {
      response = await fetch(`${config.aiServiceUrl}/internal/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ texts: batch }),
        signal: AbortSignal.timeout(config.aiServiceTimeoutMs),
      });
    } catch {
      console.warn("[matching] The embedding service could not be reached.");
      return undefined;
    }

    if (!response.ok) {
      console.warn(`[matching] The embedding service returned HTTP ${response.status}.`);
      return undefined;
    }

    const parsed = embeddingResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn("[matching] The embedding service returned output that failed validation.");
      return undefined;
    }

    if (parsed.data.dimensions !== EMBEDDING_DIMENSIONS) {
      // Storing this would be rejected by the vector column anyway; failing
      // here names the actual cause rather than surfacing a type error.
      console.warn(
        `[matching] The embedding model returned ${parsed.data.dimensions} dimensions, but the ` +
          `database stores ${EMBEDDING_DIMENSIONS}. Semantic retrieval is disabled until they agree.`,
      );
      return undefined;
    }

    if (parsed.data.embeddings.length !== batch.length) {
      console.warn("[matching] The embedding service returned the wrong number of vectors.");
      return undefined;
    }

    vectors.push(...parsed.data.embeddings);
    model = parsed.data.model;
    provider = parsed.data.provider;
    dimensions = parsed.data.dimensions;
  }

  return { vectors, model, provider, dimensions };
}

/** pgvector's text input format. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

const embeddingHealthSchema = z.object({
  embedding_model: z.string().min(1).nullable().optional(),
});

let cachedModel: string | undefined;

/**
 * The model the AI service is currently configured to embed with.
 *
 * Needed before any embedding is generated, because a vector is only
 * comparable to another vector from the same model: cosine between an OpenAI
 * embedding and a local concept embedding is noise, and would silently drop
 * most of the semantic half rather than fail. Both the staleness check and the
 * nearest-neighbour query are keyed on this so the two can never be mixed.
 *
 * Cached for the process: changing it means restarting the AI service.
 */
export async function currentEmbeddingModel(): Promise<string | undefined> {
  if (cachedModel !== undefined) return cachedModel;

  const config = loadConfig();
  try {
    const response = await fetch(`${config.aiServiceUrl}/health`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return undefined;

    const parsed = embeddingHealthSchema.safeParse(await response.json());
    const model = parsed.success ? (parsed.data.embedding_model ?? undefined) : undefined;
    if (model !== undefined) cachedModel = model;
    return model;
  } catch {
    return undefined;
  }
}

/** Test seam: forces the model probe to run again. */
export function resetEmbeddingModelCache(): void {
  cachedModel = undefined;
}
