import logging

import anthropic
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.prompts.requirement_analysis import (
    PROMPT_VERSION,
    SYSTEM_PROMPT,
    build_user_prompt,
)
from app.providers.base import ProviderError
from app.schemas import (
    RequirementAnalysisRequest,
    RequirementAnalysisResponse,
    SuggestedClarification,
    SuggestedRequirement,
)

logger = logging.getLogger(__name__)


class AnalysisPayload(BaseModel):
    """Schema the model is constrained to produce."""

    requirements: list[SuggestedRequirement]
    clarification_questions: list[SuggestedClarification]


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, settings: Settings) -> None:
        if not settings.anthropic_api_key:
            raise ProviderError("ANTHROPIC_API_KEY is required for the Anthropic provider.")

        self._settings = settings
        self._client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.request_timeout_seconds,
        )

    @property
    def model_name(self) -> str | None:
        return self._settings.anthropic_model

    async def analyse(
        self, request: RequirementAnalysisRequest
    ) -> RequirementAnalysisResponse:
        user_prompt = build_user_prompt(
            project_title=request.project_title,
            problem_description=request.problem_description,
            existing_requirements=[
                f"[{item.kind.value}/{item.category.value}] {item.text}"
                for item in request.existing_requirements
            ],
            answered_clarifications=[
                (item.question, item.answer) for item in request.answered_clarifications
            ],
        )

        try:
            response = await self._client.beta.messages.parse(
                model=self._settings.anthropic_model,
                max_tokens=self._settings.anthropic_max_tokens,
                system=SYSTEM_PROMPT,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": user_prompt}],
                output_format=AnalysisPayload,
            )
        except anthropic.APIStatusError as error:
            raise ProviderError(
                f"Anthropic API returned {error.status_code} ({error.type})."
            ) from error
        except anthropic.APIConnectionError as error:
            raise ProviderError("Could not reach the Anthropic API.") from error

        if response.stop_reason == "refusal":
            raise ProviderError("The model declined to analyse this problem description.")

        payload = response.parsed_output
        if payload is None:
            raise ProviderError("The model did not return a parseable analysis.")

        try:
            validated = AnalysisPayload.model_validate(payload)
        except ValidationError as error:
            raise ProviderError(f"Model output failed validation: {error}") from error

        return RequirementAnalysisResponse(
            requirements=validated.requirements,
            clarification_questions=validated.clarification_questions,
            model=self._settings.anthropic_model,
            prompt_version=PROMPT_VERSION,
        )
