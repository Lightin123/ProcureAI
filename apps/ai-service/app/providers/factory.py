import logging

from app.config import Settings
from app.providers.base import RequirementAnalysisProvider
from app.providers.stub_provider import StubProvider

logger = logging.getLogger(__name__)


def build_provider(settings: Settings) -> RequirementAnalysisProvider:
    provider = settings.resolved_provider

    if provider == "anthropic":
        from app.providers.anthropic_provider import AnthropicProvider

        logger.info("Using Anthropic provider with model %s", settings.anthropic_model)
        return AnthropicProvider(settings)

    if provider == "openai_compatible":
        from app.providers.openai_compatible_provider import OpenAICompatibleProvider

        logger.info(
            "Using OpenAI-compatible provider at %s with model %s",
            settings.ai_base_url,
            settings.ai_model,
        )
        return OpenAICompatibleProvider(settings)

    logger.info("Using deterministic stub provider (no API key configured)")
    return StubProvider()
