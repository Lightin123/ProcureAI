import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.providers.factory import build_provider
from app.routers import requirement_analysis, vendor_capability, work_packages
from app.schemas import HealthResponse

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.provider = build_provider(settings)
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


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    provider = app.state.provider
    return HealthResponse(
        status="ok",
        service="procureai-ai-service",
        provider=provider.name,
        model=provider.model_name,
    )
