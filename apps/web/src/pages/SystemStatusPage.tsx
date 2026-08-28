import React, { useCallback, useEffect, useState } from "react";

import { fetchSystemStatus, type SystemStatus } from "../api/system.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { RefreshIcon, BuildingIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { StatusBadge, type StatusTone } from "../components/StatusBadge.js";

type ConnectionState =
  | { kind: "checking" }
  | { kind: "online"; status: SystemStatus; checkedAt: Date }
  | { kind: "offline"; message: string; checkedAt: Date };

interface ComponentRow {
  name: string;
  detail: string;
  tone: StatusTone;
  label: string;
}

function formatTimestamp(value: Date): string {
  return value.toLocaleString("en-IN", { hour12: true });
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
      const status = await fetchSystemStatus(signal);
      setConnection({ kind: "online", status, checkedAt: new Date() });
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

  const backendDetail = "Node.js Express API · Port 4000";
  const backendRow: ComponentRow =
    connection.kind === "online"
      ? { name: "Backend API Service", detail: backendDetail, tone: "operational", label: "Operational" }
      : connection.kind === "offline"
        ? { name: "Backend API Service", detail: backendDetail, tone: "unavailable", label: "Unavailable" }
        : { name: "Backend API Service", detail: backendDetail, tone: "pending", label: "Checking" };

  const databaseConnected = connection.kind === "online" && connection.status.database === "connected";
  const databaseRow: ComponentRow = databaseConnected
    ? { name: "PostgreSQL Database", detail: "PostgreSQL with pgvector", tone: "operational", label: "Connected" }
    : connection.kind === "online"
      ? { name: "PostgreSQL Database", detail: "PostgreSQL with pgvector", tone: "unavailable", label: "Unavailable" }
      : { name: "PostgreSQL Database", detail: "PostgreSQL with pgvector", tone: "pending", label: "Unknown" };

  const aiDetail =
    connection.kind === "online" && connection.status.aiModel !== null
      ? `FastAPI + Pydantic · ${connection.status.aiModel}`
      : "FastAPI + Pydantic";
  const aiRow: ComponentRow =
    connection.kind === "online"
      ? connection.status.aiService === "connected"
        ? { name: "AI Decision Support Engine", detail: aiDetail, tone: "operational", label: "Operational" }
        : { name: "AI Decision Support Engine", detail: aiDetail, tone: "unavailable", label: "Unavailable" }
      : { name: "AI Decision Support Engine", detail: aiDetail, tone: "pending", label: "Unknown" };

  const componentRows: ComponentRow[] = [
    { name: "Web Portal Interface", detail: "React + Vite (UIDAI / GoI Design System)", tone: "operational", label: "Operational" },
    backendRow,
    databaseRow,
    aiRow,
  ];

  return (
    <>
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "System Diagnostics & Status" }]} />

      <PageHeader
        title="System Status & Infrastructure Diagnostics"
        subtitle="Real-time connectivity and health telemetry for ProcureAI platform services."
        action={
          <button
            type="button"
            className="gov-btn gov-btn--primary"
            onClick={() => void checkBackend()}
            disabled={connection.kind === "checking"}
          >
            <RefreshIcon size={16} />
            {connection.kind === "checking" ? "Running Diagnostics…" : "Refresh System Diagnostics"}
          </button>
        }
      />

      {connection.kind === "offline" && (
        <GovernmentAlert type="error" title="Backend Service Disconnected">
          {connection.message} Confirm that the ProcureAI API service is running on port
          4000, then click “Refresh System Diagnostics”.
        </GovernmentAlert>
      )}

      {connection.kind === "online" && !databaseConnected && (
        <GovernmentAlert type="warning" title="Database Connection Pending">
          The API server is online, but the PostgreSQL database is unreachable. Ensure
          <code> apps/api/.env </code> contains a valid <code>DATABASE_URL</code> and migrations are run.
        </GovernmentAlert>
      )}

      {/* Connectivity Telemetry */}
      <GovernmentCard
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <BuildingIcon size={20} />
            <span>Core Gateway Connectivity</span>
          </div>
        }
        subtitle="Real-time probe response from API health check endpoint"
      >
        <dl className="gov-desc-list">
          <div className="gov-desc-item">
            <dt className="gov-desc-term">Connection Status</dt>
            <dd className="gov-desc-val">
              {connection.kind === "online" && <StatusBadge tone="operational" label="Operational" />}
              {connection.kind === "offline" && <StatusBadge tone="unavailable" label="Unavailable" />}
              {connection.kind === "checking" && <StatusBadge tone="pending" label="Probing..." />}
            </dd>
          </div>

          <div className="gov-desc-item">
            <dt className="gov-desc-term">Monitored Endpoint</dt>
            <dd className="gov-desc-val gov-desc-val--mono">GET /health</dd>
          </div>

          <div className="gov-desc-item">
            <dt className="gov-desc-term">Service Signature</dt>
            <dd className="gov-desc-val gov-desc-val--mono">
              {connection.kind === "online" ? connection.status.service : "—"}
            </dd>
          </div>

          <div className="gov-desc-item">
            <dt className="gov-desc-term">Database State</dt>
            <dd className="gov-desc-val gov-desc-val--mono">
              {connection.kind === "online" ? connection.status.database : "—"}
            </dd>
          </div>

          <div className="gov-desc-item">
            <dt className="gov-desc-term">Server Timestamp</dt>
            <dd className="gov-desc-val gov-desc-val--mono">
              {connection.kind === "online" ? connection.status.checkedAt : "—"}
            </dd>
          </div>

          <div className="gov-desc-item">
            <dt className="gov-desc-term">Last Diagnostic Check</dt>
            <dd className="gov-desc-val">
              {connection.kind === "checking" ? "In progress…" : formatTimestamp(connection.checkedAt)}
            </dd>
          </div>
        </dl>
      </GovernmentCard>

      {/* Platform Infrastructure Components */}
      <GovernmentCard
        title="Platform Component Health Matrix"
        subtitle="Operational status of platform architectural layers"
      >
        <div className="gov-table-container">
          <table className="gov-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: "260px" }}>Subsystem Layer</th>
                <th scope="col">Runtime Specifications</th>
                <th scope="col" style={{ width: "160px" }}>Operational State</th>
              </tr>
            </thead>
            <tbody>
              {componentRows.map((row) => (
                <tr key={row.name}>
                  <td style={{ fontWeight: 600, color: "var(--gov-primary-dark)" }}>
                    {row.name}
                  </td>
                  <td style={{ color: "var(--gov-text-secondary)" }}>{row.detail}</td>
                  <td>
                    <StatusBadge tone={row.tone} label={row.label} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GovernmentCard>
    </>
  );
}
