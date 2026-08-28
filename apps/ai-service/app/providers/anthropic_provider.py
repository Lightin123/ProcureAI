import json
import logging
import time

import anthropic
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.prompts.requirement_analysis import (
    PROMPT_VERSION as REQ_PROMPT_VERSION,
    SYSTEM_PROMPT as REQ_SYSTEM_PROMPT,
    build_user_prompt as build_req_user_prompt,
)
from app.prompts.work_package_decomposition import (
    PROMPT_VERSION as WP_PROMPT_VERSION,
    SYSTEM_PROMPT as WP_SYSTEM_PROMPT,
    build_work_package_prompt,
)
from app.providers.base import ProviderError
from app.schemas import (
    RequirementAnalysisRequest,
    RequirementAnalysisResponse,
    SuggestedClarification,
    SuggestedRequirement,
    SuggestedWorkPackage,
    WorkPackageDecompositionRequest,
    WorkPackageDecompositionResponse,
)

logger = logging.getLogger(__name__)


class AnalysisPayload(BaseModel):
    """Schema the model is constrained to produce."""

    requirements: list[SuggestedRequirement]
    clarification_questions: list[SuggestedClarification]


class WorkPackagePayload(BaseModel):
    work_packages: list[SuggestedWorkPackage]


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
        user_prompt = build_req_user_prompt(
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
                system=REQ_SYSTEM_PROMPT,
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
            prompt_version=REQ_PROMPT_VERSION,
        )

    async def decompose_work_packages(
        self, request: WorkPackageDecompositionRequest
    ) -> WorkPackageDecompositionResponse:
        start_time = time.time()
        user_prompt, prompt_hash = build_work_package_prompt(
            project_title=request.project_title,
            problem_description=request.problem_description,
            organization_name=request.organization_name,
            confirmed_requirements=[r.model_dump() for r in request.confirmed_requirements],
        )

        try:
            response = await self._client.beta.messages.parse(
                model=self._settings.anthropic_model,
                max_tokens=self._settings.anthropic_max_tokens,
                system=WP_SYSTEM_PROMPT,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": user_prompt}],
                output_format=WorkPackagePayload,
            )
        except anthropic.APIStatusError as error:
            raise ProviderError(
                f"Anthropic API returned {error.status_code} ({error.type})."
            ) from error
        except anthropic.APIConnectionError as error:
            raise ProviderError("Could not reach the Anthropic API.") from error

        if response.stop_reason == "refusal":
            raise ProviderError("The model declined to decompose this project.")

        payload = response.parsed_output
        if payload is None:
            raise ProviderError("The model did not return parseable work packages.")

        try:
            validated = WorkPackagePayload.model_validate(payload)
        except ValidationError as error:
            raise ProviderError(f"Model output failed validation: {error}") from error

        response_time_ms = int((time.time() - start_time) * 1000)
        confidences = [wp.confidence_score for wp in validated.work_packages]
        overall_confidence = (
            sum(confidences) / len(confidences) if confidences else 0.88
        )

        token_usage = {
            "input_tokens": response.usage.input_tokens if hasattr(response, "usage") else 0,
            "output_tokens": response.usage.output_tokens if hasattr(response, "usage") else 0,
        }

        return WorkPackageDecompositionResponse(
            work_packages=validated.work_packages,
            model=self._settings.anthropic_model,
            provider=self.name,
            prompt_version=WP_PROMPT_VERSION,
            prompt_hash=prompt_hash,
            raw_prompt=user_prompt,
            raw_response=json.dumps({"work_packages": [wp.model_dump() for wp in validated.work_packages]}),
            token_usage=token_usage,
            completion_id=response.id if hasattr(response, "id") else None,
            response_time_ms=response_time_ms,
            overall_confidence=round(overall_confidence, 3),
        )
