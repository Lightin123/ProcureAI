import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.embeddings.base import EmbeddingError
from app.schemas import EmbeddingRequest, EmbeddingResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/v1", tags=["embeddings"])


@router.post("/embeddings", response_model=EmbeddingResponse)
async def embeddings(payload: EmbeddingRequest, request: Request) -> EmbeddingResponse:
    provider = request.app.state.embedding_provider

    try:
        vectors = await provider.embed(payload.texts)
    except EmbeddingError as error:
        logger.warning("Embedding generation failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error

    return EmbeddingResponse(
        embeddings=vectors,
        model=provider.model_name,
        provider=provider.name,
        dimensions=provider.dimensions,
    )
