import React, { useEffect, useState } from "react";
import type {
  MergePackagesInput,
  WorkPackageComplexity,
  WorkPackageItem,
  WorkPackagePriority,
} from "../api/workPackages.js";
import { GovernmentModal } from "./GovernmentModal.js";

interface WorkPackageMergeModalProps {
  isOpen: boolean;
  selectedPackages: WorkPackageItem[];
  projectId: string;
  onClose: () => void;
  onConfirmMerge: (data: MergePackagesInput) => Promise<void>;
}

const COMPLEXITIES: WorkPackageComplexity[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
const PRIORITIES: WorkPackagePriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export function WorkPackageMergeModal({
  isOpen,
  selectedPackages,
  projectId,
  onClose,
  onConfirmMerge,
}: WorkPackageMergeModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("");
  const [complexity, setComplexity] = useState<WorkPackageComplexity>("HIGH");
  const [priority, setPriority] = useState<WorkPackagePriority>("HIGH");
  const [estimatedCategory, setEstimatedCategory] = useState("Consolidated Procurement");
  const [deliverablesText, setDeliverablesText] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (selectedPackages.length >= 2) {
      setTitle(`Consolidated: ${selectedPackages.map((p) => p.title).join(" + ")}`);
      setDescription(
        `Merged work package combining: ${selectedPackages
          .map((p) => `${p.packageNumber} (${p.title})`)
          .join(", ")}.\n\n` +
          selectedPackages.map((p) => `--- ${p.packageNumber} Scope ---\n${p.description}`).join("\n\n"),
      );
      setScope(
        selectedPackages.map((p) => `Scope of ${p.packageNumber}:\n${p.scope}`).join("\n\n"),
      );
      const allDeliverables = Array.from(
        new Set(selectedPackages.flatMap((p) => p.deliverables || [])),
      );
      setDeliverablesText(allDeliverables.join("\n"));
      setEstimatedCategory(selectedPackages[0]?.estimatedCategory || "Consolidated Procurement");
      setNotes(`Formed by merging: ${selectedPackages.map((p) => p.packageNumber).join(", ")}.`);
    }
    setError(undefined);
  }, [selectedPackages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (selectedPackages.length < 2) {
      setError("Please select at least 2 packages to merge.");
      return;
    }

    const deliverables = deliverablesText
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    setBusy(true);
    try {
      await onConfirmMerge({
        projectId,
        packageIds: selectedPackages.map((p) => p.id),
        title: title.trim(),
        description: description.trim(),
        scope: scope.trim(),
        complexity,
        priority,
        estimatedCategory: estimatedCategory.trim() || "Consolidated Procurement",
        deliverables,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to merge packages.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GovernmentModal
      isOpen={isOpen}
      title={`Merge ${selectedPackages.length} Work Packages into Single Contract Lot`}
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
            disabled={busy || selectedPackages.length < 2}
          >
            {busy ? "Merging Packages…" : "Confirm and Merge"}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div
          style={{
            backgroundColor: "var(--gov-primary-subtle)",
            border: "1px solid #BBDEFB",
            padding: "10px 14px",
            borderRadius: "var(--gov-radius)",
            marginBottom: "16px",
            fontSize: "13px",
            color: "var(--gov-primary-dark)",
          }}
        >
          <strong>Packages to be consolidated:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: "20px" }}>
            {selectedPackages.map((p) => (
              <li key={p.id}>
                <strong>{p.packageNumber}</strong>: {p.title} (
                {(p.requirements || []).length} mapped requirements)
              </li>
            ))}
          </ul>
          <span style={{ display: "block", marginTop: "6px", fontSize: "12px", color: "var(--gov-text-secondary)" }}>
            * Original packages will be marked as SUPERSEDED. All requirement mappings and dependency relations will be inherited.
          </span>
        </div>

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
          <label className="gov-form-label" htmlFor="merge-title">
            Consolidated Package Title <span className="gov-form-required">*</span>
          </label>
          <input
            id="merge-title"
            type="text"
            className="gov-form-control"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="gov-form-grid">
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="merge-priority">
              Priority
            </label>
            <select
              id="merge-priority"
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
            <label className="gov-form-label" htmlFor="merge-complexity">
              Complexity
            </label>
            <select
              id="merge-complexity"
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
          <label className="gov-form-label" htmlFor="merge-category">
            Procurement Category
          </label>
          <input
            id="merge-category"
            type="text"
            className="gov-form-control"
            value={estimatedCategory}
            onChange={(e) => setEstimatedCategory(e.target.value)}
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="merge-desc">
            Consolidated Description <span className="gov-form-required">*</span>
          </label>
          <textarea
            id="merge-desc"
            className="gov-form-control"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="merge-scope">
            Consolidated Scope & Boundaries <span className="gov-form-required">*</span>
          </label>
          <textarea
            id="merge-scope"
            className="gov-form-control"
            rows={3}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            required
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="merge-deliverables">
            Merged Deliverables (One per line)
          </label>
          <textarea
            id="merge-deliverables"
            className="gov-form-control"
            rows={3}
            value={deliverablesText}
            onChange={(e) => setDeliverablesText(e.target.value)}
          />
        </div>
      </form>
    </GovernmentModal>
  );
}
