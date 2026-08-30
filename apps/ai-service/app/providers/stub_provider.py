import json
import re
import time

from app.prompts.requirement_analysis import PROMPT_VERSION as REQ_PROMPT_VERSION
from app.prompts.response_evaluation import PROMPT_VERSION as RESPONSE_PROMPT_VERSION
from app.prompts.vendor_capability import PROMPT_VERSION as CAPABILITY_PROMPT_VERSION
from app.prompts.work_package_decomposition import (
    PROMPT_VERSION as WP_PROMPT_VERSION,
    build_work_package_prompt,
)
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
    RequirementCategory,
    RequirementKind,
    SuggestedClarification,
    SuggestedRequirement,
    SuggestedWorkPackage,
    WorkPackageComplexity,
    WorkPackageDecompositionRequest,
    WorkPackageDecompositionResponse,
    WorkPackagePriority,
)

BUDGET_PATTERN = re.compile(r"(budget|crore|lakh|\u20b9|rs\.?\s*\d)", re.IGNORECASE)
TIMELINE_PATTERN = re.compile(r"(month|week|year|deadline|timeline|by\s+\d{4})", re.IGNORECASE)
COMPLIANCE_PATTERN = re.compile(
    r"(complian|regulat|standard|certif|audit|policy|gdpr|iso)", re.IGNORECASE
)


class StubProvider:
    """Deterministic provider used when no API key is configured or in fallback mode."""

    name = "stub"

    @property
    def model_name(self) -> str | None:
        return "stub-deterministic-v1"

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
            prompt_version=REQ_PROMPT_VERSION,
        )

    async def decompose_work_packages(
        self, request: WorkPackageDecompositionRequest
    ) -> WorkPackageDecompositionResponse:
        start_time = time.time()
        reqs = request.confirmed_requirements
        req_ids = [r.id for r in reqs]

        # Group requirements logically
        functional_req_ids = [r.id for r in reqs if r.category == RequirementCategory.FUNCTIONAL]
        infra_req_ids = [
            r.id
            for r in reqs
            if r.category in (RequirementCategory.NON_FUNCTIONAL, RequirementCategory.TIMELINE)
        ]
        compliance_req_ids = [
            r.id
            for r in reqs
            if r.category in (RequirementCategory.COMPLIANCE, RequirementCategory.BUDGET, RequirementCategory.OTHER)
        ]

        if not functional_req_ids and req_ids:
            functional_req_ids = req_ids[: max(1, len(req_ids) // 2)]
            infra_req_ids = req_ids[max(1, len(req_ids) // 2) :]

        packages: list[SuggestedWorkPackage] = [
            SuggestedWorkPackage(
                title="Core Application Platform & Business Logic",
                description=f"Design, implementation, and deployment of the primary software capabilities for '{request.project_title}'.",
                scope="Includes core application modules, user interfaces, business workflow logic, API integrations, and administrative dashboards.",
                included_requirement_ids=functional_req_ids or req_ids,
                deliverables=[
                    "System Architecture & Detailed Design Document (SDD)",
                    "Modular Software Source Code and Executable Artifacts",
                    "User Acceptance Testing (UAT) Sign-off Report",
                    "Administrator & End-User Training Manuals",
                ],
                dependencies=["Cloud & Infrastructure Hosting Environment"],
                complexity=WorkPackageComplexity.HIGH,
                priority=WorkPackagePriority.CRITICAL,
                estimated_procurement_category="Software Solution",
                ai_reasoning="Consolidates central functional workflows into a cohesive software delivery package to ensure end-to-end operational readiness.",
                confidence_score=0.92,
            ),
            SuggestedWorkPackage(
                title="Cloud & Infrastructure Hosting Environment",
                description="Provisioning of compute, network, database clusters, security perimeter, and high-availability deployment infrastructure.",
                scope="Includes cloud instance sizing, container runtime orchestration, VPC/subnet firewall configuration, backup automation, and storage setup.",
                included_requirement_ids=infra_req_ids,
                deliverables=[
                    "Infrastructure as Code (IaC) Templates",
                    "Cloud Security Baseline & Network Architecture Diagram",
                    "Disaster Recovery (DR) and Data Backup Runbooks",
                    "Environment Provisioning Certificate",
                ],
                dependencies=[],
                complexity=WorkPackageComplexity.MEDIUM,
                priority=WorkPackagePriority.HIGH,
                estimated_procurement_category="Cloud Services",
                ai_reasoning="Underpins the runtime availability, scalability, and security posture necessary for software operations.",
                confidence_score=0.88,
            ),
            SuggestedWorkPackage(
                title="Security Compliance, Audit & Quality Assurance",
                description="Independent cybersecurity review, CERT-In empaneled security audit, vulnerability assessment, and compliance verification.",
                scope="Includes VAPT (Vulnerability Assessment & Penetration Testing), data protection guideline alignment, regulatory audit sign-offs, and compliance documentation.",
                included_requirement_ids=compliance_req_ids,
                deliverables=[
                    "Third-Party CERT-In Empaneled Security Audit Certificate",
                    "VAPT Remediation & Closure Report",
                    "Data Protection & Compliance Dossier",
                ],
                dependencies=["Core Application Platform & Business Logic"],
                complexity=WorkPackageComplexity.MEDIUM,
                priority=WorkPackagePriority.HIGH,
                estimated_procurement_category="Security & Audit Services",
                ai_reasoning="Guarantees compliance with Government of India cybersecurity mandates and procurement risk frameworks prior to go-live.",
                confidence_score=0.90,
            ),
            SuggestedWorkPackage(
                title="Capacity Building, Training & Operational Maintenance Support",
                description="Comprehensive user onboarding, institutional training sessions, operational handover, and 12-month post-implementation maintenance (AMC).",
                scope="Includes nodal officer training workshops, train-the-trainer manuals, helpdesk setup, and SLA-governed level 1-3 technical support.",
                included_requirement_ids=[],
                deliverables=[
                    "Departmental Training Sessions & Attendance Rosters",
                    "Operations & Maintenance SLA Framework",
                    "Quarterly SLA & Ticket Resolution Reports",
                ],
                dependencies=["Core Application Platform & Business Logic"],
                complexity=WorkPackageComplexity.LOW,
                priority=WorkPackagePriority.MEDIUM,
                estimated_procurement_category="Operations & Maintenance",
                ai_reasoning="Ensures institutional adoption and long-term sustainability across the nodal ministry/department.",
                confidence_score=0.85,
            ),
        ]

        user_prompt, prompt_hash = build_work_package_prompt(
            project_title=request.project_title,
            problem_description=request.problem_description,
            organization_name=request.organization_name,
            confirmed_requirements=[r.model_dump() for r in reqs],
        )

        response_time_ms = int((time.time() - start_time) * 1000)
        raw_response = json.dumps({"work_packages": [p.model_dump() for p in packages]}, indent=2)

        return WorkPackageDecompositionResponse(
            work_packages=packages,
            model="stub-deterministic-v1",
            provider="stub",
            prompt_version=WP_PROMPT_VERSION,
            prompt_hash=prompt_hash,
            raw_prompt=user_prompt,
            raw_response=raw_response,
            token_usage={"prompt_tokens": 520, "completion_tokens": 780, "total_tokens": 1300},
            completion_id="stub-wp-001",
            response_time_ms=response_time_ms,
            overall_confidence=0.90,
        )

    async def capability_insights(
        self, request: CapabilityInsightsRequest
    ) -> CapabilityInsightsResponse:
        """Section-presence heuristics over the capability document.

        It reads which sections the supplier actually filled in and reports on
        that. Deliberately not an assessment engine, but honest: it never
        asserts a strength the profile does not contain, which is the property
        that matters for a decision-support tool running without credentials.
        """
        document = request.capability_document
        sections = {
            "offerings": "PRODUCTS, SERVICES AND CAPABILITIES OFFERED" in document,
            "experience": "EXPERIENCE AND PAST PERFORMANCE" in document,
            "credentials": "CERTIFICATIONS, STANDARDS AND RECOGNITION" in document,
            "capacity": "CAPACITY AND OPERATIONS" in document,
            "innovation": "INNOVATION PROFILE" in document,
            "industry_detail": "INDUSTRY-SPECIFIC CAPABILITY DETAIL" in document,
            "eligibility": "ELIGIBILITY CATEGORIES" in document,
        }

        strengths: list[CapabilityInsight] = []
        gaps: list[CapabilityInsight] = []

        if sections["offerings"]:
            strengths.append(
                CapabilityInsight(
                    title="Offerings are itemised",
                    detail=(
                        "Products and services are recorded individually, so each is "
                        "matched to procurement requirements on its own merits rather "
                        "than only through the organisation summary."
                    ),
                )
            )
        else:
            gaps.append(
                CapabilityInsight(
                    title="No individual products or services recorded",
                    detail=(
                        "Matching currently sees only the capability summary. Record each "
                        "product or service separately so it can be found on its own."
                    ),
                )
            )

        if sections["experience"]:
            strengths.append(
                CapabilityInsight(
                    title="Delivery record is documented",
                    detail=(
                        "Previous work is recorded with clients and outcomes, which is the "
                        "evidence government buyers weigh most heavily at shortlisting."
                    ),
                )
            )
        else:
            gaps.append(
                CapabilityInsight(
                    title="No delivery record",
                    detail=(
                        "No previous projects are recorded. Private-sector and pilot work "
                        "both count; an empty record is the most common reason a capable "
                        "supplier is passed over."
                    ),
                )
            )

        if sections["credentials"]:
            strengths.append(
                CapabilityInsight(
                    title="Formal credentials are on record",
                    detail=(
                        "Certifications and standards are recorded, which is what allows "
                        "the profile to pass mandatory-standard filters."
                    ),
                )
            )
        else:
            gaps.append(
                CapabilityInsight(
                    title="No certifications or standards recorded",
                    detail=(
                        "Many tenders state a mandatory standard as an eligibility "
                        "condition. Without a recorded credential the profile is filtered "
                        "out before assessment."
                    ),
                )
            )

        if sections["industry_detail"]:
            strengths.append(
                CapabilityInsight(
                    title="Sector-specific detail is present",
                    detail=(
                        "The profile answers the questions specific to its declared "
                        "industries, which distinguishes it from generic listings."
                    ),
                )
            )

        if not sections["capacity"]:
            gaps.append(
                CapabilityInsight(
                    title="Execution capacity is not stated",
                    detail=(
                        "Buyers need to judge whether the organisation can absorb the "
                        "volume. State team size, throughput and typical project value."
                    ),
                )
            )

        if not sections["innovation"]:
            gaps.append(
                CapabilityInsight(
                    title="Maturity and readiness are not stated",
                    detail=(
                        "Without a stated readiness level, an emerging solution cannot be "
                        "considered for pilot procurement."
                    ),
                )
            )

        if request.completion_percentage < 70:
            gaps.append(
                CapabilityInsight(
                    title=f"Profile is {request.completion_percentage}% complete",
                    detail=(
                        "Incomplete profiles score lower in matching because there is "
                        "less to match against. Completing the outstanding sections is "
                        "the single fastest improvement available."
                    ),
                )
            )

        industries = ", ".join(request.industries) if request.industries else "its declared sector"
        summary = (
            f"{request.organization_name} presents as a supplier operating in {industries}. "
            f"The profile is {request.completion_percentage}% complete and records "
            f"{sum(1 for present in sections.values() if present)} of "
            f"{len(sections)} capability sections. "
        )
        summary += (
            "The recorded material is sufficient for the platform to match this supplier "
            "against published requirements."
            if request.completion_percentage >= 70
            else "Further detail is needed before the platform can match this supplier "
            "reliably against published requirements."
        )

        areas = [
            title
            for title in request.open_opportunity_titles[:5]
        ] or [
            f"Procurement in {industry}" for industry in request.industries[:3]
        ]

        return CapabilityInsightsResponse(
            positioning_summary=summary,
            strengths=strengths,
            gaps=gaps,
            suggested_opportunity_areas=areas,
            model="stub-deterministic-v1",
            prompt_version=CAPABILITY_PROMPT_VERSION,
        )


    async def response_insights(
        self, request: ResponseEvaluationRequest
    ) -> ResponseEvaluationResponse:
        """Section-presence reading of one submitted response.

        Runs with no credentials, so it interprets nothing. What it does is
        report which parts of the response carry content and which are silent,
        quoting the opening of each section it found. That is a genuinely useful
        thing for an official to see and — more importantly — it is true, which
        a generated-sounding paragraph produced without a model would not be.

        Like every other provider here it produces no score, no rank and no
        recommendation.
        """
        start_time = time.time()

        filled = [section for section in request.sections if section.content.strip()]
        empty = [section for section in request.sections if not section.content.strip()]

        strengths: list[EvaluationInsight] = []
        weaknesses: list[EvaluationInsight] = []
        attention: list[EvaluationInsight] = []
        evidence: list[EvaluationEvidence] = []

        for section in filled[:6]:
            evidence.append(
                EvaluationEvidence(
                    section=section.label,
                    quote=_first_sentence(section.content)[:400] or section.content[:400],
                )
            )

        if filled:
            strengths.append(
                EvaluationInsight(
                    title="Sections completed",
                    detail=(
                        "The response carries content in: "
                        + ", ".join(section.label for section in filled)
                        + "."
                    ),
                )
            )

        for section in empty:
            weaknesses.append(
                EvaluationInsight(
                    title=f"{section.label} is empty",
                    detail=(
                        f"The {section.label.lower()} section of this response carries no text, "
                        "so there is nothing on it to read."
                    ),
                )
            )

        unanswered = [
            item for item in request.requirement_answers if not (item.answer or "").strip()
        ]
        if unanswered:
            attention.append(
                EvaluationInsight(
                    title=f"{len(unanswered)} requirement(s) answered without a statement",
                    detail=(
                        "A stated position with no supporting statement cannot be verified. "
                        "The first is: "
                        + _first_sentence(unanswered[0].requirement)
                    ),
                )
            )

        not_applicable = [
            item for item in request.requirement_answers if item.position == "NOT_APPLICABLE"
        ]
        if not_applicable:
            attention.append(
                EvaluationInsight(
                    title=f"{len(not_applicable)} requirement(s) declared not applicable",
                    detail=(
                        "Whether these are accepted as outside the scope of this response is a "
                        "decision for the department."
                    ),
                )
            )

        summary = (
            f"{request.supplier_name} submitted a "
            f"{request.response_type.replace('_', ' ').lower()} for {request.package_number} - "
            f"{request.package_title}. It carries content in {len(filled)} of "
            f"{len(request.sections)} section(s) and answers "
            f"{len(request.requirement_answers)} requirement(s). "
            "This reading is produced without a language model and reports only which parts of "
            "the response carry content; it interprets none of them."
        )

        return ResponseEvaluationResponse(
            summary=summary,
            technical_fit=(
                "No language model is configured, so the technical approach is not interpreted "
                "here. It is reproduced in full on the response reader for the reviewing "
                "official to read."
            ),
            experience_relevance=(
                "No language model is configured, so the relevance of the experience described "
                "is not assessed here."
            ),
            strengths=strengths,
            weaknesses=weaknesses,
            attention_points=attention,
            evidence=evidence,
            model="stub-deterministic-v1",
            provider=self.name,
            prompt_version=RESPONSE_PROMPT_VERSION,
            response_time_ms=int((time.time() - start_time) * 1000),
        )

def _first_sentence(text: str) -> str:
    cleaned = " ".join(text.split())
    match = re.search(r"^(.{0,240}?)(?:\.|$)", cleaned)
    sentence = match.group(1).strip() if match else cleaned[:240]
    return sentence or cleaned[:240]
