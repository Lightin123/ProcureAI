from typing import Protocol


class EmbeddingProvider(Protocol):
    """Turns text into vectors for semantic retrieval.

    Kept separate from ``RequirementAnalysisProvider`` because the two are not
    the same capability and are not always the same vendor: Anthropic serves the
    analysis calls and has no embeddings API at all, so tying them together
    would make the choice of reasoning model decide whether semantic matching
    works.
    """

    name: str

    @property
    def model_name(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class EmbeddingError(RuntimeError):
    """Raised when embeddings cannot be produced."""
