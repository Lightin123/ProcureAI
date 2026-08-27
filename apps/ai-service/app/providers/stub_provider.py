import re

from app.prompts.requirement_analysis import PROMPT_VERSION
from app.schemas import (
    RequirementAnalysisRequest,
    RequirementAnalysisResponse,
    RequirementCategory,
    RequirementKind,
    SuggestedClarification,
    SuggestedRequirement,
)

BUDGET_PATTERN = re.compile(r"(budget|crore|lakh|\u20b9|rs\.?\s*\d)", re.IGNORECASE)
TIMELINE_PATTERN = re.compile(r"(month|week|year|deadline|timeline|by\s+\d{4})", re.IGNORECASE)
COMPLIANCE_PATTERN = re.compile(
    r"(complian|regulat|standard|certif|audit|policy|gdpr|iso)", re.IGNORECASE
)


class StubProvider:
    """Deterministic provider used when no Anthropic API key is configured.

    It performs simple keyword detection so the full review workflow can be
    exercised end to end without credentials. It is not an analysis engine and
    its output is intentionally conservative.
    """

    name = "stub"

    @property
    def model_name(self) -> str | None:
        return None

    async def analyse(
        self, request: RequirementAnalysisRequest
    ) -> RequirementAnalysisResponse:
        description = request.problem_description
        already = {item.text.strip().lower() for item in request.existing_requirements}
        answered = {item.question.strip().lower() for item in request.answered_clarifications}

        requirements: list[SuggestedRequirement] = []

        def add(kind: RequirementKind, category: RequirementCategory, text: str, rationale: str) -> None:
            if text.strip().lower() not in already:
                requirements.append(
                    SuggestedRequirement(
                        kind=kind, category=category, text=text, rationale=rationale
                    )
                )

        add(
            RequirementKind.REQUIREMENT,
            RequirementCategory.FUNCTIONAL,
            f"Deliver a solution addressing: {_first_sentence(description)}",
            "Derived from the opening statement of the problem description.",
        )

        if BUDGET_PATTERN.search(description):
            add(
                RequirementKind.CONSTRAINT,
                RequirementCategory.BUDGET,
                "The solution must remain within the budget stated in the problem description.",
                "The description mentions a budget figure or monetary limit.",
            )

        if TIMELINE_PATTERN.search(description):
            add(
                RequirementKind.CONSTRAINT,
                RequirementCategory.TIMELINE,
                "The solution must be delivered within the timeline stated in the problem description.",
                "The description mentions a delivery period or deadline.",
            )

        if COMPLIANCE_PATTERN.search(description):
            add(
                RequirementKind.CONSTRAINT,
                RequirementCategory.COMPLIANCE,
                "The solution must satisfy the compliance obligations referenced in the problem description.",
                "The description references compliance, regulatory, or certification obligations.",
            )

        candidate_questions = [
            (
                "What is the approved budget range for this procurement?",
                "A budget range is required to assess financial fit of candidate solutions.",
                not BUDGET_PATTERN.search(description),
            ),
            (
                "What is the required delivery timeline or completion date?",
                "Timeline feasibility cannot be evaluated without a target date.",
                not TIMELINE_PATTERN.search(description),
            ),
            (
                "Are there mandatory compliance, certification, or security standards?",
                "Mandatory standards determine vendor eligibility.",
                not COMPLIANCE_PATTERN.search(description),
            ),
            (
                "Who are the intended users and what is the expected scale of use?",
                "Scale and user profile materially affect the suitable solution type.",
                True,
            ),
        ]

        clarifications = [
            SuggestedClarification(question=question, rationale=rationale)
            for question, rationale, include in candidate_questions
            if include and question.strip().lower() not in answered
        ]

        return RequirementAnalysisResponse(
            requirements=requirements,
            clarification_questions=clarifications,
            model="stub-deterministic-v1",
            prompt_version=PROMPT_VERSION,
        )


def _first_sentence(text: str) -> str:
    cleaned = " ".join(text.split())
    match = re.search(r"^(.{0,240}?)(?:\.|$)", cleaned)
    sentence = match.group(1).strip() if match else cleaned[:240]
    return sentence or cleaned[:240]
