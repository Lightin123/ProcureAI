"""Hosted embeddings over any OpenAI-compatible endpoint."""

from __future__ import annotations

import logging

from openai import AsyncOpenAI

from app.config import Settings
from app.embeddings.base import EmbeddingError

logger = logging.getLogger(__name__)


class OpenAICompatibleEmbeddingProvider:
    """Calls ``/embeddings`` on a configured OpenAI-compatible base URL.

    The requested dimensionality is sent with the request, because the stored
    vector column has a fixed width: a model that silently returned a different
    size would produce rows the database rejects. Providers that ignore the
    parameter are caught by the length check below rather than at insert time,
    so the error names the real cause.
    """

    name = "openai-compatible-embeddings"

    def __init__(self, settings: Settings) -> None:
        api_key = settings.embedding_api_key or settings.ai_api_key
        if not api_key:
            raise EmbeddingError(
                "No embedding API key is configured. Set EMBEDDING_API_KEY, or leave "
                "EMBEDDING_PROVIDER unset to use the local model."
            )

        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=settings.embedding_base_url or settings.ai_base_url,
            timeout=settings.request_timeout_seconds,
        )
        self._model = settings.embedding_model
        self._dimensions = settings.embedding_dimensions

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        try:
            response = await self._client.embeddings.create(
                model=self._model,
                input=texts,
                dimensions=self._dimensions,
            )
        except Exception as error:  # noqa: BLE001 — surfaced to the caller as one failure mode
            raise EmbeddingError(f"The embedding provider failed: {error}") from error

        # The API does not guarantee input order is preserved.
        ordered = sorted(response.data, key=lambda item: item.index)
        vectors = [list(item.embedding) for item in ordered]

        for vector in vectors:
            if len(vector) != self._dimensions:
                raise EmbeddingError(
                    f"Model {self._model} returned {len(vector)} dimensions, but "
                    f"{self._dimensions} are configured. Set EMBEDDING_DIMENSIONS to match "
                    "the model and re-run the embedding migration."
                )

        if len(vectors) != len(texts):
            raise EmbeddingError(
                f"Requested {len(texts)} embeddings but received {len(vectors)}."
            )

        return vectors
