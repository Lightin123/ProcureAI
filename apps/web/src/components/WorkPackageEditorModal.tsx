import React, { useEffect, useState } from "react";
import type {
  ManualPackageInput,
  UpdatePackageInput,
  WorkPackageComplexity,
  WorkPackageItem,
  WorkPackagePriority,
} from "../api/workPackages.js";
import type { ProjectRequirement } from "../api/requirements.js";
import { GovernmentModal } from "./GovernmentModal.js";

interface WorkPackageEditorModalProps {
  isOpen: boolean;
  packageToEdit?: WorkPackageItem;
  allPackages: WorkPackageItem[];
  allRequirements: ProjectRequirement[];
  onClose: () => void;
  onSubmit: (data: ManualPackageInput | UpdatePackageInput) => Promise<void>;
}

const COMPLEXITIES: WorkPackageComplexity[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
const PRIORITIES: WorkPackagePriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export function WorkPackageEditorModal({
  isOpen,
  packageToEdit,
  allPackages,
  allRequirements,
  onClose,
  onSubmit,
}: WorkPackageEditorModalProps) {
  const isEditing = !!packageToEdit;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("");
  const [complexity, setComplexity] = useState<WorkPackageComplexity>("MEDIUM");
  const [priority, setPriority] = useState<WorkPackagePriority>("MEDIUM");
  const [estimatedCategory, setEstimatedCategory] = useState("General Procurement");
  const [deliverablesText, setDeliverablesText] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedReqIds, setSelectedReqIds] = useState<string[]>([]);
  const [selectedDepIds, setSelectedDepIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (packageToEdit) {
      setTitle(packageToEdit.title);
      setDescription(packageToEdit.description);
      setScope(packageToEdit.scope);
      setComplexity(packageToEdit.complexity);
      setPriority(packageToEdit.priority);
      setEstimatedCategory(packageToEdit.estimatedCategory);
      setDeliverablesText((packageToEdit.deliverables || []).join("\n"));
      setNotes(packageToEdit.notes ?? "");
      setSelectedReqIds(
        (packageToEdit.requirements || []).map((r) => r.id || r.requirementId || "").filter(Boolean),
      );
      setSelectedDepIds(
        (packageToEdit.dependencies || []).map((d) => d.id || d.dependsOnPackageId || "").filter(Boolean),
      );
    } else {
      setTitle("");
      setDescription("");
      setScope("");
      setComplexity("MEDIUM");
      setPriority("MEDIUM");
      setEstimatedCategory("General Procurement");
      setDeliverablesText("");
      setNotes("");
      setSelectedReqIds([]);
      setSelectedDepIds([]);
    }
    setError(undefined);
  }, [packageToEdit, isOpen]);

  const availableDependencies = allPackages.filter(
    (p) => !p.isDeleted && (!packageToEdit || p.id !== packageToEdit.id),
  );

  const toggleReq = (reqId: string) => {
    setSelectedReqIds((prev) =>
      prev.includes(reqId) ? prev.filter((id) => id !== reqId) : [...prev, reqId],
    );
  };

  const toggleDep = (depId: string) => {
    setSelectedDepIds((prev) =>
      prev.includes(depId) ? prev.filter((id) => id !== depId) : [...prev, depId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    const deliverables = deliverablesText
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    if (title.trim().length < 3) {
      setError("Title must be at least 3 characters long.");
      return;
    }
    if (description.trim().length < 5) {
      setError("Description must be at least 5 characters long.");
      return;
    }
    if (scope.trim().length < 5) {
      setError("Scope must be at least 5 characters long.");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        scope: scope.trim(),
        complexity,
        priority,
        estimatedCategory: estimatedCategory.trim() || "General Procurement",
        deliverables,
        notes: notes.trim() || undefined,
        requirementIds: selectedReqIds,
        dependencyIds: selectedDepIds,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save work package.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GovernmentModal
      isOpen={isOpen}
      title={isEditing ? `Edit Work Package (${packageToEdit?.packageNumber})` : "Create Manual Work Package"}
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
            disabled={busy}
          >
            {busy ? "Saving…" : isEditing ? "Update Package" : "Create Package"}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
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

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="wp-title">
            Package Title <span className="gov-form-required">*</span>
          </label>
          <input
            id="wp-title"
            type="text"
            className="gov-form-control"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Core System Integration & Cloud Hosting"
            required
          />
        </div>

        <div className="gov-form-grid">
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="wp-priority">
              Procurement Priority
            </label>
            <select
              id="wp-priority"
              className="gov-form-control"
              value={priority}
              onChange={(e) => setPriority(e.target.value as WorkPackagePriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="wp-complexity">
              Estimated Complexity
            </label>
            <select
              id="wp-complexity"
              className="gov-form-control"
              value={complexity}
              onChange={(e) => setComplexity(e.target.value as WorkPackageComplexity)}
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
          <label className="gov-form-label" htmlFor="wp-category">
            Estimated Procurement Category
          </label>
          <input
            id="wp-category"
            type="text"
            className="gov-form-control"
            value={estimatedCategory}
            onChange={(e) => setEstimatedCategory(e.target.value)}
            placeholder="e.g. IT Software, Hardware, Consulting, Civil Works"
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="wp-desc">
            Package Description <span className="gov-form-required">*</span>
          </label>
          <textarea
            id="wp-desc"
            className="gov-form-control"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed narrative describing this procurement package..."
            required
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="wp-scope">
            Scope & Boundaries <span className="gov-form-required">*</span>
          </label>
          <textarea
            id="wp-scope"
            className="gov-form-control"
            rows={3}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="Explicitly list what is in-scope and out-of-scope for this contract..."
            required
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="wp-deliverables">
            Deliverables (One per line)
          </label>
          <textarea
            id="wp-deliverables"
            className="gov-form-control"
            rows={3}
            value={deliverablesText}
            onChange={(e) => setDeliverablesText(e.target.value)}
            placeholder="SRS Document&#10;Software Source Code&#10;UAT Sign-off Report"
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="wp-notes">
            Special Notes / Contract Terms
          </label>
          <textarea
            id="wp-notes"
            className="gov-form-control"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes, GFR/CVC guidelines, or bidder eligibility conditions..."
          />
        </div>

        {/* Requirements Mapping */}
        {allRequirements.length > 0 && (
          <div className="gov-form-group">
            <label className="gov-form-label">
              Map Confirmed Project Requirements ({selectedReqIds.length} selected)
            </label>
            <div
              style={{
                maxHeight: "150px",
                overflowY: "auto",
                border: "1px solid var(--gov-border)",
                borderRadius: "var(--gov-radius)",
                padding: "8px",
                backgroundColor: "var(--gov-bg-alt)",
              }}
            >
              {allRequirements.map((req) => (
                <label
                  key={req.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    padding: "4px 0",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedReqIds.includes(req.id)}
                    onChange={() => toggleReq(req.id)}
                    style={{ marginTop: "3px" }}
                  />
                  <span>
                    <strong style={{ color: "var(--gov-primary-dark)" }}>[{req.category}]</strong>{" "}
                    {req.text}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Dependency Mapping */}
        {availableDependencies.length > 0 && (
          <div className="gov-form-group">
            <label className="gov-form-label">
              Prerequisite Dependencies ({selectedDepIds.length} selected)
            </label>
            <div
              style={{
                maxHeight: "130px",
                overflowY: "auto",
                border: "1px solid var(--gov-border)",
                borderRadius: "var(--gov-radius)",
                padding: "8px",
                backgroundColor: "var(--gov-bg-alt)",
              }}
            >
              {availableDependencies.map((dep) => (
                <label
                  key={dep.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "4px 0",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDepIds.includes(dep.id)}
                    onChange={() => toggleDep(dep.id)}
                  />
                  <span>
                    <strong>{dep.packageNumber}</strong>: {dep.title}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </form>
    </GovernmentModal>
  );
}
