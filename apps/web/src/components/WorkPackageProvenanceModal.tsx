import React from "react";
import type { WorkPackageAnalysisRun } from "../api/workPackages.js";
import { GovernmentModal } from "./GovernmentModal.js";
import { StatusBadge } from "./StatusBadge.js";
import { RobotIcon } from "./GovernmentIcons.js";

interface WorkPackageProvenanceModalProps {
  isOpen: boolean;
  analyses: WorkPackageAnalysisRun[];
  onClose: () => void;
}

export function WorkPackageProvenanceModal({
  isOpen,
  analyses,
  onClose,
}: WorkPackageProvenanceModalProps) {
  const latest = analyses[0];

  return (
    <GovernmentModal
      isOpen={isOpen}
      title="AI Decomposition Provenance & Model Audit"
      onClose={onClose}
      footer={
        <button type="button" className="gov-btn gov-btn--primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ maxHeight: "65vh", overflowY: "auto" }}>
        {latest ? (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                padding: "12px",
                backgroundColor: "var(--gov-primary-subtle)",
                borderRadius: "var(--gov-radius)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <RobotIcon size={24} />
                <div>
                  <strong style={{ display: "block", color: "var(--gov-primary-dark)" }}>
                    Latest Decomposition Run
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--gov-text-secondary)" }}>
                    ID: {latest.id}
                  </span>
                </div>
              </div>

              <StatusBadge
                tone={
                  latest.status === "SUCCEEDED"
                    ? "operational"
                    : latest.status === "FAILED"
                    ? "unavailable"
                    : "pending"
                }
                label={latest.status}
              />
            </div>

            <dl className="gov-desc-list" style={{ marginBottom: "16px" }}>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Provider</dt>
                <dd className="gov-desc-val">{latest.provider ?? "stub"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Model Identifier</dt>
                <dd className="gov-desc-val gov-desc-val--mono">{latest.model ?? "deterministic-stub"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Prompt Version</dt>
                <dd className="gov-desc-val">{latest.promptVersion ?? "v1.0"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Prompt SHA-256 Hash</dt>
                <dd className="gov-desc-val gov-desc-val--mono" style={{ fontSize: "11px", wordBreak: "break-all" }}>
                  {latest.promptHash ?? "—"}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Triggered By Official</dt>
                <dd className="gov-desc-val">{latest.triggeredByName}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Execution Timestamp</dt>
                <dd className="gov-desc-val">
                  {new Date(latest.createdAt).toLocaleString("en-IN", { hour12: true })}
                </dd>
              </div>
            </dl>

            {latest.decompositionStrategy && (
              <div style={{ marginBottom: "16px" }}>
                <strong style={{ fontSize: "13px", color: "var(--gov-primary-dark)", display: "block", marginBottom: "4px" }}>
                  AI Decomposition Strategy & Rationale:
                </strong>
                <div
                  style={{
                    backgroundColor: "var(--gov-bg-alt)",
                    border: "1px solid var(--gov-border)",
                    padding: "10px 12px",
                    borderRadius: "var(--gov-radius)",
                    fontSize: "13px",
                    lineHeight: "1.5",
                  }}
                >
                  {latest.decompositionStrategy}
                </div>
              </div>
            )}

            {latest.recommendations && latest.recommendations.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <strong style={{ fontSize: "13px", color: "var(--gov-primary-dark)", display: "block", marginBottom: "4px" }}>
                  AI Tendering & Packaging Recommendations:
                </strong>
                <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "var(--gov-text-primary)" }}>
                  {latest.recommendations.map((rec, idx) => (
                    <li key={idx} style={{ marginBottom: "4px" }}>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analyses.length > 1 && (
              <div style={{ marginTop: "20px" }}>
                <strong style={{ fontSize: "13px", color: "var(--gov-primary-dark)", display: "block", marginBottom: "8px" }}>
                  Prior Analysis Executions ({analyses.length - 1}):
                </strong>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {analyses.slice(1).map((run) => (
                    <div
                      key={run.id}
                      style={{
                        padding: "8px 10px",
                        border: "1px solid var(--gov-border)",
                        borderRadius: "var(--gov-radius)",
                        fontSize: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>
                        {run.model} ({run.provider}) by {run.triggeredByName}
                      </span>
                      <span>{new Date(run.createdAt).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p style={{ margin: 0, color: "var(--gov-text-secondary)", fontStyle: "italic" }}>
            No AI decomposition run has been executed yet for this project.
          </p>
        )}
      </div>
    </GovernmentModal>
  );
}
