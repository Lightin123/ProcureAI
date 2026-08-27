from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["anthropic", "openai_compatible", "stub"]

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ai_provider: ProviderName | None = None

    # Anthropic provider
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5"
    anthropic_max_tokens: int = 8_000

    # OpenAI-compatible provider (Groq, xAI, OpenRouter, Together, Ollama, ...).
    # Deliberately namespaced AI_* rather than OPENAI_*: a developer machine often
    # has an ambient OPENAI_API_KEY for unrelated tools, and silently picking that
    # up would send the wrong credential to whichever base URL is configured.
    ai_api_key: str | None = None
    ai_base_url: str = GROQ_BASE_URL
    ai_model: str = "openai/gpt-oss-120b"
    ai_max_tokens: int = 3_000
    ai_max_attempts: int = 2

    request_timeout_seconds: float = 55.0
    host: str = "127.0.0.1"
    port: int = 8000

    @property
    def resolved_provider(self) -> ProviderName:
        """Explicit configuration wins; otherwise pick whichever key is present."""
        if self.ai_provider is not None:
            return self.ai_provider
        if self.ai_api_key:
            return "openai_compatible"
        if self.anthropic_api_key:
            return "anthropic"
        return "stub"


@lru_cache
def get_settings() -> Settings:
    return Settings()
