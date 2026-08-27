import logging

import openai
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
    requirements: list[SuggestedRequirement]
    clarification_questions: list[SuggestedClarification]


# Kept deliberately compact rather than embedding the full JSON Schema: on a free
# tier with a low tokens-per-minute cap, a verbose schema dump consumes a large
# share of the per-request budget for no accuracy gain.
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


def _schema_instruction() -> str:
    return SCHEMA_INSTRUCTION


class OpenAICompatibleProvider:
    """Provider for any OpenAI-compatible chat-completions endpoint.

    Works with Groq, xAI (Grok), OpenRouter, Together, a local Ollama, and
    similar services. The endpoint is chosen entirely through configuration
    (`AI_BASE_URL`, `AI_MODEL`), so adding a new service needs no code change.

    These endpoints vary in how strictly they honour JSON schemas, so output is
    requested in JSON mode, validated with Pydantic, and retried a bounded
    number of times. Output that never validates is rejected rather than
    passed on, per NFR2.
    """

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

        messages = [
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\n{_schema_instruction()}"},
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
                    "The AI provider's rate limit was reached. Free tiers cap requests "
                    "per minute and per day; wait a moment and run the analysis again."
                ) from error
            except openai.AuthenticationError as error:
                raise ProviderError(
                    "The AI provider rejected the configured API key. Check AI_API_KEY "
                    "in apps/ai-service/.env."
                ) from error
            except openai.NotFoundError as error:
                raise ProviderError(
                    f"Model '{self._settings.ai_model}' is not available to this key. "
                    f"List reachable models with GET {self._settings.ai_base_url}/models "
                    "and set AI_MODEL accordingly."
                ) from error
            except openai.APIStatusError as error:
                if error.status_code == 413:
                    raise ProviderError(
                        "The request exceeded the provider's per-minute token budget. "
                        "Lower AI_MAX_TOKENS in apps/ai-service/.env, or wait a minute "
                        "and try again."
                    ) from error
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
                prompt_version=PROMPT_VERSION,
            )

        raise ProviderError(
            f"The model did not return valid analysis after "
            f"{self._settings.ai_max_attempts} attempt(s): {last_error}."
        )
