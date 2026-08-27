from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["anthropic", "stub"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ai_provider: ProviderName | None = None
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5"
    anthropic_max_tokens: int = 8_000
    request_timeout_seconds: float = 55.0
    host: str = "127.0.0.1"
    port: int = 8000

    @property
    def resolved_provider(self) -> ProviderName:
        """Explicit configuration wins; otherwise use Anthropic only when a key is present."""
        if self.ai_provider is not None:
            return self.ai_provider
        return "anthropic" if self.anthropic_api_key else "stub"


@lru_cache
def get_settings() -> Settings:
    return Settings()
