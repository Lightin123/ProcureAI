"""A real sentence encoder, running locally on CPU.

This is the primary embedding model. Unlike the concept-space fallback in
``local_provider.py`` it is a trained transformer, so it generalises over
wording it was never told about rather than over a lexicon somebody wrote by
hand — which is the difference between semantic matching that keeps working as
the platform reaches new sectors and semantic matching that quietly degrades to
keyword matching whenever the lexicon runs out.

It needs no API key and no network after the first run: fastembed pulls a
quantised ONNX build of the model once and caches it on disk. Inference is
deterministic for a given model build, so a stored vector stays reproducible.

Two details matter for correctness here:

  * **Chunking.** The model's context is 512 tokens. A vendor capability
    document runs to several thousand words, so embedding it whole would encode
    the organisation's address and drop its capabilities. Long text is split,
    each chunk encoded, and the chunk vectors mean-pooled — the standard
    treatment for documents longer than the encoder, and the reason a supplier's
    experience section counts towards their vector at all.

  * **Normalisation.** Vectors are returned unit-length so the cosine distance
    pgvector computes is the dot product, and so mean-pooling chunks cannot let
    a long document acquire a larger magnitude than a short one.
"""

from __future__ import annotations

import logging
import math
import re

from app.embeddings.base import EmbeddingError

logger = logging.getLogger(__name__)

# Bumped when anything here changes the vectors produced, so the backend
# recognises stored embeddings as stale and regenerates them.
ONNX_EMBEDDING_VERSION = 1

# Comfortably inside the 512-token context once tokenised. Words are a coarse
# proxy for tokens, so the bound is deliberately conservative.
CHUNK_WORDS = 350
CHUNK_OVERLAP_WORDS = 50

# A document that would produce more chunks than this is truncated. Capability
# documents do not approach it; the cap exists so one malformed record cannot
# turn a match into a minute of inference.
MAX_CHUNKS = 12

_WHITESPACE = re.compile(r"\s+")


class LocalOnnxEmbeddingProvider:
    """Sentence-transformer embeddings via fastembed's ONNX runtime."""

    name = "local-onnx"

    def __init__(self, model_name: str, dimensions: int, cache_dir: str | None = None) -> None:
        try:
            from fastembed import TextEmbedding
        except ImportError as error:  # pragma: no cover - dependency is declared
            raise EmbeddingError(
                "fastembed is not installed. Install the AI service requirements, or set "
                "EMBEDDING_PROVIDER=local to use the offline concept model."
            ) from error

        try:
            # cache_dir is where the ~90 MB model is downloaded to and read back
            # from. Left unset, fastembed chooses a temporary location, which on
            # a host with an ephemeral filesystem means downloading it again on
            # every restart.
            self._model = (
                TextEmbedding(model_name=model_name, cache_dir=cache_dir)
                if cache_dir
                else TextEmbedding(model_name=model_name)
            )
        except Exception as error:  # noqa: BLE001 — surfaced as one failure mode
            raise EmbeddingError(
                f"The embedding model {model_name} could not be loaded ({error}). "
                "The first run downloads it and needs network access."
            ) from error

        self._model_name = model_name
        self._dimensions = dimensions

    @property
    def model_name(self) -> str:
        return f"{self._model_name}+v{ONNX_EMBEDDING_VERSION}"

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        # Every chunk of every text is encoded in one pass, then regrouped by
        # the document it came from. Batching this way keeps a long document
        # from costing a separate model invocation per chunk.
        chunks: list[str] = []
        spans: list[tuple[int, int]] = []

        for text in texts:
            pieces = _chunk(text)
            spans.append((len(chunks), len(chunks) + len(pieces)))
            chunks.extend(pieces)

        try:
            encoded = [list(vector) for vector in self._model.embed(chunks)]
        except Exception as error:  # noqa: BLE001
            raise EmbeddingError(f"Embedding inference failed: {error}") from error

        if len(encoded) != len(chunks):
            raise EmbeddingError(
                f"Encoded {len(encoded)} chunks but expected {len(chunks)}."
            )

        vectors: list[list[float]] = []
        for start, end in spans:
            pooled = _mean_pool(encoded[start:end], self._dimensions)
            if len(pooled) != self._dimensions:
                raise EmbeddingError(
                    f"Model {self._model_name} returned {len(pooled)} dimensions, but "
                    f"{self._dimensions} are configured. Set EMBEDDING_DIMENSIONS to match "
                    "the model and re-run the embedding migration."
                )
            vectors.append(pooled)

        return vectors


def _chunk(text: str) -> list[str]:
    """Splits text into overlapping windows the encoder can read whole.

    The windows overlap so a capability sentence straddling a boundary is not
    cut in half in every chunk that contains it.
    """
    words = _WHITESPACE.sub(" ", text).strip().split(" ")
    if words == [""]:
        return [""]

    if len(words) <= CHUNK_WORDS:
        return [" ".join(words)]

    step = CHUNK_WORDS - CHUNK_OVERLAP_WORDS
    chunks: list[str] = []

    for start in range(0, len(words), step):
        chunks.append(" ".join(words[start : start + CHUNK_WORDS]))
        if len(chunks) >= MAX_CHUNKS:
            break

    return chunks


def _mean_pool(vectors: list[list[float]], dimensions: int) -> list[float]:
    """Averages chunk vectors into one document vector, unit-normalised."""
    if not vectors:
        return [0.0] * dimensions

    total = [0.0] * len(vectors[0])
    for vector in vectors:
        for index, value in enumerate(vector):
            total[index] += value

    count = float(len(vectors))
    pooled = [value / count for value in total]

    norm = math.sqrt(sum(value * value for value in pooled))
    if norm == 0.0:
        return pooled

    return [value / norm for value in pooled]
