import logging

from fastapi import APIRouter, HTTPException, Request

from app.providers.base import ProviderError
from app.schemas import (
    WorkPackageDecompositionRequest,
    WorkPackageDecompositionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/v1/work-package-decomposition", tags=["work-packages"])


@router.post("", response_model=WorkPackageDecompositionResponse)
async def decompose_work_packages(
    request: WorkPackageDecompositionRequest,
    http_request: Request,
) -> WorkPackageDecompositionResponse:
    provider = http_request.app.state.provider
    try:
        return await provider.decompose_work_packages(request)
    except ProviderError as error:
        logger.warning("Work package decomposition failed: %s", error)
        raise HTTPException(status_code=502, detail=str(error)) from error
