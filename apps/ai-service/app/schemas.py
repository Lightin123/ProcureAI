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


# --- Response Evaluation Insight Schemas ---
#
# Advisory only. Nothing in this response carries a score, a rank, a weight or a
# recommendation, and the API has no column to put one in: the deterministic
# evaluation is computed in `apps/api/src/evaluation/` from the supplier's own
# stated figures and never reads anything produced here.

class ResponseSectionText(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=20_000)


class ResponseRequirementAnswer(BaseModel):
    requirement: str = Field(min_length=1, max_length=2_000)
    position: str = Field(default="not stated", max_length=60)
    answer: str | None = Field(default=None, max_length=8_000)


class ResponseQuestionAnswer(BaseModel):
    prompt: str = Field(min_length=1, max_length=1_000)
    answer: str = Field(default="", max_length=4_000)


class ResponseRequirementSummary(BaseModel):
    category: str = Field(default="OTHER", max_length=60)
    text: str = Field(min_length=1, max_length=2_000)


class ResponseEvaluationRequest(BaseModel):
    package_number: str = Field(min_length=1, max_length=60)
    package_title: str = Field(min_length=1, max_length=300)
    package_scope: str = Field(default="", max_length=20_000)
    requirements: list[ResponseRequirementSummary] = Field(default_factory=list)
    response_type: str = Field(min_length=1, max_length=60)
    supplier_name: str = Field(min_length=1, max_length=300)
    sections: list[ResponseSectionText] = Field(default_factory=list)
    requirement_answers: list[ResponseRequirementAnswer] = Field(default_factory=list)
    question_answers: list[ResponseQuestionAnswer] = Field(default_factory=list)
    document_titles: list[str] = Field(default_factory=list)


class EvaluationInsight(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    detail: str = Field(min_length=1, max_length=1_500)


class EvaluationEvidence(BaseModel):
    """Where an observation came from, so an official can check it rather than take it."""

    section: str = Field(min_length=1, max_length=200)
    quote: str = Field(min_length=1, max_length=400)


class ResponseEvaluationResponse(BaseModel):
    summary: str = Field(min_length=1, max_length=4_000)
    technical_fit: str = Field(default="", max_length=4_000)
    experience_relevance: str = Field(default="", max_length=4_000)
    strengths: list[EvaluationInsight] = Field(default_factory=list)
    weaknesses: list[EvaluationInsight] = Field(default_factory=list)
    attention_points: list[EvaluationInsight] = Field(default_factory=list)
    evidence: list[EvaluationEvidence] = Field(default_factory=list)
    model: str
    provider: str
    prompt_version: str
    response_time_ms: int = 0


# --- Embedding Schemas ---

class EmbeddingRequest(BaseModel):
    # Batched rather than one call per text: re-embedding the supplier registry
    # is a routine operation and a request per profile would make it a slow one.
    texts: list[str] = Field(min_length=1, max_length=64)


class EmbeddingResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    provider: str
    dimensions: int


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["procureai-ai-service"]
    provider: str
    model: str | None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    embedding_dimensions: int | None = None
