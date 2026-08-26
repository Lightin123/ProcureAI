# Glossary

**Status:** Reference document, updated as terminology is introduced.

| Term | Definition |
|---|---|
| **Official** | A government procurement/department official; the primary user of the platform. See [product/users-and-roles.md](product/users-and-roles.md). |
| **Procurement Project** | The top-level entity an official creates, representing one problem/procurement effort from description through decision. |
| **Structured Requirements** | The validated, official-approved set of requirements derived from a project's free-form problem description. |
| **Clarification Question** | An AI-generated question surfaced when the system detects missing information needed to produce structured requirements. |
| **Work Package** | A discrete, procurable unit produced by dividing a project's structured requirements. |
| **Vendor / Startup** | A solution provider that can be discovered and evaluated as a candidate for a work package. |
| **Semantic Search** | Vector-similarity-based search (via pgvector embeddings) used to find vendors whose capabilities match a requirement's meaning, not just its keywords. |
| **Structured Filtering** | Deterministic, non-AI filtering (e.g. by sector, size, location, certification) applied alongside semantic search during vendor discovery. |
| **RFI** | Request for Information — a document/response collected from a vendor about their proposed solution for a work package. |
| **Document Intelligence** | AI-assisted extraction of structured data from submitted documents (RFIs/proposals). |
| **Evaluation** | The scored assessment of a vendor candidate against a work package across technical, financial, compliance, and semantic-match dimensions. |
| **Ranking** | The ordered result of evaluating and comparing candidate vendors. |
| **Explainable Recommendation** | A ranked candidate recommendation accompanied by the evidence and reasoning behind its score, per NFR1 in [product/requirements.md](product/requirements.md). |
| **Human-in-the-loop** | The principle that AI-generated output at every workflow stage requires human review/approval before becoming confirmed application state. |
| **AI Suggestion vs. Confirmed State** | The data-modeling distinction between AI-generated content (not yet approved) and official-approved content, kept separate per NFR8. |
| **RAG (Retrieval-Augmented Generation)** | Grounding an LLM's output in retrieved data (e.g. retrieved vendor records) rather than relying solely on model recall. See [ai/rag-and-semantic-search.md](ai/rag-and-semantic-search.md). |
| **pgvector** | PostgreSQL extension enabling storage and similarity search over vector embeddings, used for semantic search. |
| **Audit Trail** | The record of who performed which key state-changing action and when, required for auditability (NFR4). |
| **RBAC** | Role-Based Access Control — restricting actions/data access according to a user's role. See [product/users-and-roles.md](product/users-and-roles.md). |

## Related Documents

- [product/requirements.md](product/requirements.md)
- [product/users-and-roles.md](product/users-and-roles.md)
- [design/procurement-workflow.md](design/procurement-workflow.md)
