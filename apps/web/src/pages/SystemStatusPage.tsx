import { useCallback, useEffect, useState } from "react";

import { fetchHealth, type HealthResponse } from "../api/health.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { PageHeader } from "../components/PageHeader.js";
import { StatusBadge, type StatusTone } from "../components/StatusBadge.js";

type ConnectionState =
  | { kind: "checking" }
  | { kind: "online"; health: HealthResponse; checkedAt: Date }
  | { kind: "offline"; message: string; checkedAt: Date };

interface ComponentRow {
  name: string;
  detail: string;
  tone: StatusTone;
  label: string;
}

function formatTimestamp(value: Date): string {
  return value.toLocaleString("en-IN", { hour12: false });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "The backend service could not be reached.";
}

export function SystemStatusPage() {
  const [connection, setConnection] = useState<ConnectionState>({ kind: "checking" });

  const checkBackend = useCallback(async (signal?: AbortSignal) => {
    setConnection({ kind: "checking" });

    try {
      const health = await fetchHealth(signal);
      setConnection({ kind: "online", health, checkedAt: new Date() });
    } catch (error) {
      if (signal?.aborted === true) {
        return;
      }
      setConnection({ kind: "offline", message: describeError(error), checkedAt: new Date() });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkBackend(controller.signal);
    return () => {
      controller.abort();
    };
  }, [checkBackend]);

  const backendDetail = "Express · http://localhost:4000";
  const backendRow: ComponentRow =
    connection.kind === "online"
      ? { name: "Backend API", detail: backendDetail, tone: "operational", label: "Operational" }
      : connection.kind === "offline"
        ? { name: "Backend API", detail: backendDetail, tone: "unavailable", label: "Unavailable" }
        : { name: "Backend API", detail: backendDetail, tone: "pending", label: "Checking" };

  const databaseConnected = connection.kind === "online" && connection.health.database === "connected";
  const databaseRow: ComponentRow = databaseConnected
    ? { name: "Database", detail: "PostgreSQL · hosted", tone: "operational", label: "Connected" }
    : connection.kind === "online"
      ? { name: "Database", detail: "PostgreSQL · hosted", tone: "unavailable", label: "Unavailable" }
      : { name: "Database", detail: "PostgreSQL · hosted", tone: "pending", label: "Unknown" };

  const componentRows: ComponentRow[] = [
    { name: "Web Portal", detail: "React · Vite development server", tone: "operational", label: "Operational" },
    backendRow,
    databaseRow,
    { name: "AI Service", detail: "FastAPI · scheduled for Milestone 3", tone: "inactive", label: "Not Implemented" },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "System Status" }]} />

      <PageHeader
        title="System Status"
        action={
          <button
            type="button"
            className="button button--primary"
            onClick={() => void checkBackend()}
            disabled={connection.kind === "checking"}
          >
            {connection.kind === "checking" ? "Checking…" : "Check Again"}
          </button>
        }
      />

      <p className="page-intro">
        This page reports whether the ProcureAI web portal can reach its backend
        service and database. It is provided to verify the platform installation.
      </p>

      {connection.kind === "offline" && (
        <div className="notice notice--error" role="alert">
          <p className="notice__title">Backend service unavailable</p>
          <p className="notice__body">
            {connection.message} Confirm that the ProcureAI API is running on port
            4000, then select “Check Again”.
          </p>
        </div>
      )}

      {connection.kind === "online" && !databaseConnected && (
        <div className="notice notice--warning" role="alert">
          <p className="notice__title">Database unavailable</p>
          <p className="notice__body">
            The backend is running but cannot reach the database. Confirm that
            <code> apps/api/.env </code> contains a valid <code>DATABASE_URL</code> and that
            migrations have been applied.
          </p>
        </div>
      )}

      <section className="panel" aria-labelledby="connectivity-heading">
        <h2 className="panel__heading" id="connectivity-heading">
          Backend Connectivity
        </h2>
        <div className="panel__body">
          <dl className="detail-list" aria-live="polite">
            <div className="detail-list__row">
              <dt className="detail-list__term">Connection status</dt>
              <dd className="detail-list__value">
                {connection.kind === "online" && <StatusBadge tone="operational" label="Connected" />}
                {connection.kind === "offline" && <StatusBadge tone="unavailable" label="Not Connected" />}
                {connection.kind === "checking" && <StatusBadge tone="pending" label="Checking" />}
              </dd>
            </div>
            <div className="detail-list__row">
              <dt className="detail-list__term">Endpoint</dt>
              <dd className="detail-list__value detail-list__value--mono">GET /health</dd>
            </div>
            <div className="detail-list__row">
              <dt className="detail-list__term">Reported service</dt>
              <dd className="detail-list__value detail-list__value--mono">
                {connection.kind === "online" ? connection.health.service : "—"}
              </dd>
            </div>
            <div className="detail-list__row">
              <dt className="detail-list__term">Database</dt>
              <dd className="detail-list__value detail-list__value--mono">
                {connection.kind === "online" ? connection.health.database : "—"}
              </dd>
            </div>
            <div className="detail-list__row">
              <dt className="detail-list__term">Backend timestamp</dt>
              <dd className="detail-list__value detail-list__value--mono">
                {connection.kind === "online" ? connection.health.timestamp : "—"}
              </dd>
            </div>
            <div className="detail-list__row">
              <dt className="detail-list__term">Last checked</dt>
              <dd className="detail-list__value">
                {connection.kind === "checking" ? "In progress" : formatTimestamp(connection.checkedAt)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="panel" aria-labelledby="components-heading">
        <h2 className="panel__heading" id="components-heading">
          Platform Components
        </h2>
        <div className="panel__body panel__body--flush">
          <table className="data-table">
            <caption className="data-table__caption">
              Implementation status of the components defined in the ProcureAI architecture.
            </caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Details</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {componentRows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{row.detail}</td>
                  <td>
                    <StatusBadge tone={row.tone} label={row.label} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
