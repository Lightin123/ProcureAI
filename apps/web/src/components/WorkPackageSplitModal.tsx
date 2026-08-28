import React, { useEffect, useState } from "react";
import type {
  SplitChildInput,
  WorkPackageComplexity,
  WorkPackageItem,
  WorkPackagePriority,
} from "../api/workPackages.js";
import { GovernmentModal } from "./GovernmentModal.js";
import { PlusIcon, TrashIcon } from "./GovernmentIcons.js";

interface WorkPackageSplitModalProps {
  isOpen: boolean;
  packageToSplit?: WorkPackageItem;
  onClose: () => void;
  onConfirmSplit: (packageId: string, splits: SplitChildInput[]) => Promise<void>;
}

const COMPLEXITIES: WorkPackageComplexity[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
const PRIORITIES: WorkPackagePriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export function WorkPackageSplitModal({
  isOpen,
  packageToSplit,
  onClose,
  onConfirmSplit,
}: WorkPackageSplitModalProps) {
  const [splits, setSplits] = useState<
    Array<{
      title: string;
      description: string;
      scope: string;
      complexity: WorkPackageComplexity;
      priority: WorkPackagePriority;
      estimatedCategory: string;
      deliverablesText: string;
      selectedReqIds: string[];
    }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (packageToSplit) {
      const reqs = packageToSplit.requirements || [];
      const delivs = packageToSplit.deliverables || [];
      const halfReqs = Math.ceil(reqs.length / 2);
      const reqIds1 = reqs.slice(0, halfReqs).map((r) => r.id || r.requirementId || "").filter(Boolean);
      const reqIds2 = reqs.slice(halfReqs).map((r) => r.id || r.requirementId || "").filter(Boolean);

      setSplits([
        {
          title: `${packageToSplit.title} - Part 1`,
          description: `${packageToSplit.description} (Component 1)`,
          scope: packageToSplit.scope,
          complexity: packageToSplit.complexity,
          priority: packageToSplit.priority,
          estimatedCategory: packageToSplit.estimatedCategory,
          deliverablesText: delivs.slice(0, Math.ceil(delivs.length / 2)).join("\n"),
          selectedReqIds: reqIds1,
        },
        {
          title: `${packageToSplit.title} - Part 2`,
          description: `${packageToSplit.description} (Component 2)`,
          scope: packageToSplit.scope,
          complexity: packageToSplit.complexity,
          priority: packageToSplit.priority,
          estimatedCategory: packageToSplit.estimatedCategory,
          deliverablesText: delivs.slice(Math.ceil(delivs.length / 2)).join("\n"),
          selectedReqIds: reqIds2,
        },
      ]);
    }
    setError(undefined);
  }, [packageToSplit, isOpen]);

  const addSplitPart = () => {
    if (!packageToSplit) return;
    setSplits((prev) => [
      ...prev,
      {
        title: `${packageToSplit.title} - Part ${prev.length + 1}`,
        description: `Component ${prev.length + 1} of ${packageToSplit.packageNumber}`,
        scope: packageToSplit.scope,
        complexity: "MEDIUM",
        priority: "MEDIUM",
        estimatedCategory: packageToSplit.estimatedCategory,
        deliverablesText: "",
        selectedReqIds: [],
      },
    ]);
  };

  const removeSplitPart = (index: number) => {
    if (splits.length <= 2) return;
    setSplits((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateSplit = (index: number, fields: Partial<(typeof splits)[0]>) => {
    setSplits((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...fields } : item)),
    );
  };

  const toggleSplitReq = (splitIdx: number, reqId: string) => {
    const current = splits[splitIdx]?.selectedReqIds || [];
    const updated = current.includes(reqId)
      ? current.filter((id) => id !== reqId)
      : [...current, reqId];
    updateSplit(splitIdx, { selectedReqIds: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packageToSplit) return;
    setError(undefined);

    for (let i = 0; i < splits.length; i++) {
      const s = splits[i];
      if (!s) continue;
      if (s.title.trim().length < 3) {
        setError(`Part ${i + 1} must have a title with at least 3 characters.`);
        return;
      }
      if (s.description.trim().length < 5) {
        setError(`Part ${i + 1} must have a description with at least 5 characters.`);
        return;
      }
    }

    const payload: SplitChildInput[] = splits.map((s) => ({
      title: s.title.trim(),
      description: s.description.trim(),
      scope: s.scope.trim() || packageToSplit.scope,
      complexity: s.complexity,
      priority: s.priority,
      estimatedCategory: s.estimatedCategory.trim() || packageToSplit.estimatedCategory,
      deliverables: s.deliverablesText
        .split("\n")
        .map((d) => d.trim())
        .filter((d) => d.length > 0),
      requirementIds: s.selectedReqIds,
    }));

    setBusy(true);
    try {
      await onConfirmSplit(packageToSplit.id, payload);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to split package.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GovernmentModal
      isOpen={isOpen}
      title={`Split Work Package: ${packageToSplit?.packageNumber} (${packageToSplit?.title})`}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button type="button" className="gov-btn gov-btn--tertiary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="gov-btn gov-btn--primary"
            onClick={handleSubmit}
            disabled={busy || splits.length < 2}
          >
            {busy ? "Splitting…" : `Decompose into ${splits.length} Packages`}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--gov-text-secondary)" }}>
          Original package <strong>{packageToSplit?.packageNumber}</strong> will be marked as{" "}
          <span className="gov-tag gov-tag--meta">SUPERSEDED</span>, and replaced by the new child
          work packages below.
        </p>

        {error && (
          <div
            style={{
              backgroundColor: "var(--gov-danger-light)",
              border: "1px solid var(--gov-danger)",
              color: "var(--gov-danger-dark)",
              padding: "10px",
              borderRadius: "var(--gov-radius)",
              marginBottom: "16px",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {splits.map((split, idx) => (
            <div
              key={idx}
              style={{
                border: "1px solid var(--gov-border-strong)",
                borderRadius: "var(--gov-radius)",
                padding: "14px",
                backgroundColor: "var(--gov-bg-surface)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <strong style={{ color: "var(--gov-primary-dark)", fontSize: "14px" }}>
                  Child Package #{idx + 1}
                </strong>
                {splits.length > 2 && (
                  <button
                    type="button"
                    className="gov-btn gov-btn--tertiary gov-btn--sm"
                    style={{ color: "var(--gov-danger)" }}
                    onClick={() => removeSplitPart(idx)}
                  >
                    <TrashIcon size={14} /> Remove Part
                  </button>
                )}
              </div>

              <div className="gov-form-group">
                <label className="gov-form-label" htmlFor={`split-title-${idx}`}>
                  Title <span className="gov-form-required">*</span>
                </label>
                <input
                  id={`split-title-${idx}`}
                  type="text"
                  className="gov-form-control"
                  value={split.title}
                  onChange={(e) => updateSplit(idx, { title: e.target.value })}
                  required
                />
              </div>

              <div className="gov-form-grid">
                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor={`split-priority-${idx}`}>
                    Priority
                  </label>
                  <select
                    id={`split-priority-${idx}`}
                    className="gov-form-control"
                    value={split.priority}
                    onChange={(e) =>
                      updateSplit(idx, { priority: e.target.value as WorkPackagePriority })
                    }
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor={`split-complexity-${idx}`}>
                    Complexity
                  </label>
                  <select
                    id={`split-complexity-${idx}`}
                    className="gov-form-control"
                    value={split.complexity}
                    onChange={(e) =>
                      updateSplit(idx, { complexity: e.target.value as WorkPackageComplexity })
                    }
                  >
                    {COMPLEXITIES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="gov-form-group">
                <label className="gov-form-label" htmlFor={`split-desc-${idx}`}>
                  Description <span className="gov-form-required">*</span>
                </label>
                <textarea
                  id={`split-desc-${idx}`}
                  className="gov-form-control"
                  rows={2}
                  value={split.description}
                  onChange={(e) => updateSplit(idx, { description: e.target.value })}
                  required
                />
              </div>

              <div className="gov-form-group">
                <label className="gov-form-label" htmlFor={`split-scope-${idx}`}>
                  Scope
                </label>
                <textarea
                  id={`split-scope-${idx}`}
                  className="gov-form-control"
                  rows={2}
                  value={split.scope}
                  onChange={(e) => updateSplit(idx, { scope: e.target.value })}
                />
              </div>

              <div className="gov-form-group">
                <label className="gov-form-label" htmlFor={`split-deliv-${idx}`}>
                  Deliverables (One per line)
                </label>
                <textarea
                  id={`split-deliv-${idx}`}
                  className="gov-form-control"
                  rows={2}
                  value={split.deliverablesText}
                  onChange={(e) => updateSplit(idx, { deliverablesText: e.target.value })}
                />
              </div>

              {packageToSplit && (packageToSplit.requirements || []).length > 0 && (
                <div className="gov-form-group">
                  <label className="gov-form-label">
                    Map Requirements to this Child Package ({split.selectedReqIds.length} assigned)
                  </label>
                  <div
                    style={{
                      maxHeight: "100px",
                      overflowY: "auto",
                      border: "1px solid var(--gov-border)",
                      padding: "6px",
                      borderRadius: "var(--gov-radius)",
                      backgroundColor: "var(--gov-bg-alt)",
                    }}
                  >
                    {(packageToSplit.requirements || []).map((req, rIdx) => {
                      const reqKey = req.id || req.requirementId || `r-${rIdx}`;
                      const reqText = req.text || req.requirementText || "Requirement";
                      const reqCat = req.category || "General";
                      return (
                        <label
                          key={reqKey}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "12px",
                            padding: "2px 0",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={split.selectedReqIds.includes(reqKey)}
                            onChange={() => toggleSplitReq(idx, reqKey)}
                          />
                          <span>
                            <strong>[{reqCat}]</strong> {reqText}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: "14px" }}>
          <button
            type="button"
            className="gov-btn gov-btn--secondary gov-btn--sm"
            onClick={addSplitPart}
          >
            <PlusIcon size={14} /> Add Another Component Part
          </button>
        </div>
      </form>
    </GovernmentModal>
  );
}
