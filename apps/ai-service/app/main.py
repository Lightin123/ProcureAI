import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

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

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.provider = build_provider(settings)
    app.state.embedding_provider = build_embedding_provider(settings)
    yield


app = FastAPI(
    title="ProcureAI AI Service",
    description="Structured AI analysis for the ProcureAI procurement platform.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(requirement_analysis.router)
app.include_router(work_packages.router)
app.include_router(vendor_capability.router)
app.include_router(response_evaluation.router)
app.include_router(embeddings.router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
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
