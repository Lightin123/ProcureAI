import hashlib

PROMPT_VERSION = "work-package-decomposition-v1"

SYSTEM_PROMPT = """You are an expert Government Procurement Architect assisting Indian government procurement officials.
Your role is to decompose confirmed procurement requirements and project descriptions into logical, discrete, cohesive, and implementable Work Packages (lots/modules/components) for tendering, execution, and vendor discovery.

Follow these strict principles:
1. Identify logical procurement components (e.g., Core Software Platform, Cloud/Hardware Infrastructure, System Integration & API Gateway, Security & Compliance, Operations & Maintenance / Capacity Building).
2. Group related functional and non-functional requirements into the most appropriate package so each requirement is accounted for with minimal overlap.
3. Establish clear implementation boundaries and deliverables for each work package.
4. Identify dependencies between work packages (e.g., "Software Application Platform" depends on "Cloud & Infrastructure Foundation").
5. Assess complexity (LOW, MEDIUM, HIGH, VERY_HIGH), priority (CRITICAL, HIGH, MEDIUM, LOW), and appropriate public procurement category (e.g., Hardware, Software Solution, Cloud Services, System Integration, Technical Consultancy, Facility Management / AMC).
6. Provide clear AI reasoning for why each package was structured this way and assign a confidence score (between 0.70 and 0.98).
7. Match requirement IDs exactly to the confirmed requirement IDs provided in the user input.

Write in clear, authoritative, formal administrative English suitable for Government of India tender specifications. Avoid buzzwords and hype."""

SCHEMA_INSTRUCTION = """Respond with a single valid JSON object and nothing else — no markdown code fences, no introductory or concluding text.
Required JSON structure:
{
  "work_packages": [
    {
      "title": "Title of the Work Package",
      "description": "Clear administrative description of what this work package achieves.",
      "scope": "Precise boundary, included items, and implementation scope.",
      "included_requirement_ids": ["req-id-1", "req-id-2"],
      "deliverables": ["Deliverable 1", "Deliverable 2", "Deliverable 3"],
      "dependencies": ["Exact title or reference of prerequisite package if any"],
      "complexity": "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH",
      "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "estimated_procurement_category": "Software Solution" | "Hardware" | "Cloud Services" | "System Integration" | "Consultancy" | "Operations & Maintenance",
      "ai_reasoning": "Detailed justification explaining why these requirements were grouped and bounded.",
      "confidence_score": 0.90
    }
  ]
}"""


def build_work_package_prompt(
    project_title: str,
    problem_description: str,
    organization_name: str | None,
    confirmed_requirements: list[dict],
) -> tuple[str, str]:
    """Returns (user_prompt, prompt_hash)."""
    sections = [
        f"PROJECT TITLE:\n{project_title}",
    ]
    if organization_name:
        sections.append(f"NODAL DEPARTMENT / MINISTRY:\n{organization_name}")

    sections.append(f"PROJECT OVERVIEW & PROBLEM STATEMENT:\n{problem_description}")

    if confirmed_requirements:
        req_lines = []
        for r in confirmed_requirements:
            rid = r.get("id", "")
            kind = r.get("kind", "REQUIREMENT")
            cat = r.get("category", "FUNCTIONAL")
            text = r.get("text", "")
            req_lines.append(f"- ID: {rid} | [{kind}/{cat}]: {text}")
        sections.append("CONFIRMED REQUIREMENTS & CONSTRAINTS:\n" + "\n".join(req_lines))
    else:
        sections.append("CONFIRMED REQUIREMENTS:\nNo explicit requirement items; derive packages from the problem statement.")

    sections.append(
        "TASK:\nDecompose the above procurement project and all confirmed requirements into structured procurement work packages according to the specified schema."
    )

    user_prompt = "\n\n".join(sections)
    full_prompt_text = f"{SYSTEM_PROMPT}\n\n{SCHEMA_INSTRUCTION}\n\n{user_prompt}"
    prompt_hash = hashlib.sha256(full_prompt_text.encode("utf-8")).hexdigest()

    return user_prompt, prompt_hash
