from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderName = Literal["anthropic", "openai_compatible", "stub"]
EmbeddingProviderName = Literal["local_onnx", "local_concept", "openai_compatible"]

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# The width of the stored vector column, and the native width of the default
# model. Changing it requires a migration and a full re-embed, so it is a
# constant rather than something the environment can quietly disagree with the
# database about.
DEFAULT_EMBEDDING_DIMENSIONS = 384

# A quantised ONNX build of BAAI/bge-small-en-v1.5: a real sentence encoder,
# 384-dimensional, ~90 MB, CPU-only, downloaded once and cached.
DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"


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

    # Embeddings. Deliberately configured independently of the analysis
    # provider: reasoning and retrieval are different capabilities, and the
    # Anthropic provider that serves analysis has no embeddings API at all.
    # Defaults to the local model so semantic retrieval works with no
    # credentials and costs nothing per match.
    embedding_provider: EmbeddingProviderName | None = None
    embedding_api_key: str | None = None
    embedding_base_url: str | None = None
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    embedding_dimensions: int = DEFAULT_EMBEDDING_DIMENSIONS

    # Where fastembed caches the downloaded ONNX model. Left unset it uses the
    # library default inside the container, which on a platform with an
    # ephemeral filesystem means re-downloading ~90 MB on every deploy. Point it
    # at a mounted disk to keep the model across restarts.
    embedding_cache_dir: str | None = None

    request_timeout_seconds: float = 55.0

    # The service has no user identity of its own: its only caller is the
    # Express backend, which holds this shared secret. Unset is permitted in
    # development (and logged); production refuses to start without it.
    ai_service_token: str | None = None
    environment: Literal["development", "production"] = "development"

    # Loopback by default, so a development machine never exposes the service on
    # its network. A deployment sets HOST=0.0.0.0 and takes PORT from the
    # platform; authentication, not the bind address, is what protects it there.
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

    @property
    def resolved_embedding_provider(self) -> EmbeddingProviderName:
        """Hosted embeddings are opt-in; the local encoder is the default.

        Unlike the analysis provider this does not switch on the mere presence
        of a key: an ``AI_API_KEY`` set for requirement analysis should not
        silently start billing per embedding, and a Groq or Anthropic key would
        point at an endpoint with no embeddings route at all. Only the
        embedding-specific key opts in.
        """
        if self.embedding_provider is not None:
            return self.embedding_provider
        return "openai_compatible" if self.embedding_api_key else "local_onnx"


@lru_cache
def get_settings() -> Settings:
    return Settings()
