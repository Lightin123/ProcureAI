import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.providers.base import ProviderError
from app.schemas import RequirementAnalysisRequest, RequirementAnalysisResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/v1", tags=["requirement-analysis"])


@router.post("/requirement-analysis", response_model=RequirementAnalysisResponse)
async def analyse_requirements(
    payload: RequirementAnalysisRequest, request: Request
) -> RequirementAnalysisResponse:
    provider = request.app.state.provider

    try:
        return await provider.analyse(payload)
    except ProviderError as error:
        logger.warning("Requirement analysis failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error
