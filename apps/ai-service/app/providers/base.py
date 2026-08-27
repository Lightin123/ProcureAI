from typing import Protocol

from app.schemas import RequirementAnalysisRequest, RequirementAnalysisResponse


class RequirementAnalysisProvider(Protocol):
    name: str

    @property
    def model_name(self) -> str | None: ...

    async def analyse(
        self, request: RequirementAnalysisRequest
    ) -> RequirementAnalysisResponse: ...


class ProviderError(RuntimeError):
    """Raised when a provider cannot produce a valid analysis."""
