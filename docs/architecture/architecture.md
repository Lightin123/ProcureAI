# Architecture

**Status:** Confirmed direction for the current stage. Only the frontend and
backend skeleton (health check) is planned as the next implementation step;
the rest of this document describes target architecture.

## High-Level Component Diagram

```
React Frontend
        |
        | REST API
        v
Express Backend
        |
        +------ PostgreSQL + pgvector
        |         (application data, job/status records, document metadata)
        |
        +------ File / Object Storage
        |         (document content: RFIs, proposals, certificates, etc.)
        |
        +------ Background Job Processing
        |         (long-running / async operations)
        |             |
        |             v
        |       FastAPI AI Service
        |
        +------ FastAPI AI Service
                  (direct calls for AI operations fast enough to complete
                  within a single request)
```

The three **primary application components** are still just:

- React Frontend (`apps/web`)
- Express Backend (`apps/api`)
- FastAPI AI Service (`apps/ai-service`)

PostgreSQL, file/object storage, and background job processing are
**infrastructure the Express backend depends on**, not additional
independently deployed application services. See
[Explicit Architectural Boundaries](#explicit-architectural-boundaries)
below.

## Component Responsibilities

### React Frontend (`apps/web`)
- Presents the procurement workflow UI to officials (and, eventually, other
  roles).
- Talks to the Express backend exclusively over REST — never directly to
  PostgreSQL, file storage, or the AI service.
- For long-running operations, retrieves or receives a processing/job status
  from the Express backend rather than assuming an operation completes
  within a single request (see
  [Asynchronous Request Flow](#asynchronous-request-flow-target-conceptual)).

### Express Backend (`apps/api`)
Owns:
- Authentication (planned)
- Authorization / RBAC (planned)
- Procurement projects
- Vendors
- Workflow / state management
- Database access
- File storage references (document metadata, storage location)
- Background job orchestration (creating, tracking, and exposing status for
  long-running operations)
- API contracts
- Application state

The Express backend is the single point of contact for the frontend and the
system of record for application state. It is the only application
component that talks to PostgreSQL directly, and the only one that decides
when/how to invoke background processing or the AI service.

### FastAPI AI Service (`apps/ai-service`)
Handles AI/ML computation:
- Requirement extraction
- Clarification generation
- Work package / solution component generation
- Embeddings generation
- Document intelligence (structured extraction from documents)
- AI-assisted evaluation and comparison
- Optimization/ranking support

The AI service is stateless with respect to application data — it receives
what it needs in the request, performs AI/ML work, and returns structured,
validated output. It does not own application state, does not access
PostgreSQL or file storage directly, and is not called directly by the
frontend. It may be invoked either synchronously (for fast operations) or
as part of a background job (for longer-running ones) — always via the
Express backend.

### PostgreSQL + pgvector
- System of record for all structured application data: procurement
  projects, requirements, work packages, vendors, evaluations, background
  job/status records, and **document metadata** (filename, type, owning
  entity, storage reference) — not the document content itself.
- pgvector extension used for semantic search (vendor discovery, requirement
  matching) once implemented.
- Owned exclusively by the Express backend.

### File / Object Storage (Conceptual)

A storage location for document **content** — RFI responses, proposals,
certificates, technical documents, case studies, and similar files.
PostgreSQL stores metadata and a reference to where the file lives; it is
not assumed to be the primary store for large file content.

- Owned exclusively by the Express backend, same as PostgreSQL — the
  frontend and AI service never access storage directly.
- Local development is expected to use local filesystem storage; a future
  deployment may use object storage (e.g. an S3-compatible service).
- **The specific provider/technology is intentionally unresolved** — this
  is a conceptual component, not a commitment to a product. See
  [decisions.md](decisions.md).

### Background Job Processing (Conceptual)

A capability for running long-running operations outside the lifetime of a
single HTTP request, so the API can respond with a job/processing status
instead of blocking until the work finishes. Candidate operations include:

- Document processing / OCR / text extraction
- Embedding generation
- Long-running AI analysis
- Evaluation processing across many candidates

This is a conceptual capability the Express backend exposes, **not a new
independently deployed service**. It may be implemented in-process, via a
task queue, or another mechanism — that choice is intentionally deferred.
See [decisions.md](decisions.md) for what's still open.

## Request Flow (Target — Synchronous)

For operations that can complete within a single request/response cycle:

1. Frontend sends a REST request to the Express backend.
2. Express backend applies auth/authorization, validates input.
3. For AI-driven operations, Express backend calls the FastAPI AI service
   with the relevant data, receives structured/validated output.
4. Express backend persists results (or AI suggestions, kept separate from
   confirmed state) to PostgreSQL.
5. Express backend returns a response to the frontend.

## Asynchronous Request Flow (Target, Conceptual)

For long-running operations (document processing, embedding generation,
large-scale evaluation, etc.), the backend does not hold the HTTP request
open until the work completes:

```
Frontend
   |
   v
Express API  ---------------------------------------------+
   |                                                       |
   | 1. create processing job, return job id/status        |
   v                                                       |
Background Processing                                      |
   |                                                       |
   | 2. invoke FastAPI AI Service where needed              |
   v                                                       |
FastAPI AI Service                                          |
   |                                                       |
   | 3. return structured result                            |
   v                                                       |
Background Processing                                      |
   |                                                       |
   | 4. persist result via Express-owned data access        |
   v                                                       |
PostgreSQL / File Storage                                   |
                                                             |
Frontend  <--------------------------------------------------+
   5. retrieves or receives updated job status
```

Steps, described:

1. Frontend calls the Express API to start an operation; Express creates a
   job record and returns immediately with a job id / status rather than
   blocking.
2. Background processing picks up the job and, where AI/ML work is needed,
   calls the FastAPI AI service.
3. The AI service returns structured, validated output.
4. The result is persisted (via the Express backend's data access layer) to
   PostgreSQL and/or file storage.
5. The frontend retrieves the updated status (or receives it), and reflects
   the result once processing completes.

**Intentionally not yet decided:** whether the frontend polls for status,
uses Server-Sent Events, uses WebSockets, or something else; whether
background processing uses an in-process mechanism, a queue library (e.g.
BullMQ), a broker (e.g. Redis), or another approach. These are
implementation choices to make when this capability is actually built, not
now. See [decisions.md](decisions.md).

## Explicit Architectural Boundaries

- **Three primary application components.** The system has three primary,
  independently deployed application components: the React frontend, the
  Express backend, and the FastAPI AI service. Additional independently
  deployed application services should not be introduced without a clear
  technical reason. PostgreSQL, file storage, and background job processing
  are infrastructure the Express backend depends on — they are not
  additional application services and do not change this rule.
- **The frontend never calls the AI service directly.** All AI
  functionality is mediated by the Express backend.
- **The AI service never accesses PostgreSQL or file storage directly.** If
  the AI service needs data, it receives it from the Express backend in the
  request, and returns results to the Express backend (directly or via
  background processing) rather than persisting anything itself.
- **The Express backend is the sole owner of application data access** —
  database queries, structured filtering, permissions, workflow state, and
  persistence all live there. FastAPI is limited to AI/ML computation:
  requirement extraction, clarification generation, embedding generation,
  document intelligence, and AI-assisted evaluation.
- **No Docker** for this project (local development only, for now).
- **No monorepo build tooling** (no Turborepo, no Nx). `apps/web` and
  `apps/api` are independent projects.

## Current Implementation Status

Nothing has been implemented. `apps/web`, `apps/api`, and `apps/ai-service`
are empty directories. The first milestone will implement only the Frontend
-> Backend -> `/health` slice; PostgreSQL, file storage, background
processing, and the AI service are not part of that milestone.

## Related Documents

- [technology-stack.md](technology-stack.md)
- [database.md](database.md)
- [api-design.md](api-design.md)
- [decisions.md](decisions.md)
- [../development-roadmap.md](../development-roadmap.md)
