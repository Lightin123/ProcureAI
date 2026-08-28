import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.providers.base import ProviderError
from app.schemas import CapabilityInsightsRequest, CapabilityInsightsResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/v1", tags=["vendor-capability"])


@router.post("/vendor-capability-insights", response_model=CapabilityInsightsResponse)
async def capability_insights(
    payload: CapabilityInsightsRequest, request: Request
) -> CapabilityInsightsResponse:
    provider = request.app.state.provider

    try:
        return await provider.capability_insights(payload)
    except ProviderError as error:
        logger.warning("Capability insight generation failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error
