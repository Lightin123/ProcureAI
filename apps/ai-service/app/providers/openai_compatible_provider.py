import logging
import time

import openai
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.prompts.requirement_analysis import (
    PROMPT_VERSION as REQ_PROMPT_VERSION,
    SYSTEM_PROMPT as REQ_SYSTEM_PROMPT,
    build_user_prompt as build_req_user_prompt,
)
from app.prompts.work_package_decomposition import (
    PROMPT_VERSION as WP_PROMPT_VERSION,
    SCHEMA_INSTRUCTION as WP_SCHEMA_INSTRUCTION,
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
    requirements: list[SuggestedRequirement]
    clarification_questions: list[SuggestedClarification]


class WorkPackagePayload(BaseModel):
    work_packages: list[SuggestedWorkPackage]


SCHEMA_INSTRUCTION = (
    "Respond with a single JSON object and nothing else - no code fences, no "
    "commentary. Shape:\n"
    '{"requirements":[{"kind":..,"category":..,"text":..,"rationale":..}],'
    '"clarification_questions":[{"question":..,"rationale":..}]}\n'
    "kind is REQUIREMENT or CONSTRAINT. category is one of FUNCTIONAL, "
    "NON_FUNCTIONAL, BUDGET, TIMELINE, COMPLIANCE, OTHER. All four requirement "
    "fields and both question fields are required strings. Both top-level keys "
    "must be present; use [] when there is nothing to report."
)


class OpenAICompatibleProvider:
    """Provider for any OpenAI-compatible chat-completions endpoint."""

    name = "openai_compatible"

    def __init__(self, settings: Settings) -> None:
        if not settings.ai_api_key:
            raise ProviderError(
                "AI_API_KEY is required for the OpenAI-compatible provider."
            )

        self._settings = settings
        self._client = openai.AsyncOpenAI(
            api_key=settings.ai_api_key,
            base_url=settings.ai_base_url,
            timeout=settings.request_timeout_seconds,
        )

    @property
    def model_name(self) -> str | None:
        return self._settings.ai_model

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

        messages = [
            {"role": "system", "content": f"{REQ_SYSTEM_PROMPT}\n\n{SCHEMA_INSTRUCTION}"},
            {"role": "user", "content": user_prompt},
        ]

        last_error: str | None = None

        for attempt in range(1, self._settings.ai_max_attempts + 1):
            try:
                completion = await self._client.chat.completions.create(
                    model=self._settings.ai_model,
                    max_tokens=self._settings.ai_max_tokens,
                    messages=messages,  # type: ignore[arg-type]
                    response_format={"type": "json_object"},
                )
            except openai.RateLimitError as error:
                raise ProviderError(
                    "The AI provider's rate limit was reached. Wait a moment and run the analysis again."
                ) from error
            except openai.AuthenticationError as error:
                raise ProviderError(
                    "The AI provider rejected the configured API key."
                ) from error
            except openai.NotFoundError as error:
                raise ProviderError(
                    f"Model '{self._settings.ai_model}' is not available."
                ) from error
            except openai.APIStatusError as error:
                raise ProviderError(
                    f"{self._settings.ai_base_url} returned HTTP {error.status_code}."
                ) from error
            except openai.APIConnectionError as error:
                raise ProviderError(
                    f"Could not reach {self._settings.ai_base_url}."
                ) from error

            choice = completion.choices[0] if completion.choices else None
            content = choice.message.content if choice and choice.message else None

            if not content:
                last_error = "the model returned an empty response"
                continue

            try:
                validated = AnalysisPayload.model_validate_json(content)
            except ValidationError as error:
                last_error = f"output failed schema validation ({error.error_count()} issue(s))"
                logger.warning("Attempt %s/%s: %s", attempt, self._settings.ai_max_attempts, last_error)
                continue

            return RequirementAnalysisResponse(
                requirements=validated.requirements,
                clarification_questions=validated.clarification_questions,
                model=self._settings.ai_model,
                prompt_version=REQ_PROMPT_VERSION,
            )

        raise ProviderError(
            f"The model did not return valid analysis after "
            f"{self._settings.ai_max_attempts} attempt(s): {last_error}."
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

        messages = [
            {"role": "system", "content": f"{WP_SYSTEM_PROMPT}\n\n{WP_SCHEMA_INSTRUCTION}"},
            {"role": "user", "content": user_prompt},
        ]

        last_error: str | None = None
        last_raw_response: str = ""
        completion_id: str | None = None
        token_usage: dict = {}

        for attempt in range(1, self._settings.ai_max_attempts + 1):
            try:
                completion = await self._client.chat.completions.create(
                    model=self._settings.ai_model,
                    max_tokens=self._settings.ai_max_tokens,
                    temperature=0.2,
                    messages=messages,  # type: ignore[arg-type]
                    response_format={"type": "json_object"},
                )
            except openai.RateLimitError as error:
                raise ProviderError(
                    "The AI provider's rate limit was reached. Free tiers cap requests per minute; wait a moment and try again."
                ) from error
            except openai.AuthenticationError as error:
                raise ProviderError(
                    "The AI provider rejected the configured API key."
                ) from error
            except openai.APIStatusError as error:
                raise ProviderError(
                    f"{self._settings.ai_base_url} returned HTTP {error.status_code}."
                ) from error
            except openai.APIConnectionError as error:
                raise ProviderError(
                    f"Could not reach {self._settings.ai_base_url}."
                ) from error

            completion_id = completion.id if hasattr(completion, "id") else None
            if hasattr(completion, "usage") and completion.usage:
                token_usage = {
                    "prompt_tokens": completion.usage.prompt_tokens,
                    "completion_tokens": completion.usage.completion_tokens,
                    "total_tokens": completion.usage.total_tokens,
                }

            choice = completion.choices[0] if completion.choices else None
            content = choice.message.content if choice and choice.message else None
            last_raw_response = content or ""

            if not content:
                last_error = "the model returned an empty response"
                continue

            try:
                validated = WorkPackagePayload.model_validate_json(content)
            except ValidationError as error:
                last_error = f"work package output failed schema validation ({error.error_count()} issue(s))"
                logger.warning("WP Attempt %s/%s: %s", attempt, self._settings.ai_max_attempts, last_error)
                continue

            if not validated.work_packages:
                last_error = "model returned zero work packages"
                continue

            response_time_ms = int((time.time() - start_time) * 1000)
            confidences = [wp.confidence_score for wp in validated.work_packages]
            overall_confidence = (
                sum(confidences) / len(confidences) if confidences else 0.88
            )

            return WorkPackageDecompositionResponse(
                work_packages=validated.work_packages,
                model=self._settings.ai_model,
                provider=self.name,
                prompt_version=WP_PROMPT_VERSION,
                prompt_hash=prompt_hash,
                raw_prompt=user_prompt,
                raw_response=last_raw_response,
                token_usage=token_usage,
                completion_id=completion_id,
                response_time_ms=response_time_ms,
                overall_confidence=round(overall_confidence, 3),
            )

        raise ProviderError(
            f"The model did not return valid work packages after {self._settings.ai_max_attempts} attempt(s): {last_error}."
        )
