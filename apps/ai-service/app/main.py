import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from app.config import get_settings
from app.embeddings.factory import build_embedding_provider
from app.providers.factory import build_provider
from app.routers import (
    embeddings,
    requirement_analysis,
    response_evaluation,
    vendor_capability,
    work_packages,
)
from app.schemas import HealthResponse
from app.security import require_internal_token

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)

_settings = get_settings()
_is_production = _settings.environment == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # A production process with no token would serve every internal endpoint to
    # anyone who found the URL. Refusing to start makes that a failed deploy
    # rather than a quietly open service.
    if settings.environment == "production" and not settings.ai_service_token:
        raise RuntimeError(
            "AI_SERVICE_TOKEN is not set. The AI service cannot run in production without "
            "it: every /internal/v1 endpoint would be callable by anyone who reached the "
            "service, at the project's expense."
        )

    if not settings.ai_service_token:
        logger.warning(
            "No AI_SERVICE_TOKEN configured: /internal/v1 endpoints accept any caller. "
            "This is intended for local development only."
        )

    app.state.settings = settings
    app.state.provider = build_provider(settings)

    # Built once, at startup, and reused for the life of the process. The local
    # encoder loads its ONNX model here — roughly 90 MB, downloaded on first run
    # and cached thereafter — so no request pays for loading it, and the health
    # endpoint below touches only the already-constructed object.
    app.state.embedding_provider = build_embedding_provider(settings)
    yield


app = FastAPI(
    title="ProcureAI AI Service",
    description="Structured AI analysis for the ProcureAI procurement platform.",
    version="0.1.0",
    lifespan=lifespan,
    # The interactive docs describe every internal endpoint and its schema.
    # Useful in development, and an unnecessary map of the service in production.
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)

# Authentication is applied at the router, not per endpoint, so an endpoint
# added to any of these routers later is protected whether or not its author
# remembered — the same reasoning as mounting requireAuth on the /api/v1 prefix
# in the Express backend.
_internal = [Depends(require_internal_token)]

app.include_router(requirement_analysis.router, dependencies=_internal)
app.include_router(work_packages.router, dependencies=_internal)
app.include_router(vendor_capability.router, dependencies=_internal)
app.include_router(response_evaluation.router, dependencies=_internal)
app.include_router(embeddings.router, dependencies=_internal)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness and configuration probe.

    Deliberately unauthenticated: a platform health check cannot send a custom
    header, and the Express backend reports this payload on its System Status
    screen. It reads already-constructed objects and never loads a model, so it
    stays cheap enough to be polled. It exposes provider and model names — never
    a key, a token, or any procurement data.
    """
    provider = app.state.provider
    embedder = app.state.embedding_provider
    return HealthResponse(
        status="ok",
        service="procureai-ai-service",
        provider=provider.name,
        model=provider.model_name,
        embedding_provider=embedder.name,
        embedding_model=embedder.model_name,
        embedding_dimensions=embedder.dimensions,
    )
