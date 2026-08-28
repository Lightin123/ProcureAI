from enum import Enum
from typing import Any, Literal

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


class WorkPackageComplexity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    VERY_HIGH = "VERY_HIGH"


class WorkPackagePriority(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


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


# --- Work Package Decomposition Schemas ---

class ConfirmedRequirementItem(BaseModel):
    id: str
    kind: RequirementKind
    category: RequirementCategory
    text: str
    rationale: str | None = None


class WorkPackageDecompositionRequest(BaseModel):
    project_title: str = Field(min_length=1, max_length=200)
    problem_description: str = Field(min_length=1, max_length=20_000)
    organization_name: str | None = None
    confirmed_requirements: list[ConfirmedRequirementItem] = Field(default_factory=list)


class SuggestedWorkPackage(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5_000)
    scope: str = Field(min_length=1, max_length=5_000)
    included_requirement_ids: list[str] = Field(default_factory=list)
    deliverables: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    complexity: WorkPackageComplexity = WorkPackageComplexity.MEDIUM
    priority: WorkPackagePriority = WorkPackagePriority.MEDIUM
    estimated_procurement_category: str = Field(default="General Procurement")
    ai_reasoning: str = Field(min_length=1, max_length=3_000)
    confidence_score: float = Field(default=0.85, ge=0.0, le=1.0)


class WorkPackageDecompositionResponse(BaseModel):
    work_packages: list[SuggestedWorkPackage]
    model: str
    provider: str
    prompt_version: str
    prompt_hash: str
    raw_prompt: str
    raw_response: str
    token_usage: dict[str, Any] = Field(default_factory=dict)
    completion_id: str | None = None
    response_time_ms: int = 0
    overall_confidence: float = 0.85


# --- Vendor Capability Insight Schemas ---

class CapabilityInsightsRequest(BaseModel):
    organization_name: str = Field(min_length=1, max_length=300)
    capability_document: str = Field(min_length=1, max_length=30_000)
    industries: list[str] = Field(default_factory=list)
    solution_types: list[str] = Field(default_factory=list)
    completion_percentage: int = Field(ge=0, le=100)
    open_opportunity_titles: list[str] = Field(default_factory=list)


class CapabilityInsight(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    detail: str = Field(min_length=1, max_length=1_500)


class CapabilityInsightsResponse(BaseModel):
    positioning_summary: str = Field(min_length=1, max_length=3_000)
    strengths: list[CapabilityInsight]
    gaps: list[CapabilityInsight]
    suggested_opportunity_areas: list[str]
    model: str
    prompt_version: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["procureai-ai-service"]
    provider: str
    model: str | None
