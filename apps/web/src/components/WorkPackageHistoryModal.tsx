import React from "react";
import type { WorkPackageHistoryEntry, WorkPackageItem } from "../api/workPackages.js";
import { GovernmentModal } from "./GovernmentModal.js";

interface WorkPackageHistoryModalProps {
  isOpen: boolean;
  targetPackage?: WorkPackageItem | null;
  historyEntries: WorkPackageHistoryEntry[];
  onClose: () => void;
}

function actionBadge(action: string) {
  switch (action) {
    case "CREATED":
      return { bg: "#E8F5E9", text: "#1B5E20", border: "#A5D6A7" };
    case "ACCEPTED":
      return { bg: "#E8F5E9", text: "#2E7D32", border: "#81C784" };
    case "REJECTED":
      return { bg: "#FFEBEE", text: "#C62828", border: "#EF9A9A" };
    case "EDITED":
      return { bg: "#EBF3FA", text: "#0B4F8C", border: "#90CAF9" };
    case "MERGED":
      return { bg: "#EDE7F6", text: "#4527A0", border: "#B39DDB" };
    case "SPLIT":
      return { bg: "#FFF8E1", text: "#F57F17", border: "#FFE082" };
    case "SOFT_DELETED":
      return { bg: "#ECEFF1", text: "#37474F", border: "#B0BEC5" };
    case "RESTORED":
      return { bg: "#E0F2F1", text: "#00695C", border: "#80CBC4" };
    case "DUPLICATED":
      return { bg: "#F3E5F5", text: "#6A1B9A", border: "#CE93D8" };
    case "REORDERED":
      return { bg: "#FAFAFA", text: "#616161", border: "#E0E0E0" };
    default:
      return { bg: "#F5F5F5", text: "#616161", border: "#E0E0E0" };
  }
}

export function WorkPackageHistoryModal({
  isOpen,
  targetPackage,
  historyEntries,
  onClose,
}: WorkPackageHistoryModalProps) {
  const filtered = targetPackage
    ? historyEntries.filter((h) => h.workPackageId === targetPackage.id)
    : historyEntries;

  return (
    <GovernmentModal
      isOpen={isOpen}
      title={
        targetPackage
          ? `Audit History: ${targetPackage.packageNumber} (${targetPackage.title})`
          : "Work Packages Audit Trail & Stage Log"
      }
      onClose={onClose}
      footer={
        <button type="button" className="gov-btn gov-btn--primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <p style={{ margin: 0, color: "var(--gov-text-secondary)", fontStyle: "italic" }}>
            No history recorded yet for this selection.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filtered.map((entry) => {
              const b = actionBadge(entry.action);
              return (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid var(--gov-border)",
                    borderRadius: "var(--gov-radius)",
                    padding: "12px 14px",
                    backgroundColor: "var(--gov-bg-surface)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "10px",
                          backgroundColor: b.bg,
                          color: b.text,
                          border: `1px solid ${b.border}`,
                        }}
                      >
                        {entry.action}
                      </span>
                      <strong style={{ fontSize: "13px", color: "var(--gov-primary-dark)" }}>
                        {entry.packageNumber} (v{entry.version})
                      </strong>
                    </div>

                    <span style={{ fontSize: "12px", color: "var(--gov-text-secondary)" }}>
                      {new Date(entry.createdAt).toLocaleString("en-IN", { hour12: true })}
                    </span>
                  </div>

                  <p style={{ margin: "0 0 6px", fontSize: "13px", color: "var(--gov-text-primary)" }}>
                    {entry.summary}
                  </p>

                  <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                    <strong>Official:</strong> {entry.actorName}
                    {entry.reason && (
                      <span style={{ marginLeft: "12px" }}>
                        <strong>Reason:</strong> {entry.reason}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GovernmentModal>
  );
}
