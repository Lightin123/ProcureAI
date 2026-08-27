import { useCallback, useEffect, useState, type FormEvent } from "react";
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
          { label: "Requirements" },
        ]}
      />

      <PageHeader
        title="Requirements"
        action={view === undefined ? undefined : <ProjectStatusBadge status={status} />}
      />

      <ProjectSectionNav projectId={projectId} />

      <p className="page-intro">
        AI analysis produces suggested requirements and clarification questions. Each
        suggestion must be reviewed by an official before it becomes part of the
        confirmed record.
      </p>

      {error !== undefined && (
        <div className="notice notice--error" role="alert">
          <p className="notice__title">Action could not be completed</p>
          <p className="notice__body">{error}</p>
        </div>
      )}

      {notice !== undefined && (
        <div className="notice notice--info" role="status">
          <p className="notice__body">{notice}</p>
        </div>
      )}

      {loading && <p className="panel__message">Loading requirements…</p>}

      {view !== undefined && (
        <>
          <section className="panel" aria-labelledby="analysis-heading">
            <h2 className="panel__heading" id="analysis-heading">
              AI Requirement Analysis
            </h2>
            <div className="panel__body">
              <dl className="detail-list">
                <div className="detail-list__row">
                  <dt className="detail-list__term">Last analysis</dt>
                  <dd className="detail-list__value">
                    {latestRun === undefined
                      ? "Not yet run"
                      : `${new Date(latestRun.createdAt).toLocaleString("en-IN", { hour12: false })} by ${latestRun.triggeredByName}`}
                  </dd>
                </div>
                {latestRun !== undefined && (
                  <>
                    <div className="detail-list__row">
                      <dt className="detail-list__term">Outcome</dt>
                      <dd className="detail-list__value">
                        <StatusBadge
                          tone={latestRun.status === "SUCCEEDED" ? "operational" : latestRun.status === "FAILED" ? "unavailable" : "pending"}
                          label={latestRun.status === "SUCCEEDED" ? "Succeeded" : latestRun.status === "FAILED" ? "Failed" : "Pending"}
                        />
                        {latestRun.errorMessage !== null && (
                          <span className="detail-list__note"> {latestRun.errorMessage}</span>
                        )}
                      </dd>
                    </div>
                    <div className="detail-list__row">
                      <dt className="detail-list__term">Model</dt>
                      <dd className="detail-list__value detail-list__value--mono">
                        {latestRun.model ?? "—"}
                        {latestRun.provider !== null ? ` (${latestRun.provider})` : ""}
                      </dd>
                    </div>
                  </>
                )}
                <div className="detail-list__row">
                  <dt className="detail-list__term">Total analyses</dt>
                  <dd className="detail-list__value">{view.analysisRuns.length}</dd>
                </div>
              </dl>

              <div className="action-row">
                <button
                  type="button"
                  className="button button--primary"
                  disabled={busy || !canAnalyse}
                  onClick={() =>
                    void perform(
                      () => runAnalysis(projectId),
                      "Analysis completed. Review the suggestions below.",
                    )
                  }
                >
                  {busy ? "Analysing…" : latestRun === undefined ? "Run AI Analysis" : "Re-run Analysis"}
                </button>
                {canConfirm && (
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const result = await confirmRequirements(projectId);
                        if (result.unansweredClarifications > 0) {
                          setNotice(
                            `Requirements confirmed with ${result.unansweredClarifications} unanswered clarification question(s).`,
                          );
                        }
                      }, "Requirements confirmed.")
                    }
                  >
                    Confirm Requirements
                  </button>
                )}
                {canReopen && (
                  <button
                    type="button"
                    className="button button--secondary"
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
                <div className="notice notice--warning" role="status">
                  <p className="notice__title">Unanswered clarification questions</p>
                  <p className="notice__body">
                    {openClarifications.length} question(s) remain unanswered. You may still
                    confirm, but answering them first produces a more complete record.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="clarifications-heading">
            <h2 className="panel__heading" id="clarifications-heading">
              Clarification Questions
            </h2>
            <div className="panel__body">
              {view.clarifications.length === 0 && (
                <p className="panel__message">No clarification questions have been raised.</p>
              )}
              {view.clarifications.map((question) => (
                <article className="suggestion" key={question.id}>
                  <div className="suggestion__header">
                    <span className="suggestion__tag">AI-Suggested</span>
                    <StatusBadge
                      tone={question.status === "ANSWERED" ? "operational" : "pending"}
                      label={question.status === "ANSWERED" ? "Answered" : "Open"}
                    />
                  </div>
                  <p className="suggestion__text">{question.question}</p>
                  {question.rationale !== null && (
                    <p className="suggestion__rationale">
                      <span className="suggestion__rationale-label">Why this matters:</span>{" "}
                      {question.rationale}
                    </p>
                  )}
                  {question.status === "ANSWERED" ? (
                    <p className="suggestion__answer">
                      <span className="suggestion__rationale-label">Answer:</span>{" "}
                      {question.answerText}
                    </p>
                  ) : (
                    <div className="form-field">
                      <label className="form-field__label" htmlFor={`answer-${question.id}`}>
                        Your answer
                      </label>
                      <textarea
                        id={`answer-${question.id}`}
                        className="form-field__input form-field__textarea"
                        rows={3}
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                        }
                      />
                      <div className="action-row">
                        <button
                          type="button"
                          className="button button--secondary"
                          disabled={busy || (answers[question.id] ?? "").trim() === ""}
                          onClick={() =>
                            void perform(
                              () =>
                                answerClarification(
                                  projectId,
                                  question.id,
                                  (answers[question.id] ?? "").trim(),
                                ),
                              "Answer recorded.",
                            )
                          }
                        >
                          Save Answer
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="requirements-heading">
            <h2 className="panel__heading" id="requirements-heading">
              Requirements and Constraints
            </h2>
            <div className="panel__body">
              {view.requirements.length === 0 && (
                <p className="panel__message">
                  No requirements recorded yet. Run AI analysis or add one manually below.
                </p>
              )}
              {view.requirements.map((requirement) => (
                <article className="suggestion" key={requirement.id}>
                  <div className="suggestion__header">
                    {requirement.source === "AI_SUGGESTED" ? (
                      <span className="suggestion__tag">AI-Suggested</span>
                    ) : (
                      <span className="suggestion__tag suggestion__tag--manual">
                        Added by Official
                      </span>
                    )}
                    <span className="suggestion__meta">
                      {requirement.kind === "CONSTRAINT" ? "Constraint" : "Requirement"} ·{" "}
                      {CATEGORY_LABELS[requirement.category] ?? requirement.category}
                    </span>
                    <StatusBadge
                      tone={requirementTone(requirement.status)}
                      label={requirementLabel(requirement.status)}
                    />
                  </div>

                  {editingId === requirement.id ? (
                    <div className="form-field">
                      <label className="form-field__label" htmlFor={`edit-${requirement.id}`}>
                        Requirement text
                      </label>
                      <textarea
                        id={`edit-${requirement.id}`}
                        className="form-field__input form-field__textarea"
                        rows={3}
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                      />
                      <div className="action-row">
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => setEditingId(undefined)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="button button--primary"
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
                      <p className="suggestion__text">{requirement.text}</p>
                      {requirement.edited && (
                        <p className="suggestion__edited">
                          Edited from AI suggestion. Original: “{requirement.originalText}”
                        </p>
                      )}
                      {requirement.rationale !== null && (
                        <p className="suggestion__rationale">
                          <span className="suggestion__rationale-label">Basis:</span>{" "}
                          {requirement.rationale}
                        </p>
                      )}
                      {requirement.rejectionReason !== null && (
                        <p className="suggestion__rejection">
                          <span className="suggestion__rationale-label">Rejected because:</span>{" "}
                          {requirement.rejectionReason}
                        </p>
                      )}
                      <div className="action-row">
                        <button
                          type="button"
                          className="button button--primary"
                          disabled={busy || requirement.status === "ACCEPTED"}
                          onClick={() =>
                            void perform(
                              () => decideRequirement(projectId, requirement.id, { action: "accept" }),
                              "Requirement accepted.",
                            )
                          }
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="button button--secondary"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(requirement.id);
                            setEditText(requirement.text);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button button--secondary"
                          disabled={busy || requirement.status === "REJECTED"}
                          onClick={() => setRejecting(requirement)}
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="add-heading">
            <h2 className="panel__heading" id="add-heading">
              Add Requirement Manually
            </h2>
            <form
              className="panel__body"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void perform(async () => {
                  await addRequirement(projectId, {
                    kind: newKind,
                    category: newCategory,
                    text: newText.trim(),
                  });
                  setNewText("");
                }, "Requirement added.");
              }}
            >
              <div className="form-row">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="new-kind">
                    Type
                  </label>
                  <select
                    id="new-kind"
                    className="form-field__input"
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
                <div className="form-field">
                  <label className="form-field__label" htmlFor="new-category">
                    Category
                  </label>
                  <select
                    id="new-category"
                    className="form-field__input"
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
              <div className="form-field">
                <label className="form-field__label" htmlFor="new-text">
                  Requirement text <span className="form-field__required">* required</span>
                </label>
                <textarea
                  id="new-text"
                  className="form-field__input form-field__textarea"
                  rows={3}
                  value={newText}
                  onChange={(event) => setNewText(event.target.value)}
                />
              </div>
              <div className="action-row">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={busy || newText.trim().length < 5}
                >
                  Add Requirement
                </button>
              </div>
            </form>
          </section>

          <section className="panel" aria-labelledby="history-heading">
            <h2 className="panel__heading" id="history-heading">
              Workflow History
            </h2>
            <div className="panel__body panel__body--flush">
              {view.stageHistory.length === 0 ? (
                <p className="panel__message">No stage transitions recorded yet.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">From</th>
                      <th scope="col">To</th>
                      <th scope="col">By</th>
                      <th scope="col">Reason</th>
                      <th scope="col">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.stageHistory.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.fromStatus ?? "—"}</td>
                        <td>{entry.toStatus}</td>
                        <td>{entry.actorName}</td>
                        <td>{entry.reason ?? "—"}</td>
                        <td>{new Date(entry.createdAt).toLocaleString("en-IN", { hour12: false })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
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
              "Suggestion rejected.",
            );
          }}
        />
      )}
    </>
  );
}
