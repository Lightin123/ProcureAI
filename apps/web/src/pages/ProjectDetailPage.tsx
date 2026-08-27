import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getProject, type ProcurementProject } from "../api/projects.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectStatusBadge } from "../components/ProjectStatusBadge.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; project: ProcurementProject }
  | { kind: "failed"; message: string };

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", { hour12: false });
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(
    async (projectId: string, signal?: AbortSignal) => {
      setState({ kind: "loading" });
      try {
        const project = await getProject(projectId, signal);
        setState({ kind: "loaded", project });
      } catch (error) {
        if (signal?.aborted === true) return;
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : "The project could not be loaded.",
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (id === undefined) return;
    const controller = new AbortController();
    void load(id, controller.signal);
    return () => {
      controller.abort();
    };
  }, [id, load]);

  const title = state.kind === "loaded" ? state.project.title : "Procurement Project";

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Procurement Projects", to: "/projects" },
          { label: state.kind === "loaded" ? state.project.referenceNumber : "Project" },
        ]}
      />

      <PageHeader
        title={title}
        action={state.kind === "loaded" ? <ProjectStatusBadge status={state.project.status} /> : undefined}
      />

      {state.kind === "loading" && <p className="panel__message">Loading project…</p>}

      {state.kind === "failed" && (
        <div className="notice notice--error" role="alert">
          <p className="notice__title">Project unavailable</p>
          <p className="notice__body">{state.message}</p>
        </div>
      )}

      {state.kind === "loaded" && (
        <>
          <section className="panel" aria-labelledby="details-heading">
            <h2 className="panel__heading" id="details-heading">
              Project Details
            </h2>
            <div className="panel__body">
              <dl className="detail-list">
                <div className="detail-list__row">
                  <dt className="detail-list__term">Reference number</dt>
                  <dd className="detail-list__value detail-list__value--mono">
                    {state.project.referenceNumber}
                  </dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">Status</dt>
                  <dd className="detail-list__value">
                    <ProjectStatusBadge status={state.project.status} />
                  </dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">Department</dt>
                  <dd className="detail-list__value">{state.project.organizationName}</dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">Created by</dt>
                  <dd className="detail-list__value">{state.project.createdByName}</dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">Created on</dt>
                  <dd className="detail-list__value">{formatDateTime(state.project.createdAt)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="panel" aria-labelledby="problem-heading">
            <h2 className="panel__heading" id="problem-heading">
              Problem Description
            </h2>
            <div className="panel__body">
              <p className="prose">{state.project.problemDescription}</p>
            </div>
          </section>

          <div className="notice notice--info">
            <p className="notice__title">Requirement analysis not yet available</p>
            <p className="notice__body">
              This project is recorded in draft. Requirement analysis and later
              procurement stages are not yet part of the platform.
            </p>
          </div>
        </>
      )}
    </>
  );
}
