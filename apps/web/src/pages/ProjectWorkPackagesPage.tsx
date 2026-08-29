import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  getRequirements,
  type ProjectRequirement,
} from "../api/requirements.js";
import {
  acceptWorkPackage,
  confirmWorkPackages,
  createManualPackage,
  createNoDecompositionPackage,
  duplicateWorkPackage,
  generateWorkPackages,
  getWorkPackages,
  mergeWorkPackages,
  rejectWorkPackage,
  restoreWorkPackage,
  softDeleteWorkPackage,
  splitWorkPackage,
  updateWorkPackage,
  type ManualPackageInput,
  type MergePackagesInput,
  type SplitChildInput,
  type UpdatePackageInput,
  type WorkPackageItem,
  type WorkPackagesView,
} from "../api/workPackages.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import {
  CheckCircleIcon,
  CheckIcon,
  FilterIcon,
  GitMergeIcon,
  HistoryIcon,
  LayersIcon,
  PackageIcon,
  PlusIcon,
  RefreshIcon,
  RobotIcon,
  SearchIcon,
  SparklesIcon,
} from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectSectionNav } from "../components/ProjectSectionNav.js";
import { ProjectStatusBadge } from "../components/ProjectStatusBadge.js";
import { RejectReasonDialog } from "../components/RejectReasonDialog.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { WorkPackageCard } from "../components/WorkPackageCard.js";
import { WorkPackageEditorModal } from "../components/WorkPackageEditorModal.js";
import { WorkPackageHistoryModal } from "../components/WorkPackageHistoryModal.js";
import { WorkPackageMergeModal } from "../components/WorkPackageMergeModal.js";
import { WorkPackageProvenanceModal } from "../components/WorkPackageProvenanceModal.js";
import { WorkPackageSplitModal } from "../components/WorkPackageSplitModal.js";

export function ProjectWorkPackagesPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id ?? "";
  const navigate = useNavigate();

  const [view, setView] = useState<WorkPackagesView | undefined>(undefined);
  const [requirements, setRequirements] = useState<ProjectRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  // Multi-select for merge
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<WorkPackageItem | undefined>(undefined);
  const [rejectingPackage, setRejectingPackage] = useState<WorkPackageItem | undefined>(undefined);
  const [splittingPackage, setSplittingPackage] = useState<WorkPackageItem | undefined>(undefined);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isProvenanceOpen, setIsProvenanceOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<WorkPackageItem | null | undefined>(undefined);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [wpData, reqData] = await Promise.all([
          getWorkPackages(projectId, includeDeleted, signal),
          getRequirements(projectId, signal).catch(() => ({ requirements: [] })),
        ]);
        setView(wpData);
        setRequirements(reqData.requirements || []);
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(
          caught instanceof Error ? caught.message : "Work packages could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [projectId, includeDeleted],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  async function perform(action: () => Promise<unknown>, successMessage?: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
      await load();
      if (successMessage !== undefined) setNotice(successMessage);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : caught instanceof Error
          ? caught.message
          : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const status = view?.projectStatus ?? "";
  const canDecompose =
    status === "REQUIREMENTS_CONFIRMED" || status === "WORK_PACKAGES_UNDER_REVIEW";
  const canEdit =
    status === "REQUIREMENTS_CONFIRMED" || status === "WORK_PACKAGES_UNDER_REVIEW";
  const isConfirmed = status === "WORK_PACKAGES_CONFIRMED";

  const allPackages = view?.packages ?? [];
  const latestAnalysis = view?.analyses[0];
  const summary = view?.summary;
  const activePackages = allPackages.filter((p) => !p.isDeleted);
  const acceptedCount = summary?.accepted ?? activePackages.filter((p) => p.status === "ACCEPTED" || p.status === "CONFIRMED").length;
  const awaitingCount = summary?.suggested ?? summary?.underReview ?? activePackages.filter((p) => p.status !== "ACCEPTED" && p.status !== "CONFIRMED" && p.status !== "REJECTED").length;
  const isReadyToConfirm = summary?.isReadyForConfirmation ?? (activePackages.length > 0 && activePackages.every((p) => p.status === "ACCEPTED" || p.status === "CONFIRMED"));

  // Filter packages
  const filteredPackages = useMemo(() => {
    return allPackages.filter((p) => {
      if (!includeDeleted && (p.isDeleted || p.status === "ARCHIVED" || p.status === "SUPERSEDED")) {
        return false;
      }

      if (statusFilter !== "ALL") {
        if (statusFilter === "UNDER_REVIEW") {
          const isReview =
            p.status === "UNDER_REVIEW" ||
            p.status === "AI_GENERATED" ||
            p.status === "MANUAL" ||
            p.status === "EDITED" ||
            p.status === "SUGGESTED";
          if (!isReview) return false;
        } else if (statusFilter === "ACCEPTED") {
          if (p.status !== "ACCEPTED" && p.status !== "CONFIRMED") return false;
        } else if (statusFilter === "REJECTED") {
          if (p.status !== "REJECTED") return false;
        } else if (statusFilter === "ARCHIVED") {
          if (p.status !== "ARCHIVED" && p.status !== "SUPERSEDED" && !p.isDeleted) return false;
        } else if (p.status !== statusFilter) {
          return false;
        }
      }

      if (priorityFilter !== "ALL" && p.priority !== priorityFilter) return false;

      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const matchesNumber = p.packageNumber.toLowerCase().includes(term);
        const matchesTitle = p.title.toLowerCase().includes(term);
        const matchesDesc = p.description.toLowerCase().includes(term);
        const matchesCategory = (p.estimatedCategory || "").toLowerCase().includes(term);
        const matchesDeliverable = (p.deliverables || []).some((d) => d.toLowerCase().includes(term));
        if (
          !matchesNumber &&
          !matchesTitle &&
          !matchesDesc &&
          !matchesCategory &&
          !matchesDeliverable
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allPackages, includeDeleted, statusFilter, priorityFilter, searchTerm]);

  // Selected packages for merge
  const selectedPackagesForMerge = useMemo(() => {
    return allPackages.filter((p) => selectedIds.includes(p.id) && !p.isDeleted && p.status !== "ARCHIVED");
  }, [allPackages, selectedIds]);

  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => (selected ? [...prev, id] : prev.filter((item) => item !== id)));
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredPackages.filter((p) => !p.isDeleted).length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPackages.filter((p) => !p.isDeleted).map((p) => p.id));
    }
  };

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Procurement Projects", to: "/projects" },
          { label: "Project", to: `/projects/${projectId}` },
          { label: "Work Packages" },
        ]}
      />

      <PageHeader
        title="Procurement Work Packages"
        subtitle="Decomposition of confirmed requirements into contract lots & tenderable components"
        action={view === undefined ? undefined : <ProjectStatusBadge status={status} />}
      />

      <ProjectSectionNav projectId={projectId} />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Action could not be completed">
          {error}
        </GovernmentAlert>
      )}

      {notice !== undefined && (
        <GovernmentAlert type="success" title="Notification">
          {notice}
        </GovernmentAlert>
      )}

      {loading && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--gov-text-secondary)" }}>
          Loading work packages and dependency structure from central registry…
        </div>
      )}

      {view !== undefined && (
        <>
          {/* AI Decomposition Header Banner */}
          <div className="gov-ai-banner">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <RobotIcon size={24} />
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      color: "var(--gov-primary-dark)",
                      fontWeight: 700,
                    }}
                  >
                    AI Work Package Decomposition Assistant
                  </h2>
                  <span style={{ fontSize: "12px", color: "var(--gov-text-secondary)" }}>
                    Rule-compliant contract lotting, dependency mapping, and scope structuring
                  </span>
                </div>
              </div>

              {latestAnalysis !== undefined && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <StatusBadge
                    tone={
                      latestAnalysis.status === "SUCCEEDED"
                        ? "operational"
                        : latestAnalysis.status === "FAILED"
                        ? "unavailable"
                        : "pending"
                    }
                    label={
                      latestAnalysis.status === "SUCCEEDED"
                        ? "Decomposition Succeeded"
                        : latestAnalysis.status === "FAILED"
                        ? "Decomposition Failed"
                        : "Pending"
                    }
                  />
                  <button
                    type="button"
                    className="gov-btn gov-btn--tertiary gov-btn--sm"
                    onClick={() => setIsProvenanceOpen(true)}
                  >
                    AI Provenance
                  </button>
                </div>
              )}
            </div>

            <dl className="gov-desc-list" style={{ marginBottom: "20px" }}>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Confirmed Requirements</dt>
                <dd className="gov-desc-val">{requirements.filter((r) => r.status === "ACCEPTED").length}</dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Active Work Packages</dt>
                <dd className="gov-desc-val">{allPackages.filter((p) => !p.isDeleted).length}</dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Accepted for Procurement</dt>
                <dd className="gov-desc-val" style={{ color: "var(--gov-success-dark)", fontWeight: 700 }}>
                  {acceptedCount} / {activePackages.length}
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Awaiting Review</dt>
                <dd className="gov-desc-val" style={{ color: "var(--gov-saffron-dark)" }}>
                  {awaitingCount}
                </dd>
              </div>
            </dl>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {canDecompose && (
                <button
                  type="button"
                  className="gov-btn gov-btn--primary"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => generateWorkPackages(projectId),
                      "AI Work Package decomposition generated successfully.",
                    )
                  }
                >
                  <SparklesIcon size={16} />
                  {allPackages.length === 0 ? "Generate Work Packages (AI)" : "Re-decompose Packages (AI)"}
                </button>
              )}

              {canDecompose && allPackages.length === 0 && (
                <button
                  type="button"
                  className="gov-btn gov-btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => createNoDecompositionPackage(projectId),
                      "Proceeded with single comprehensive procurement package.",
                    )
                  }
                >
                  <PackageIcon size={16} />
                  Proceed as Single Package (No Decomposition)
                </button>
              )}

              {canEdit && isReadyToConfirm && !isConfirmed && (
                <button
                  type="button"
                  className="gov-btn gov-btn--success"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => confirmWorkPackages(projectId),
                      "All work packages confirmed and locked for vendor discovery.",
                    )
                  }
                >
                  <CheckIcon size={16} />
                  Confirm & Finalize Work Packages
                </button>
              )}

              <button
                type="button"
                className="gov-btn gov-btn--tertiary"
                onClick={() => setHistoryTarget(null)}
              >
                <HistoryIcon size={16} />
                Project Stage & Audit Trail
              </button>
            </div>

            {canEdit && !isReadyToConfirm && allPackages.length > 0 && (
              <div style={{ marginTop: "14px" }}>
                <GovernmentAlert type="info" title="Human Review in Progress">
                  Every work package must be reviewed and accepted by an official before confirming the
                  procurement lots. {awaitingCount} package(s) are awaiting review.
                </GovernmentAlert>
              </div>
            )}

            {isConfirmed && (
              <div style={{ marginTop: "14px" }}>
                <GovernmentAlert type="success" title="Work Packages Confirmed">
                  Procurement work packages have been formally approved. This project is now ready for
                  vendor discovery and tender drafting.
                </GovernmentAlert>
              </div>
            )}
          </div>

          {/* Work Packages Management Card */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <LayersIcon size={20} />
                <span>Work Packages Directory ({filteredPackages.length})</span>
              </div>
            }
            subtitle="Review, approve, modify, merge, or split procurement components"
          >
            {/* Toolbar & Filters */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                padding: "12px",
                backgroundColor: "var(--gov-bg-alt)",
                borderRadius: "var(--gov-radius)",
                border: "1px solid var(--gov-border)",
              }}
            >
              {/* Search */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 240px" }}>
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    type="text"
                    className="gov-form-control"
                    style={{ paddingLeft: "32px" }}
                    placeholder="Search package number, title, scope..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--gov-text-muted)",
                      pointerEvents: "none",
                    }}
                  >
                    <SearchIcon size={16} />
                  </div>
                </div>
              </div>

              {/* Status Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <label className="gov-form-label" style={{ margin: 0, fontSize: "12px" }}>
                  Status:
                </label>
                <select
                  className="gov-form-control"
                  style={{ width: "auto", fontSize: "13px", padding: "4px 8px" }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Active Statuses</option>
                  <option value="UNDER_REVIEW">Awaiting Review</option>
                  <option value="ACCEPTED">Accepted / Confirmed</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ARCHIVED">Archived / Superseded</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <label className="gov-form-label" style={{ margin: 0, fontSize: "12px" }}>
                  Priority:
                </label>
                <select
                  className="gov-form-control"
                  style={{ width: "auto", fontSize: "13px", padding: "4px 8px" }}
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {/* Include Deleted Checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                  color: "var(--gov-text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => setIncludeDeleted(e.target.checked)}
                />
                Show Deleted / Superseded
              </label>

              {/* Actions: Add Manual, Merge */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {canEdit && selectedPackagesForMerge.length >= 2 && (
                  <button
                    type="button"
                    className="gov-btn gov-btn--primary gov-btn--sm"
                    onClick={() => setIsMergeOpen(true)}
                  >
                    <GitMergeIcon size={14} /> Merge Selected ({selectedPackagesForMerge.length})
                  </button>
                )}

                {canEdit && (
                  <button
                    type="button"
                    className="gov-btn gov-btn--secondary gov-btn--sm"
                    onClick={() => setIsCreateOpen(true)}
                  >
                    <PlusIcon size={14} /> Add Package Manually
                  </button>
                )}
              </div>
            </div>

            {/* Select All Bar if active packages exist */}
            {canEdit && filteredPackages.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 8px 12px",
                  fontSize: "12px",
                  color: "var(--gov-text-muted)",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.length > 0 &&
                      selectedIds.length === filteredPackages.filter((p) => !p.isDeleted).length
                    }
                    onChange={handleSelectAll}
                  />
                  Select all for consolidation
                </label>

                {selectedIds.length > 0 && (
                  <span>
                    {selectedIds.length} package(s) selected &bull;{" "}
                    {selectedIds.length >= 2 ? "Ready to merge" : "Select at least 2 to merge"}
                  </span>
                )}
              </div>
            )}

            {/* Package Cards List */}
            {filteredPackages.length === 0 ? (
              <div
                style={{
                  padding: "36px",
                  textAlign: "center",
                  backgroundColor: "var(--gov-bg-alt)",
                  borderRadius: "var(--gov-radius)",
                  border: "1px dashed var(--gov-border-strong)",
                }}
              >
                <PackageIcon size={32} />
                <h4 style={{ margin: "12px 0 6px", color: "var(--gov-text-primary)" }}>
                  No Work Packages Found
                </h4>
                <p style={{ margin: "0 0 16px", color: "var(--gov-text-secondary)", fontSize: "14px" }}>
                  {allPackages.length === 0
                    ? "Generate packages using the AI Assistant above or create packages manually."
                    : "No packages match the active search and filter criteria."}
                </p>
                {canDecompose && allPackages.length === 0 && (
                  <button
                    type="button"
                    className="gov-btn gov-btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () => generateWorkPackages(projectId),
                        "AI Work Package decomposition completed.",
                      )
                    }
                  >
                    <SparklesIcon size={16} /> Generate Work Packages (AI)
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {filteredPackages.map((pkg) => (
                  <WorkPackageCard
                    key={pkg.id}
                    pkg={pkg}
                    canEdit={canEdit}
                    busy={busy}
                    isSelected={selectedIds.includes(pkg.id)}
                    onSelect={handleSelect}
                    onFindSuppliers={(id) =>
                      navigate(`/projects/${projectId}/work-packages/${id}/suppliers`)
                    }
                    onAccept={(id) =>
                      void perform(
                        () => acceptWorkPackage(id),
                        `Work package ${pkg.packageNumber} accepted.`,
                      )
                    }
                    onReject={(target) => setRejectingPackage(target)}
                    onEdit={(target) => setEditingPackage(target)}
                    onDuplicate={(id) =>
                      void perform(
                        () => duplicateWorkPackage(id),
                        `Duplicated ${pkg.packageNumber}.`,
                      )
                    }
                    onSplit={(target) => setSplittingPackage(target)}
                    onDelete={(id) =>
                      void perform(
                        () => softDeleteWorkPackage(id),
                        `Work package ${pkg.packageNumber} deleted.`,
                      )
                    }
                    onRestore={(id) =>
                      void perform(
                        () => restoreWorkPackage(id),
                        `Work package ${pkg.packageNumber} restored.`,
                      )
                    }
                    onViewHistory={(target) => setHistoryTarget(target)}
                  />
                ))}
              </div>
            )}
          </GovernmentCard>
        </>
      )}

      {/* Manual / Editor Modal */}
      {isCreateOpen && (
        <WorkPackageEditorModal
          isOpen={isCreateOpen}
          allPackages={allPackages}
          allRequirements={requirements.filter((r) => r.status === "ACCEPTED")}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={async (data) => {
            await perform(
              () => createManualPackage(projectId, data as ManualPackageInput),
              "Manual work package created successfully.",
            );
          }}
        />
      )}

      {editingPackage !== undefined && (
        <WorkPackageEditorModal
          isOpen={editingPackage !== undefined}
          packageToEdit={editingPackage}
          allPackages={allPackages}
          allRequirements={requirements.filter((r) => r.status === "ACCEPTED")}
          onClose={() => setEditingPackage(undefined)}
          onSubmit={async (data) => {
            await perform(
              () => updateWorkPackage(editingPackage.id, data as UpdatePackageInput),
              `Work package ${editingPackage.packageNumber} updated.`,
            );
          }}
        />
      )}

      {/* Rejection Reason Modal */}
      {rejectingPackage !== undefined && (
        <RejectReasonDialog
          requirementText={`${rejectingPackage.packageNumber}: ${rejectingPackage.title}`}
          onCancel={() => setRejectingPackage(undefined)}
          onConfirm={(reason) => {
            const target = rejectingPackage;
            setRejectingPackage(undefined);
            void perform(
              () => rejectWorkPackage(target.id, reason),
              `Work package ${target.packageNumber} rejected and recorded.`,
            );
          }}
        />
      )}

      {/* Merge Modal */}
      {isMergeOpen && (
        <WorkPackageMergeModal
          isOpen={isMergeOpen}
          selectedPackages={selectedPackagesForMerge}
          projectId={projectId}
          onClose={() => {
            setIsMergeOpen(false);
            setSelectedIds([]);
          }}
          onConfirmMerge={async (data: MergePackagesInput) => {
            await perform(
              () => mergeWorkPackages(data),
              "Work packages merged into single consolidated component.",
            );
            setSelectedIds([]);
          }}
        />
      )}

      {/* Split Modal */}
      {splittingPackage !== undefined && (
        <WorkPackageSplitModal
          isOpen={splittingPackage !== undefined}
          packageToSplit={splittingPackage}
          onClose={() => setSplittingPackage(undefined)}
          onConfirmSplit={async (pkgId: string, splits: SplitChildInput[]) => {
            await perform(
              () => splitWorkPackage(pkgId, splits),
              `Work package split into ${splits.length} child packages.`,
            );
          }}
        />
      )}

      {/* History Modal */}
      {historyTarget !== undefined && (
        <WorkPackageHistoryModal
          isOpen={historyTarget !== undefined}
          targetPackage={historyTarget}
          historyEntries={view?.history ?? []}
          onClose={() => setHistoryTarget(undefined)}
        />
      )}

      {/* AI Provenance Modal */}
      {isProvenanceOpen && (
        <WorkPackageProvenanceModal
          isOpen={isProvenanceOpen}
          analyses={view?.analyses ?? []}
          onClose={() => setIsProvenanceOpen(false)}
        />
      )}
    </>
  );
}
