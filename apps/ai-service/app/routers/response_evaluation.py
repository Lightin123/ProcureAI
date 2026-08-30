import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.providers.base import ProviderError
from app.schemas import ResponseEvaluationRequest, ResponseEvaluationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/v1", tags=["response-evaluation"])


@router.post("/response-evaluation-insights", response_model=ResponseEvaluationResponse)
async def response_evaluation_insights(
    payload: ResponseEvaluationRequest, request: Request
) -> ResponseEvaluationResponse:
    """Advisory reading of one submitted vendor response.

    Produces a summary, evidence, strengths, weaknesses and the points a human
    should look at closely. It produces no score, no rank and no
    recommendation, and the caller has nowhere to put one: the deterministic
    evaluation in `apps/api/src/evaluation/` is computed from the supplier's own
    stated figures and never reads this output.
    """
    provider = request.app.state.provider

    try:
        return await provider.response_insights(payload)
    except ProviderError as error:
        logger.warning("Response analysis failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error
