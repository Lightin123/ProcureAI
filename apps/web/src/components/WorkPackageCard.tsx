import React from "react";
import type { WorkPackageItem } from "../api/workPackages.js";
import { StatusBadge } from "./StatusBadge.js";
import {
  BuildingIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  GitBranchIcon,
  HistoryIcon,
  PackageIcon,
  TrashIcon,
  UndoIcon,
} from "./GovernmentIcons.js";

interface WorkPackageCardProps {
  pkg: WorkPackageItem;
  canEdit: boolean;
  busy: boolean;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onAccept: (id: string) => void;
  onReject: (pkg: WorkPackageItem) => void;
  onEdit: (pkg: WorkPackageItem) => void;
  onDuplicate: (id: string) => void;
  onSplit: (pkg: WorkPackageItem) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onViewHistory: (pkg: WorkPackageItem) => void;
  onFindSuppliers?: (id: string) => void;
}

function statusTone(status: string) {
  switch (status) {
    case "ACCEPTED":
    case "CONFIRMED":
      return "operational" as const;
    case "REJECTED":
    case "DELETED":
      return "unavailable" as const;
    case "SUPERSEDED":
    case "ARCHIVED":
    case "UNDER_REVIEW":
    case "AI_GENERATED":
    case "EDITED":
    case "MANUAL":
    case "SUGGESTED":
    default:
      return "pending" as const;
  }
}

function sourceLabel(source: string) {
  switch (source) {
    case "AI_DECOMPOSED":
    case "AI_GENERATED":
      return "AI-Decomposed";
    case "MANUAL":
      return "Manual Entry";
    case "MERGED":
      return "Merged Lot";
    case "SPLIT":
      return "Split Component";
    case "SINGLE_PROJECT":
    case "NO_DECOMPOSITION":
      return "Single Package";
    default:
      return source;
  }
}

function priorityColor(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return { bg: "#FFEBEE", text: "#C62828", border: "#EF9A9A" };
    case "HIGH":
      return { bg: "#FFF3E0", text: "#E65100", border: "#FFCC80" };
    case "MEDIUM":
      return { bg: "#EBF3FA", text: "#0B4F8C", border: "#BBDEFB" };
    case "LOW":
      return { bg: "#F5F5F5", text: "#616161", border: "#E0E0E0" };
    default:
      return { bg: "#F5F5F5", text: "#616161", border: "#E0E0E0" };
  }
}

function complexityBadge(complexity: string) {
  return (
    <span className="gov-tag gov-tag--meta" style={{ textTransform: "capitalize" }}>
      Complexity: {(complexity || "medium").toLowerCase().replace("_", " ")}
    </span>
  );
}

export function WorkPackageCard({
  pkg,
  canEdit,
  busy,
  isSelected,
  onSelect,
  onAccept,
  onReject,
  onEdit,
  onDuplicate,
  onSplit,
  onDelete,
  onRestore,
  onViewHistory,
  onFindSuppliers,
}: WorkPackageCardProps) {
  const pStyle = priorityColor(pkg.priority || "MEDIUM");
  const deliverables = pkg.deliverables || [];
  const requirements = pkg.requirements || [];
  const dependencies = pkg.dependencies || [];

  return (
    <article
      className={`gov-wp-card${pkg.isDeleted ? " gov-wp-card--deleted" : ""}${isSelected ? " gov-wp-card--selected" : ""}`}
    >
      <div className="gov-wp-card__header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {onSelect && !pkg.isDeleted && (
            <input
              type="checkbox"
              checked={isSelected || false}
              onChange={(e) => onSelect(pkg.id, e.target.checked)}
              aria-label={`Select ${pkg.packageNumber}`}
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <PackageIcon size={18} />
            <strong style={{ fontSize: "14px", color: "var(--gov-primary-dark)", letterSpacing: "0.5px" }}>
              {pkg.packageNumber}
            </strong>
          </div>

          <span
            className={`gov-tag ${
              pkg.source === "AI_DECOMPOSED" || pkg.source === "AI_GENERATED"
                ? "gov-tag--ai"
                : pkg.source === "MANUAL"
                ? "gov-tag--manual"
                : "gov-tag--meta"
            }`}
          >
            {sourceLabel(pkg.source)}
          </span>

          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "12px",
              backgroundColor: pStyle.bg,
              color: pStyle.text,
              border: `1px solid ${pStyle.border}`,
            }}
          >
            {pkg.priority} PRIORITY
          </span>

          {complexityBadge(pkg.complexity)}

          <span className="gov-tag gov-tag--meta">{pkg.estimatedCategory || "General Procurement"}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {pkg.version !== undefined && pkg.version > 1 && (
            <span style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>v{pkg.version}</span>
          )}
          <StatusBadge
            tone={pkg.isDeleted ? "unavailable" : statusTone(pkg.status)}
            label={pkg.isDeleted ? "DELETED" : pkg.status.replace("_", " ")}
          />
        </div>
      </div>

      <h3 style={{ margin: "10px 0 6px", fontSize: "16px", fontWeight: 700, color: "var(--gov-text-primary)" }}>
        {pkg.title}
      </h3>

      <p style={{ margin: "0 0 12px", fontSize: "14px", color: "var(--gov-text-secondary)", lineHeight: "1.5" }}>
        {pkg.description}
      </p>

      {/* Scope Details */}
      {pkg.scope && (
        <div className="gov-callout-box" style={{ marginBottom: "12px" }}>
          <span className="gov-callout-box__label">Procurement Scope & Boundaries: </span>
          <span style={{ color: "var(--gov-text-primary)", fontSize: "13px" }}>{pkg.scope}</span>
        </div>
      )}

      {/* Deliverables */}
      {deliverables.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <strong style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--gov-text-muted)", display: "block", marginBottom: "6px", letterSpacing: "0.5px" }}>
            Key Deliverables ({deliverables.length}):
          </strong>
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "var(--gov-text-primary)" }}>
            {deliverables.map((item, idx) => (
              <li key={idx} style={{ marginBottom: "2px" }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mapped Requirements */}
      {requirements.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <strong style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--gov-text-muted)", display: "block", marginBottom: "6px", letterSpacing: "0.5px" }}>
            Mapped Requirements & Constraints ({requirements.length}):
          </strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {requirements.map((req, idx) => {
              const reqText = req.text || req.requirementText || "Requirement";
              const reqCategory = req.category || "General";
              const reqKey = req.id || req.requirementId || idx;
              return (
                <span
                  key={reqKey}
                  className="gov-tag"
                  style={{
                    fontSize: "12px",
                    maxWidth: "100%",
                    whiteSpace: "normal",
                    textAlign: "left",
                    lineHeight: "1.3",
                    padding: "4px 8px",
                    backgroundColor: "var(--gov-bg-muted)",
                    border: "1px solid var(--gov-border)",
                  }}
                  title={reqText}
                >
                  <strong style={{ color: "var(--gov-primary-dark)" }}>[{reqCategory}]</strong>{" "}
                  {reqText.length > 80 ? reqText.slice(0, 80) + "…" : reqText}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Dependencies */}
      {dependencies.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <strong style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--gov-text-muted)", display: "block", marginBottom: "6px", letterSpacing: "0.5px" }}>
            Pre-requisite Dependencies ({dependencies.length}):
          </strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {dependencies.map((dep, idx) => {
              const depKey = dep.id || dep.dependsOnPackageId || idx;
              const depNum = dep.packageNumber || dep.dependsOnPackageNumber || "WP";
              const depTitle = dep.title || dep.dependsOnPackageTitle || "";
              return (
                <span
                  key={depKey}
                  className="gov-tag gov-tag--meta"
                  style={{
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor: "#FFF8E1",
                    borderColor: "#FFE082",
                    color: "#F57F17",
                  }}
                >
                  ⛓ Depends on <strong>{depNum}</strong>: {depTitle}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes / Special Terms */}
      {pkg.notes && (
        <div style={{ fontSize: "12px", color: "var(--gov-text-secondary)", fontStyle: "italic", marginBottom: "12px" }}>
          <strong>Special Notes:</strong> {pkg.notes}
        </div>
      )}

      {/* AI Reasoning */}
      {pkg.aiReasoning && (
        <div className="gov-callout-box" style={{ marginBottom: "12px" }}>
          <span className="gov-callout-box__label">AI Decomposition Rationale: </span>
          <span style={{ color: "var(--gov-text-secondary)", fontSize: "13px" }}>{pkg.aiReasoning}</span>
        </div>
      )}

      {/* Rejection Reason */}
      {pkg.rejectionReason && (
        <div
          style={{
            backgroundColor: "var(--gov-danger-light)",
            borderLeft: "3px solid var(--gov-danger)",
            padding: "8px 12px",
            fontSize: "13px",
            color: "var(--gov-danger-dark)",
            marginBottom: "12px",
          }}
        >
          <strong>Official Rejection Rationale: </strong>
          {pkg.rejectionReason}
        </div>
      )}

      {/* Deleted Notice */}
      {pkg.isDeleted && (
        <div
          style={{
            backgroundColor: "#F5F5F5",
            borderLeft: "3px solid #757575",
            padding: "8px 12px",
            fontSize: "13px",
            color: "#616161",
            marginBottom: "12px",
          }}
        >
          <strong>Deleted from active scope.</strong>{" "}
          {pkg.deletedReason ? `Reason: ${pkg.deletedReason}` : ""}
        </div>
      )}

      {/* Action Toolbar */}
      <div className="gov-wp-card__footer">
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Supplier matching is offered only once the package is confirmed,
              which is the same gate the API enforces. Offering it earlier would
              put suppliers in front of an official against requirements the
              department has not yet agreed. */}
          {!pkg.isDeleted && pkg.status === "CONFIRMED" && onFindSuppliers !== undefined && (
            <button
              type="button"
              className="gov-btn gov-btn--primary gov-btn--sm"
              disabled={busy}
              onClick={() => onFindSuppliers(pkg.id)}
              title="Find eligible suppliers ranked against this work package"
            >
              <BuildingIcon size={14} />
              Find Suitable Vendors
            </button>
          )}

          {!pkg.isDeleted ? (
            <>
              {canEdit && pkg.status !== "ACCEPTED" && pkg.status !== "CONFIRMED" && (
                <button
                  type="button"
                  className="gov-btn gov-btn--success gov-btn--sm"
                  disabled={busy}
                  onClick={() => onAccept(pkg.id)}
                  title="Approve work package for procurement lot"
                >
                  <CheckIcon size={14} />
                  Accept
                </button>
              )}

              {canEdit && pkg.status !== "REJECTED" && (
                <button
                  type="button"
                  className="gov-btn gov-btn--danger gov-btn--sm"
                  disabled={busy}
                  onClick={() => onReject(pkg)}
                  title="Reject work package with official reason"
                >
                  <CloseIcon size={14} />
                  Reject
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  className="gov-btn gov-btn--secondary gov-btn--sm"
                  disabled={busy}
                  onClick={() => onEdit(pkg)}
                  title="Edit title, scope, deliverables, or dependencies"
                >
                  <EditIcon size={14} />
                  Edit
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  className="gov-btn gov-btn--secondary gov-btn--sm"
                  disabled={busy}
                  onClick={() => onSplit(pkg)}
                  title="Decompose into two or more smaller work packages"
                >
                  <GitBranchIcon size={14} />
                  Split
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  className="gov-btn gov-btn--tertiary gov-btn--sm"
                  disabled={busy}
                  onClick={() => onDuplicate(pkg.id)}
                  title="Duplicate this package"
                >
                  <CopyIcon size={14} />
                  Duplicate
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  className="gov-btn gov-btn--tertiary gov-btn--sm"
                  style={{ color: "var(--gov-danger)" }}
                  disabled={busy}
                  onClick={() => onDelete(pkg.id)}
                  title="Soft-delete work package"
                >
                  <TrashIcon size={14} />
                  Delete
                </button>
              )}
            </>
          ) : (
            canEdit && (
              <button
                type="button"
                className="gov-btn gov-btn--secondary gov-btn--sm"
                disabled={busy}
                onClick={() => onRestore(pkg.id)}
                title="Restore deleted package"
              >
                <UndoIcon size={14} />
                Restore Package
              </button>
            )
          )}

          <button
            type="button"
            className="gov-btn gov-btn--tertiary gov-btn--sm"
            onClick={() => onViewHistory(pkg)}
            title="View complete audit and version history"
          >
            <HistoryIcon size={14} />
            Audit History
          </button>
        </div>
      </div>
    </article>
  );
}
