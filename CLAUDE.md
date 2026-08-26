# SIH26136 Procurement Platform

## Project

This project is being developed for Smart India Hackathon 2026.

Problem Statement:

SIH26136 — Startup-Friendly Public Procurement Mechanism

The project is an AI-assisted government procurement planning and vendor
discovery platform.

The platform helps government officials:

1. Convert unstructured problems into structured requirements.
2. Identify missing information.
3. Generate clarification questions.
4. Create procurement work packages.
5. Discover suitable vendors using semantic search and structured filtering.
6. Evaluate candidates using deterministic and AI-assisted analysis.
7. Generate explainable procurement recommendations.

The final procurement decision must always remain with a human official.

---

# Technology Stack

Frontend:
- React
- TypeScript
- Vite

Backend:
- Node.js
- Express.js
- TypeScript

AI Service:
- Python
- FastAPI
- Pydantic

Database:
- PostgreSQL
- pgvector

Development:
- Local development
- No Docker for this project

---

# Architecture

The architecture is:

React Frontend
        |
        | REST API
        v
Express Backend
        |
        +------ PostgreSQL + pgvector
        |
        +------ FastAPI AI Service

The Express backend owns:

- Authentication
- Authorization
- Projects
- Vendors
- Workflow
- Database access
- API contracts
- Application state

The FastAPI AI service handles:

- Requirement extraction
- Clarification generation
- Work package generation
- Embeddings
- AI-assisted analysis
- Optimization

Do not introduce microservices.

Do not introduce additional services unless there is a clear technical reason.

---

# Development Principles

- Build incrementally using vertical slices.
- Keep the project runnable after each milestone.
- Prefer simple solutions over unnecessary abstractions.
- Do not introduce technology only for buzzwords.
- Do not introduce multi-agent architecture unless justified.
- AI outputs must be structured and validated.
- Do not trust raw LLM output as the source of truth.
- Use deterministic logic where appropriate.
- Human approval is required at important workflow stages.

---

# Current Development Stage

We are currently building the project foundation.

The first milestone is:

React Frontend
        |
        v
Express Backend
        |
        v
Health Endpoint

The first end-to-end success condition is:

The React frontend successfully communicates with the Express backend.

Do not implement:

- Authentication
- Database models
- PostgreSQL integration
- AI functionality
- Vendor functionality
- Procurement logic

until explicitly requested.

---

# Development Workflow

Before implementing a significant feature:

1. Inspect the existing project structure.
2. Understand the relevant code.
3. Propose a concise implementation plan.
4. Make focused changes only.
5. Run the relevant checks after implementation.

Do not modify unrelated files.

---

# Git Rules

- Never push directly to main.
- Use feature branches.
- Keep commits focused.
- Do not mix unrelated features in one pull request.

Branch naming:

feat/<feature-name>
fix/<issue-name>
chore/<task-name>

---

# Code Style

- Use TypeScript for frontend and backend.
- Use Python for the AI service.
- Avoid `any` unless absolutely necessary.
- Validate external input.
- Prefer descriptive names.
- Prefer readable code over clever abstractions.
- Do not add unnecessary comments.