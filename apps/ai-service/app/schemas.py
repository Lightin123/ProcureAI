from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class RequirementKind(str, Enum):
    REQUIREMENT = "REQUIREMENT"
    CONSTRAINT = "CONSTRAINT"


class RequirementCategory(str, Enum):
    FUNCTIONAL = "FUNCTIONAL"
    NON_FUNCTIONAL = "NON_FUNCTIONAL"
    BUDGET = "BUDGET"
    TIMELINE = "TIMELINE"
    COMPLIANCE = "COMPLIANCE"
    OTHER = "OTHER"


class ExistingRequirement(BaseModel):
    kind: RequirementKind
    category: RequirementCategory
    text: str
    status: str


class AnsweredClarification(BaseModel):
    question: str
    answer: str


class RequirementAnalysisRequest(BaseModel):
    project_title: str = Field(min_length=1, max_length=200)
    problem_description: str = Field(min_length=1, max_length=20_000)
    existing_requirements: list[ExistingRequirement] = Field(default_factory=list)
    answered_clarifications: list[AnsweredClarification] = Field(default_factory=list)


class SuggestedRequirement(BaseModel):
    kind: RequirementKind
    category: RequirementCategory
    text: str = Field(min_length=1, max_length=2_000)
    rationale: str = Field(min_length=1, max_length=2_000)


class SuggestedClarification(BaseModel):
    question: str = Field(min_length=1, max_length=1_000)
    rationale: str = Field(min_length=1, max_length=2_000)


class RequirementAnalysisResponse(BaseModel):
    requirements: list[SuggestedRequirement]
    clarification_questions: list[SuggestedClarification]
    model: str
    prompt_version: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["procureai-ai-service"]
    provider: str
    model: str | None
