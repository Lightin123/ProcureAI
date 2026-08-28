from typing import Protocol

from app.schemas import (
    CapabilityInsightsRequest,
    CapabilityInsightsResponse,
    RequirementAnalysisRequest,
    RequirementAnalysisResponse,
    WorkPackageDecompositionRequest,
    WorkPackageDecompositionResponse,
)


class RequirementAnalysisProvider(Protocol):
    name: str

    @property
    def model_name(self) -> str | None: ...

    async def analyse(
        self, request: RequirementAnalysisRequest
    ) -> RequirementAnalysisResponse: ...

    async def decompose_work_packages(
        self, request: WorkPackageDecompositionRequest
    ) -> WorkPackageDecompositionResponse: ...

    async def capability_insights(
        self, request: CapabilityInsightsRequest
    ) -> CapabilityInsightsResponse: ...


class ProviderError(RuntimeError):
    """Raised when a provider cannot produce a valid analysis."""
