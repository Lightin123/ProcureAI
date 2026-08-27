import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { listProjects, type ProcurementProject } from "../api/projects.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectStatusBadge } from "../components/ProjectStatusBadge.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; projects: ProcurementProject[] }
  | { kind: "failed"; message: string };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ProjectListPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const navigate = useNavigate();

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const projects = await listProjects(signal);
      setState({ kind: "loaded", projects });
    } catch (error) {
      if (signal?.aborted === true) return;
      setState({
        kind: "failed",
        message: error instanceof Error ? error.message : "Projects could not be loaded.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  return (
    <>
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Procurement Projects" }]} />

      <PageHeader
        title="Procurement Projects"
        action={
          <button
            type="button"
            className="button button--primary"
            onClick={() => void navigate("/projects/new")}
          >
            Create Procurement Project
          </button>
        }
      />

      <p className="page-intro">
        Procurement projects recorded for your department. Select a reference
        number to view the full record.
      </p>

      {state.kind === "failed" && (
        <div className="notice notice--error" role="alert">
          <p className="notice__title">Projects could not be loaded</p>
          <p className="notice__body">{state.message}</p>
        </div>
      )}

      <section className="panel" aria-labelledby="projects-heading">
        <h2 className="panel__heading" id="projects-heading">
          Project Register
        </h2>
        <div className="panel__body panel__body--flush">
          {state.kind === "loading" && <p className="panel__message">Loading procurement projects…</p>}

          {state.kind === "loaded" && state.projects.length === 0 && (
            <p className="panel__message">
              No procurement projects have been created yet. Use “Create Procurement
              Project” to record the first one.
            </p>
          )}

          {state.kind === "loaded" && state.projects.length > 0 && (
            <table className="data-table">
              <caption className="data-table__caption">
                {state.projects.length} project{state.projects.length === 1 ? "" : "s"} recorded.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {state.projects.map((project) => (
                  <tr key={project.id}>
                    <th scope="row">
                      <Link to={`/projects/${project.id}`}>{project.referenceNumber}</Link>
                    </th>
                    <td>{project.title}</td>
                    <td>
                      <ProjectStatusBadge status={project.status} />
                    </td>
                    <td>{formatDate(project.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
