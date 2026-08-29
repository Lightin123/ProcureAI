import logging

from app.config import Settings
from app.embeddings.base import EmbeddingError, EmbeddingProvider
from app.embeddings.local_provider import LocalConceptEmbeddingProvider

logger = logging.getLogger(__name__)


def build_embedding_provider(settings: Settings) -> EmbeddingProvider:
    """Resolves the embedding model.

    A local model is the default rather than a fallback. Semantic retrieval is
    part of how the platform decides which suppliers an official sees, so it
    should not switch itself off — or start costing money per match —
    depending on whether an unrelated API key happens to be present.

    The order is deliberate. ``local_onnx`` is a real sentence encoder and is
    what the platform is calibrated against. ``local_concept`` is the offline
    fallback: it needs no download at all, so a machine with no network on
    first run still gets working semantic retrieval rather than none. The
    fallback is automatic only when the encoder genuinely cannot be loaded, and
    it is logged loudly, because the two models are not interchangeable — their
    similarity scales differ and the backend calibrates per model.
    """
    resolved = settings.resolved_embedding_provider

    if resolved == "openai_compatible":
        from app.embeddings.openai_provider import OpenAICompatibleEmbeddingProvider

        logger.info(
            "Using hosted embeddings: %s at %s (%d dimensions)",
            settings.embedding_model,
            settings.embedding_base_url or settings.ai_base_url,
            settings.embedding_dimensions,
        )
        return OpenAICompatibleEmbeddingProvider(settings)

    if resolved == "local_concept":
        logger.info(
            "Using the deterministic concept embedding model (%d dimensions), by configuration",
            settings.embedding_dimensions,
        )
        return LocalConceptEmbeddingProvider(settings.embedding_dimensions)

    from app.embeddings.onnx_provider import LocalOnnxEmbeddingProvider

    try:
        provider = LocalOnnxEmbeddingProvider(
            settings.embedding_model, settings.embedding_dimensions
        )
    except EmbeddingError as error:
        logger.warning(
            "The local sentence encoder could not be loaded (%s). Falling back to the "
            "deterministic concept model. Semantic retrieval will still work, but it will "
            "generalise only over the built-in procurement lexicon. Set "
            "EMBEDDING_PROVIDER=local_concept to make this the intended configuration.",
            error,
        )
        return LocalConceptEmbeddingProvider(settings.embedding_dimensions)

    logger.info(
        "Using the local sentence encoder %s (%d dimensions)",
        settings.embedding_model,
        settings.embedding_dimensions,
    )
    return provider
