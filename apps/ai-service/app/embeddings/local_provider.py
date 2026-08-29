"""A deterministic embedding model that runs with no API key and no download.

The platform must demonstrate semantic retrieval on a laptop with no
credentials configured, and it must produce the same vector for the same text
every time so a stored embedding can be trusted and a match result reproduced.
A hosted embedding API satisfies neither constraint, so this is the default and
the hosted provider is the upgrade.

The vector has two halves:

  * a **concept space**, one dimension per domain in ``concepts.py``. This is
    what makes the model semantic rather than lexical — "horticultural produce"
    and "fresh agricultural vegetables" share no token but occupy the same
    concept dimension, so their vectors are close.

  * a **hashed lexical space** over the remaining dimensions. This preserves the
    exact procurement terminology that the concept lexicon cannot enumerate:
    a specific standard, a product name, a technique.

The concept half is weighted far above the lexical half, so shared meaning
outweighs shared spelling. Neither half is sufficient alone, which is the same
reason the retrieval stage runs lexical and semantic search together rather than
choosing between them.

This is a bag-of-concepts model. It does not read word order or negation, and it
is not a substitute for a trained sentence encoder — configure
``EMBEDDING_PROVIDER=openai_compatible`` for that. It is a genuine semantic
generalisation over a fixed domain vocabulary, and it is honest about being
exactly that.
"""

from __future__ import annotations

import hashlib
import math

from app.embeddings.concepts import CONCEPT_NAMES, concepts_for_token
from app.embeddings.text import tokenise

# Bumped whenever the vectors this produces change meaning, so the backend can
# recognise a stored embedding as stale and regenerate it. Any edit to the
# concept lexicon, the weights, or the hashing must bump this.
LOCAL_EMBEDDING_VERSION = 1

CONCEPT_COUNT = len(CONCEPT_NAMES)

# Relative magnitudes of the two halves before the vector is normalised. Two
# texts that share concepts but no vocabulary land around 0.85 cosine; two that
# share vocabulary but no concept land around 0.14. That ordering is the point:
# meaning outranks spelling, without spelling being discarded.
CONCEPT_WEIGHT = 0.94
LEXICAL_WEIGHT = 0.34

# A token appearing many times says less each time. Sub-linear growth stops a
# repeated word from dominating a long document.
def _saturating(count: int) -> float:
    return 1.0 + math.log(count)


class LocalConceptEmbeddingProvider:
    """Deterministic concept + hashed-lexical embedding model."""

    name = "local-concept"

    def __init__(self, dimensions: int) -> None:
        if dimensions <= CONCEPT_COUNT:
            raise ValueError(
                f"Embedding dimensions must exceed the {CONCEPT_COUNT} concept dimensions."
            )
        self._dimensions = dimensions
        self._lexical_slots = dimensions - CONCEPT_COUNT

    @property
    def model_name(self) -> str:
        return f"local-concept-v{LOCAL_EMBEDDING_VERSION}"

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_one(text) for text in texts]

    def embed_one(self, text: str) -> list[float]:
        tokens = tokenise(text)

        concept_counts: dict[int, int] = {}
        lexical_counts: dict[int, int] = {}

        for token in tokens:
            indices = concepts_for_token(token)
            for index in indices:
                concept_counts[index] = concept_counts.get(index, 0) + 1

            slot = self._slot(token)
            lexical_counts[slot] = lexical_counts.get(slot, 0) + 1

        vector = [0.0] * self._dimensions

        concept_part = [0.0] * CONCEPT_COUNT
        for index, count in concept_counts.items():
            concept_part[index] = _saturating(count)
        _scale_to(concept_part, CONCEPT_WEIGHT)

        lexical_part = [0.0] * self._lexical_slots
        for slot, count in lexical_counts.items():
            lexical_part[slot] = _saturating(count)
        _scale_to(lexical_part, LEXICAL_WEIGHT)

        vector[:CONCEPT_COUNT] = concept_part
        vector[CONCEPT_COUNT:] = lexical_part

        _normalise_in_place(vector)
        return vector

    def _slot(self, token: str) -> int:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        return int.from_bytes(digest, "big") % self._lexical_slots


def _scale_to(values: list[float], target_norm: float) -> None:
    """Normalises a half to unit length, then scales it to its share.

    Doing this per half rather than once at the end is what fixes the ratio
    between meaning and spelling: without it, a document with a large vocabulary
    would drown its own concepts simply by being long.
    """
    norm = math.sqrt(sum(value * value for value in values))
    if norm == 0.0:
        return
    factor = target_norm / norm
    for index, value in enumerate(values):
        values[index] = value * factor


def _normalise_in_place(vector: list[float]) -> None:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return
    for index, value in enumerate(vector):
        vector[index] = value / norm
