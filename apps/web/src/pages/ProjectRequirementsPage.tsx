import React, { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  addRequirement,
  answerClarification,
  confirmRequirements,
  decideRequirement,
  getRequirements,
  reopenRequirements,
  runAnalysis,
  type ProjectRequirement,
  type RequirementCategory,
  type RequirementKind,
  type RequirementsView,
} from "../api/requirements.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import {
  RobotIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  PlusIcon,
  EditIcon,
  CheckIcon,
  CloseIcon,
} from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectSectionNav } from "../components/ProjectSectionNav.js";
import { ProjectStatusBadge } from "../components/ProjectStatusBadge.js";
import { RejectReasonDialog } from "../components/RejectReasonDialog.js";
import { StatusBadge } from "../components/StatusBadge.js";

const KINDS: RequirementKind[] = ["REQUIREMENT", "CONSTRAINT"];
const CATEGORIES: RequirementCategory[] = [
  "FUNCTIONAL",
  "NON_FUNCTIONAL",
  "BUDGET",
  "TIMELINE",
  "COMPLIANCE",
  "OTHER",
];

const CATEGORY_LABELS: Record<string, string> = {
  FUNCTIONAL: "Functional",
  NON_FUNCTIONAL: "Non-Functional",
  BUDGET: "Budget",
  TIMELINE: "Timeline",
  COMPLIANCE: "Compliance",
  OTHER: "Other",
};

function requirementTone(status: string) {
  if (status === "ACCEPTED") return "operational" as const;
  if (status === "REJECTED") return "unavailable" as const;
  return "pending" as const;
}

function requirementLabel(status: string) {
  if (status === "ACCEPTED") return "Accepted";
  if (status === "REJECTED") return "Rejected";
  return "Awaiting Review";
}

export function ProjectRequirementsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id ?? "";

  const [view, setView] = useState<RequirementsView | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [rejecting, setRejecting] = useState<ProjectRequirement | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [editText, setEditText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [newKind, setNewKind] = useState<RequirementKind>("REQUIREMENT");
  const [newCategory, setNewCategory] = useState<RequirementCategory>("FUNCTIONAL");
  const [newText, setNewText] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await getRequirements(projectId, signal);
        setView(data);
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(caught instanceof Error ? caught.message : "Requirements could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [projectId],
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
  const canAnalyse = status === "DRAFT" || status === "REQUIREMENTS_ANALYSIS";
  const canConfirm = status === "REQUIREMENTS_ANALYSIS";
  const canReopen = status === "REQUIREMENTS_CONFIRMED";
  const openClarifications = (view?.clarifications ?? []).filter((item) => item.status === "OPEN");
  const latestRun = view?.analysisRuns[0];

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Procurement Projects", to: "/projects" },
          { label: "Project", to: `/projects/${projectId}` },
          { label: "Requirements & AI Analysis" },
        ]}
      />

      <PageHeader
        title="Requirements & AI Analysis"
        subtitle="AI-Assisted Requirement Structuring with Human Decision-Making"
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
          Loading AI requirements & clarification questions from central server…
        </div>
      )}

      {view !== undefined && (
        <>
          {/* AI Requirement Analysis Panel */}
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
                  <h2 style={{ margin: 0, fontSize: "18px", color: "var(--gov-primary-dark)", fontWeight: 700 }}>
                    AI Requirement Analysis Assistant
                  </h2>
                  <span style={{ fontSize: "12px", color: "var(--gov-text-secondary)" }}>
                    Automated extraction, classification, and constraint mapping
                  </span>
                </div>
              </div>

              {latestRun !== undefined && (
                <StatusBadge
                  tone={latestRun.status === "SUCCEEDED" ? "operational" : latestRun.status === "FAILED" ? "unavailable" : "pending"}
                  label={latestRun.status === "SUCCEEDED" ? "Analysis Succeeded" : latestRun.status === "FAILED" ? "Analysis Failed" : "Pending"}
                />
              )}
            </div>

            <dl className="gov-desc-list" style={{ marginBottom: "20px" }}>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Last Analysis Execution</dt>
                <dd className="gov-desc-val">
                  {latestRun === undefined
                    ? "Not yet executed"
                    : `${new Date(latestRun.createdAt).toLocaleString("en-IN", { hour12: true })}`}
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Triggered By Official</dt>
                <dd className="gov-desc-val">
                  {latestRun ? latestRun.triggeredByName : "—"}
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Model & Provider</dt>
                <dd className="gov-desc-val gov-desc-val--mono">
                  {latestRun ? `${latestRun.model ?? "—"} (${latestRun.provider ?? "default"})` : "—"}
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Total Analysis Runs</dt>
                <dd className="gov-desc-val">{view.analysisRuns.length}</dd>
              </div>
            </dl>

            {latestRun?.errorMessage && (
              <GovernmentAlert type="danger" title="Analysis Error">
                {latestRun.errorMessage}
              </GovernmentAlert>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="gov-btn gov-btn--primary"
                disabled={busy || !canAnalyse}
                onClick={() =>
                  void perform(
                    () => runAnalysis(projectId),
                    "AI Analysis completed. Review the structured suggestions below.",
                  )
                }
              >
                <RobotIcon size={16} />
                {busy ? "Running Analysis…" : latestRun === undefined ? "Run AI Analysis" : "Re-run Analysis"}
              </button>

              {canConfirm && (
                <button
                  type="button"
                  className="gov-btn gov-btn--success"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const result = await confirmRequirements(projectId);
                      if (result.unansweredClarifications > 0) {
                        setNotice(
                          `Requirements confirmed with ${result.unansweredClarifications} unanswered clarification question(s).`,
                        );
                      }
                    }, "Requirements confirmed and finalized.")
                  }
                >
                  <CheckIcon size={16} />
                  Confirm Requirements
                </button>
              )}

              {canReopen && (
                <button
                  type="button"
                  className="gov-btn gov-btn--tertiary"
                  disabled={busy}
                  onClick={() =>
                    void perform(() => reopenRequirements(projectId), "Requirements reopened for revision.")
                  }
                >
                  Reopen Requirements
                </button>
              )}
            </div>

            {canConfirm && openClarifications.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <GovernmentAlert type="warning" title="Unanswered Clarifications">
                  {openClarifications.length} question(s) remain unanswered. You may confirm now,
                  or provide answers below to complete the procurement record.
                </GovernmentAlert>
              </div>
            )}
          </div>

          {/* Clarification Questions Section */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircleIcon size={20} />
                <span>Clarification Questions ({view.clarifications.length})</span>
              </div>
            }
            subtitle="AI-detected ambiguities and missing information requiring official inputs"
          >
            {view.clarifications.length === 0 && (
              <p style={{ color: "var(--gov-text-secondary)", fontStyle: "italic", margin: 0 }}>
                No clarification questions have been raised. Run AI analysis to identify potential gaps.
              </p>
            )}

            {view.clarifications.map((question, idx) => (
              <article className="gov-question-card" key={question.id}>
                <div className="gov-question-card__header">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="gov-question-num">Question #{idx + 1}</span>
                    <span className="gov-tag gov-tag--ai">AI-Suggested</span>
                  </div>
                  <StatusBadge
                    tone={question.status === "ANSWERED" ? "operational" : "pending"}
                    label={question.status === "ANSWERED" ? "Answered" : "Open"}
                  />
                </div>

                <h3 className="gov-question-text">{question.question}</h3>

                {question.rationale !== null && (
                  <div className="gov-callout-box">
                    <span className="gov-callout-box__label">Why this matters: </span>
                    {question.rationale}
                  </div>
                )}

                {question.status === "ANSWERED" ? (
                  <div
                    style={{
                      backgroundColor: "var(--gov-success-light)",
                      border: "1px solid #C8E6C9",
                      padding: "12px 16px",
                      borderRadius: "var(--gov-radius)",
                      marginTop: "10px",
                    }}
                  >
                    <strong style={{ color: "var(--gov-success-dark)", display: "block", marginBottom: "4px" }}>
                      Official Answer Recorded:
                    </strong>
                    <p style={{ margin: 0, color: "var(--gov-text-primary)" }}>{question.answerText}</p>
                  </div>
                ) : (
                  <div style={{ marginTop: "14px" }}>
                    <label
                      className="gov-form-label"
                      htmlFor={`answer-${question.id}`}
                    >
                      Official Response / Clarification
                    </label>
                    <textarea
                      id={`answer-${question.id}`}
                      className="gov-form-control"
                      rows={3}
                      value={answers[question.id] ?? ""}
                      placeholder="Type the official answer or department clarification..."
                      onChange={(event) =>
                        setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                      }
                    />
                    <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="gov-btn gov-btn--primary gov-btn--sm"
                        disabled={busy || (answers[question.id] ?? "").trim() === ""}
                        onClick={() =>
                          void perform(
                            () =>
                              answerClarification(
                                projectId,
                                question.id,
                                (answers[question.id] ?? "").trim(),
                              ),
                            "Answer recorded into official project log.",
                          )
                        }
                      >
                        Save Official Answer
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </GovernmentCard>

          {/* Requirements & Constraints Section */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircleIcon size={20} />
                <span>Requirements & Constraints ({view.requirements.length})</span>
              </div>
            }
            subtitle="Review, modify, approve, or reject extracted specifications"
          >
            {view.requirements.length === 0 && (
              <p style={{ color: "var(--gov-text-secondary)", fontStyle: "italic", margin: 0 }}>
                No requirements recorded yet. Run AI analysis above or add one manually below.
              </p>
            )}

            {view.requirements.map((requirement) => (
              <article className="gov-requirement-card" key={requirement.id}>
                <div className="gov-requirement-card__header">
                  {requirement.source === "AI_SUGGESTED" ? (
                    <span className="gov-tag gov-tag--ai">AI-Suggested</span>
                  ) : (
                    <span className="gov-tag gov-tag--manual">Added by Official</span>
                  )}
                  <span className="gov-tag gov-tag--meta">
                    {requirement.kind === "CONSTRAINT" ? "Constraint" : "Requirement"} ·{" "}
                    {CATEGORY_LABELS[requirement.category] ?? requirement.category}
                  </span>
                  <StatusBadge
                    tone={requirementTone(requirement.status)}
                    label={requirementLabel(requirement.status)}
                  />
                </div>

                {editingId === requirement.id ? (
                  <div style={{ marginTop: "12px" }}>
                    <label className="gov-form-label" htmlFor={`edit-${requirement.id}`}>
                      Edit Specification Text
                    </label>
                    <textarea
                      id={`edit-${requirement.id}`}
                      className="gov-form-control"
                      rows={3}
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                    />
                    <div style={{ marginTop: "10px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="gov-btn gov-btn--tertiary gov-btn--sm"
                        onClick={() => setEditingId(undefined)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="gov-btn gov-btn--primary gov-btn--sm"
                        disabled={busy || editText.trim().length < 5}
                        onClick={() =>
                          void perform(async () => {
                            await decideRequirement(projectId, requirement.id, {
                              action: "edit",
                              text: editText.trim(),
                            });
                            setEditingId(undefined);
                          }, "Requirement updated and accepted.")
                        }
                      >
                        Save and Accept
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--gov-text-primary)", margin: "0 0 8px" }}>
                      {requirement.text}
                    </p>

                    {requirement.edited && (
                      <p style={{ fontSize: "12px", color: "var(--gov-saffron-dark)", margin: "0 0 6px" }}>
                        Edited by official. Original AI suggestion: “{requirement.originalText}”
                      </p>
                    )}

                    {requirement.rationale !== null && (
                      <div className="gov-callout-box">
                        <span className="gov-callout-box__label">Technical Basis / Rationale: </span>
                        {requirement.rationale}
                      </div>
                    )}

                    {requirement.rejectionReason !== null && (
                      <div
                        style={{
                          backgroundColor: "var(--gov-danger-light)",
                          borderLeft: "3px solid var(--gov-danger)",
                          padding: "8px 12px",
                          fontSize: "13px",
                          color: "var(--gov-danger-dark)",
                          margin: "8px 0 12px",
                        }}
                      >
                        <strong>Rejection Reason: </strong>
                        {requirement.rejectionReason}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="gov-btn gov-btn--success gov-btn--sm"
                        disabled={busy || requirement.status === "ACCEPTED"}
                        onClick={() =>
                          void perform(
                            () => decideRequirement(projectId, requirement.id, { action: "accept" }),
                            "Requirement approved and accepted.",
                          )
                        }
                      >
                        <CheckIcon size={14} />
                        Accept
                      </button>
                      <button
                        type="button"
                        className="gov-btn gov-btn--secondary gov-btn--sm"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(requirement.id);
                          setEditText(requirement.text);
                        }}
                      >
                        <EditIcon size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="gov-btn gov-btn--danger gov-btn--sm"
                        disabled={busy || requirement.status === "REJECTED"}
                        onClick={() => setRejecting(requirement)}
                      >
                        <CloseIcon size={14} />
                        Reject
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </GovernmentCard>

          {/* Add Requirement Manually */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <PlusIcon size={20} />
                <span>Add Specification Manually</span>
              </div>
            }
            subtitle="Official manual insertion into the procurement record"
          >
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void perform(async () => {
                  await addRequirement(projectId, {
                    kind: newKind,
                    category: newCategory,
                    text: newText.trim(),
                  });
                  setNewText("");
                }, "Requirement added to register.");
              }}
            >
              <div className="gov-form-grid">
                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="new-kind">
                    Specification Type
                  </label>
                  <select
                    id="new-kind"
                    className="gov-form-control"
                    value={newKind}
                    onChange={(event) => setNewKind(event.target.value as RequirementKind)}
                  >
                    {KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind === "CONSTRAINT" ? "Constraint" : "Requirement"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="new-category">
                    Category Classification
                  </label>
                  <select
                    id="new-category"
                    className="gov-form-control"
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value as RequirementCategory)}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="gov-form-group">
                <label className="gov-form-label" htmlFor="new-text">
                  Requirement / Constraint Text <span className="gov-form-required">*</span>
                </label>
                <textarea
                  id="new-text"
                  className="gov-form-control"
                  rows={3}
                  value={newText}
                  placeholder="State the requirement clearly..."
                  onChange={(event) => setNewText(event.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  className="gov-btn gov-btn--primary"
                  disabled={busy || newText.trim().length < 5}
                >
                  <PlusIcon size={16} />
                  Add Specification
                </button>
              </div>
            </form>
          </GovernmentCard>

          {/* Workflow Audit History */}
          <GovernmentCard
            title="Stage Transition Audit Trail"
            subtitle="Official log of procurement state changes and authorizations"
          >
            <div className="gov-table-container">
              {view.stageHistory.length === 0 ? (
                <p style={{ padding: "20px", margin: 0, color: "var(--gov-text-secondary)", fontStyle: "italic" }}>
                  No stage transitions recorded yet.
                </p>
              ) : (
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th scope="col">From Stage</th>
                      <th scope="col">To Stage</th>
                      <th scope="col">Authorized Official</th>
                      <th scope="col">Reason / Notes</th>
                      <th scope="col">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.stageHistory.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.fromStatus ?? "—"}</td>
                        <td style={{ fontWeight: 600, color: "var(--gov-primary-dark)" }}>
                          {entry.toStatus}
                        </td>
                        <td>{entry.actorName}</td>
                        <td style={{ color: "var(--gov-text-secondary)" }}>{entry.reason ?? "—"}</td>
                        <td style={{ fontSize: "13px", color: "var(--gov-text-secondary)" }}>
                          {new Date(entry.createdAt).toLocaleString("en-IN", { hour12: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </GovernmentCard>
        </>
      )}

      {rejecting !== undefined && (
        <RejectReasonDialog
          requirementText={rejecting.text}
          onCancel={() => setRejecting(undefined)}
          onConfirm={(reason) => {
            const target = rejecting;
            setRejecting(undefined);
            void perform(
              () => decideRequirement(projectId, target.id, { action: "reject", reason }),
              "Suggestion rejected and recorded.",
            );
          }}
        />
      )}
    </>
  );
}
