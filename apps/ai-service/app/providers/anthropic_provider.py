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
from app.prompts.response_evaluation import (
    PROMPT_VERSION as RESPONSE_PROMPT_VERSION,
    SYSTEM_PROMPT as RESPONSE_SYSTEM_PROMPT,
    build_user_prompt as build_response_prompt,
)
from app.prompts.vendor_capability import (
    PROMPT_VERSION as CAPABILITY_PROMPT_VERSION,
    SYSTEM_PROMPT as CAPABILITY_SYSTEM_PROMPT,
    build_user_prompt as build_capability_prompt,
)
from app.providers.base import ProviderError
from app.schemas import (
    CapabilityInsight,
    CapabilityInsightsRequest,
    CapabilityInsightsResponse,
    EvaluationEvidence,
    EvaluationInsight,
    ResponseEvaluationRequest,
    ResponseEvaluationResponse,
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


class CapabilityPayload(BaseModel):
    """Schema the model is constrained to produce for a capability assessment."""

    positioning_summary: str
    strengths: list[CapabilityInsight]
    gaps: list[CapabilityInsight]
    suggested_opportunity_areas: list[str]


class ResponseInsightPayload(BaseModel):
    """Schema the model is constrained to produce for a response reading.

    There is deliberately no score, rank, weight or recommendation field. The
    model cannot return one because the shape it is constrained to has nowhere
    to put it.
    """

    summary: str
    technical_fit: str = ""
    experience_relevance: str = ""
    strengths: list[EvaluationInsight] = []
    weaknesses: list[EvaluationInsight] = []
    attention_points: list[EvaluationInsight] = []
    evidence: list[EvaluationEvidence] = []


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

    async def capability_insights(
        self, request: CapabilityInsightsRequest
    ) -> CapabilityInsightsResponse:
        user_prompt = build_capability_prompt(
            organization_name=request.organization_name,
            capability_document=request.capability_document,
            industries=request.industries,
            solution_types=request.solution_types,
            completion_percentage=request.completion_percentage,
            open_opportunity_titles=request.open_opportunity_titles,
        )

        try:
            response = await self._client.beta.messages.parse(
                model=self._settings.anthropic_model,
                max_tokens=self._settings.anthropic_max_tokens,
                system=CAPABILITY_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
                output_format=CapabilityPayload,
            )
        except anthropic.APIStatusError as error:
            raise ProviderError(
                f"Anthropic API returned {error.status_code} ({error.type})."
            ) from error
        except anthropic.APIConnectionError as error:
            raise ProviderError("Could not reach the Anthropic API.") from error

        if response.stop_reason == "refusal":
            raise ProviderError("The model declined to assess this capability profile.")

        payload = response.parsed_output
        if payload is None:
            raise ProviderError("The model did not return a parseable assessment.")

        try:
            validated = CapabilityPayload.model_validate(payload)
        except ValidationError as error:
            raise ProviderError(f"Model output failed validation: {error}") from error

        return CapabilityInsightsResponse(
            positioning_summary=validated.positioning_summary,
            strengths=validated.strengths,
            gaps=validated.gaps,
            suggested_opportunity_areas=validated.suggested_opportunity_areas,
            model=self._settings.anthropic_model,
            prompt_version=CAPABILITY_PROMPT_VERSION,
        )

    async def response_insights(
        self, request: ResponseEvaluationRequest
    ) -> ResponseEvaluationResponse:
        start_time = time.time()

        user_prompt = build_response_prompt(
            package_number=request.package_number,
            package_title=request.package_title,
            package_scope=request.package_scope,
            requirements=[item.model_dump() for item in request.requirements],
            response_type=request.response_type,
            supplier_name=request.supplier_name,
            sections=[item.model_dump() for item in request.sections],
            requirement_answers=[item.model_dump() for item in request.requirement_answers],
            question_answers=[item.model_dump() for item in request.question_answers],
            document_titles=request.document_titles,
        )

        try:
            response = await self._client.beta.messages.parse(
                model=self._settings.anthropic_model,
                max_tokens=self._settings.anthropic_max_tokens,
                system=RESPONSE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
                output_format=ResponseInsightPayload,
            )
        except anthropic.APIStatusError as error:
            raise ProviderError(
                f"Anthropic API returned {error.status_code} ({error.type})."
            ) from error
        except anthropic.APIConnectionError as error:
            raise ProviderError("Could not reach the Anthropic API.") from error

        if response.stop_reason == "refusal":
            raise ProviderError("The model declined to read this response.")

        payload = response.parsed_output
        if payload is None:
            raise ProviderError("The model did not return a parseable reading.")

        try:
            validated = ResponseInsightPayload.model_validate(payload)
        except ValidationError as error:
            raise ProviderError(f"Model output failed validation: {error}") from error

        return ResponseEvaluationResponse(
            summary=validated.summary,
            technical_fit=validated.technical_fit,
            experience_relevance=validated.experience_relevance,
            strengths=validated.strengths,
            weaknesses=validated.weaknesses,
            attention_points=validated.attention_points,
            evidence=validated.evidence,
            model=self._settings.anthropic_model,
            provider=self.name,
            prompt_version=RESPONSE_PROMPT_VERSION,
            response_time_ms=int((time.time() - start_time) * 1000),
        )
