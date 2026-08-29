import React from "react";
import { Link, useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  answerClarification,
  fetchResponse,
  fetchResponseSchema,
  markResponseReady,
  requestClarification,
  responseDocumentPath,
  startResponseReview,
  RESPONSE_STATUS_BADGE,
  type Clarification,
  type GovernmentResponseView,
  type ResponseFieldDefinition,
  type ResponseSchema,
} from "../api/workPackageResponses.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import {
  BuildingIcon,
  DownloadIcon,
  FileTextIcon,
  MailIcon,
} from "../components/GovernmentIcons.js";
import { GovernmentModal } from "../components/GovernmentModal.js";
import { PageHeader } from "../components/PageHeader.js";
import { formatDay, formatMoment } from "./WorkPackageResponsesPage.js";

/**
 * One supplier's complete response, as the reviewing official reads it.
 *
 * Everything the supplier submitted is here — the requirement answers, the
 * technical and commercial sections, the custom answers, the attachments and
 * the whole clarification thread — and nothing else is. There is no score, no
 * rank and no comparison against another supplier: this milestone collects and
 * organises responses so that Milestone 9 can evaluate them.
 */

function formatInr(amount: number | null): string {
  if (amount === null) return "Not stated";
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} crore`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} lakh`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

const COMPLIANCE_BADGE: Record<string, string> = {
  MEETS: "gov-badge gov-badge--operational",
  PARTIALLY_MEETS: "gov-badge gov-badge--pending",
  DOES_NOT_MEET: "gov-badge gov-badge--cancelled",
  NOT_APPLICABLE: "gov-badge gov-badge--inactive",
};

/** Renders one stored field using the type its catalogue entry declares. */
function fieldValue(
  field: ResponseFieldDefinition,
  body: Record<string, unknown>,
): React.ReactNode {
  const value = body[field.key];

  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "var(--gov-text-muted)" }}>Not answered</span>;
  }

  if (field.type === "MONEY") {
    return typeof value === "number" ? formatInr(value) : String(value);
  }
  if (field.type === "BOOLEAN") {
    return value === true ? "Yes" : "No";
  }
  if (field.type === "DATE") {
    return formatDay(String(value));
  }
  if (field.type === "LONG_TEXT") {
    return <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "14px" }}>{String(value)}</p>;
  }

  return String(value);
}

export function GovernmentResponseDetailPage() {
  const { id, workPackageId, responseId } = useParams<{
    id: string;
    workPackageId: string;
    responseId: string;
  }>();
  const projectId = id ?? "";
  const packageId = workPackageId ?? "";
  const currentResponseId = responseId ?? "";

  const [view, setView] = React.useState<GovernmentResponseView>();
  const [schema, setSchema] = React.useState<ResponseSchema>();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();

  const [clarifying, setClarifying] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [respondBy, setRespondBy] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    document.title = "Supplier Response · ProcureAI";
  }, []);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [loadedSchema, loadedView] = await Promise.all([
          fetchResponseSchema(packageId, signal),
          fetchResponse(packageId, currentResponseId, signal),
        ]);
        setSchema(loadedSchema);
        setView(loadedView);
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "This response could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [packageId, currentResponseId],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  async function perform(action: () => Promise<unknown>, message: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    try {
      await action();
      await load();
      setNotice(message);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : "The action could not be completed.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const response = view?.response;
  const badge = response === undefined ? undefined : RESPONSE_STATUS_BADGE[response.status];
  const body = (response?.body ?? {}) as unknown as Record<string, unknown>;

  const answerByRequirement = new Map(
    (view?.requirementAnswers ?? []).map((answer) => [answer.requirementId, answer]),
  );
  const answerByQuestion = new Map(
    (view?.questionAnswers ?? []).map((answer) => [answer.questionId, answer.value]),
  );

  // The catalogue the server declares is what says how each stored value is
  // labelled and rendered, so this page has no field list of its own to fall
  // out of step with it (D58).
  const fieldByKey = new Map<string, ResponseFieldDefinition>(
    (schema?.sections ?? []).flatMap((section) => section.fields.map((field) => [field.key, field])),
  );

  const reviewable = response?.status === "SUBMITTED" || response?.status === "RESUBMITTED";
  const clarifiable =
    response !== undefined &&
    ["SUBMITTED", "UNDER_REVIEW", "RESUBMITTED"].includes(response.status);

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/projects" },
          { label: "Procurement Projects", to: "/projects" },
          { label: "Work Packages", to: `/projects/${projectId}/work-packages` },
          {
            label: "Supplier Responses",
            to: `/projects/${projectId}/work-packages/${packageId}/responses`,
          },
          { label: "Response" },
        ]}
      />

      <PageHeader
        title="Supplier Response"
        subtitle={
          response === undefined
            ? "One supplier's complete submission"
            : `${response.legalName ?? response.organizationName} · ${response.responseType.replace(/_/g, " ")}`
        }
        action={
          <Link
            className="gov-btn gov-btn--secondary"
            to={`/projects/${projectId}/work-packages/${packageId}/responses`}
          >
            Back to responses
          </Link>
        }
      />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Action could not be completed" role="alert">
          {error}
        </GovernmentAlert>
      )}

      {notice !== undefined && (
        <GovernmentAlert type="success" title="Done">
          {notice}
        </GovernmentAlert>
      )}

      {loading && (
        <GovernmentCard title="Please wait">
          <p style={{ margin: 0 }}>Retrieving the submitted response.</p>
        </GovernmentCard>
      )}

      {!loading && view !== undefined && response !== undefined && badge !== undefined && (
        <>
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <BuildingIcon size={20} />
                <span>{response.legalName ?? response.organizationName}</span>
              </div>
            }
            subtitle="Submission record"
            action={<span className={badge.className}>{badge.label}</span>}
          >
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Response type</dt>
                <dd className="gov-desc-val">{response.responseType.replace(/_/g, " ")}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Submitted at</dt>
                <dd className="gov-desc-val">{formatMoment(response.submittedAt)}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Submitted by</dt>
                <dd className="gov-desc-val">{response.submittedByName ?? "—"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Submissions</dt>
                <dd className="gov-desc-val">{response.submissionCount}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Response deadline</dt>
                <dd className="gov-desc-val">{formatDay(response.responseDeadline)}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Supplier verification</dt>
                <dd className="gov-desc-val">{response.verificationState}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Review opened</dt>
                <dd className="gov-desc-val">
                  {formatMoment(response.reviewStartedAt)}
                  {response.reviewStartedByName === null
                    ? ""
                    : ` by ${response.reviewStartedByName}`}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Accepted for evaluation</dt>
                <dd className="gov-desc-val">
                  {formatMoment(response.readiedAt)}
                  {response.readiedByName === null ? "" : ` by ${response.readiedByName}`}
                </dd>
              </div>
            </dl>

            {response.status === "WITHDRAWN" && (
              <GovernmentAlert type="warning" title="This response was withdrawn">
                Withdrawn on {formatMoment(response.withdrawnAt)}.{" "}
                {response.withdrawalReason === null
                  ? "No reason was recorded."
                  : `Reason given: ${response.withdrawalReason}`}
              </GovernmentAlert>
            )}

            {!view.completeness.complete && (
              <GovernmentAlert type="warning" title="Not everything asked for was answered">
                {view.completeness.missing.length} item(s) the configuration marked required are
                unanswered. This is a record of what was collected, not an assessment of the
                response.
              </GovernmentAlert>
            )}

            <div className="gov-form-actions">
              <button
                type="button"
                className="gov-btn gov-btn--primary"
                disabled={busy || !reviewable}
                title={
                  reviewable ? undefined : "Only a submitted or resubmitted response can be opened for review"
                }
                onClick={() =>
                  void perform(
                    () => startResponseReview(packageId, currentResponseId),
                    "The response is now under review, and the supplier has been told.",
                  )
                }
              >
                Open review
              </button>

              <button
                type="button"
                className="gov-btn gov-btn--secondary"
                disabled={busy || !clarifiable}
                onClick={() => setClarifying(true)}
              >
                Request clarification
              </button>

              <button
                type="button"
                className="gov-btn gov-btn--success"
                disabled={busy || response.status !== "UNDER_REVIEW"}
                title={
                  response.status === "UNDER_REVIEW"
                    ? undefined
                    : "Open the review before marking a response ready"
                }
                onClick={() =>
                  void perform(
                    () => markResponseReady(packageId, currentResponseId),
                    "The response has been recorded as ready for evaluation.",
                  )
                }
              >
                Mark ready for evaluation
              </button>
            </div>

            <p className="gov-fine-print" style={{ marginBottom: 0 }}>
              Marking a response ready records that it is complete enough to be assessed. It is
              not an award, a score or a selection.
            </p>
          </GovernmentCard>

          {/* ---- Requirement answers ------------------------------------- */}
          <GovernmentCard
            title={`Requirement responses (${view.requirements.length})`}
            subtitle="What the supplier stated against each confirmed requirement"
          >
            {view.requirements.length === 0 ? (
              <p style={{ margin: 0 }}>This work package carries no confirmed requirements.</p>
            ) : (
              <div className="gov-table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th scope="col">Requirement</th>
                      <th scope="col" style={{ width: "170px" }}>
                        Stated position
                      </th>
                      <th scope="col">Supplier&rsquo;s answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.requirements.map((requirement) => {
                      const answer = answerByRequirement.get(requirement.id);

                      return (
                        <tr key={requirement.id}>
                          <td style={{ fontSize: "13px" }}>
                            <span className="gov-tag gov-tag--meta">{requirement.category}</span>{" "}
                            {requirement.text}
                          </td>
                          <td>
                            {answer === undefined ? (
                              <span style={{ color: "var(--gov-text-muted)" }}>Not answered</span>
                            ) : (
                              <span
                                className={
                                  COMPLIANCE_BADGE[answer.compliance] ?? "gov-badge gov-badge--draft"
                                }
                              >
                                {answer.compliance.replace(/_/g, " ")}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>
                            {answer?.answer ?? "—"}
                            {answer?.notes != null && (
                              <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                                Note: {answer.notes}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GovernmentCard>

          {/* ---- Sections ------------------------------------------------ */}
          {view.completeness.sections
            .filter((section) => section.sectionId !== "requirements" && section.sectionId !== "documents")
            .map((section) => {
              const questions = view.questions.filter(
                (entry) => entry.section === section.sectionId,
              );

              return (
                <GovernmentCard
                  key={section.sectionId}
                  title={section.label}
                  subtitle={section.mode === "REQUIRED" ? "Required section" : "Optional section"}
                >
                  <dl className="gov-desc-list gov-desc-list--stacked">
                    {view.completeness.items
                      .filter(
                        (item) =>
                          item.sectionId === section.sectionId &&
                          !questions.some((entry) => entry.id === item.key),
                      )
                      .map((item) => {
                        const definition = fieldByKey.get(item.key);
                        if (definition === undefined) return null;

                        return (
                          <div className="gov-desc-item" key={item.key}>
                            <dt className="gov-desc-term">{definition.label}</dt>
                            <dd className="gov-desc-val">{fieldValue(definition, body)}</dd>
                          </div>
                        );
                      })}

                    {questions.map((entry) => {
                      const value = answerByQuestion.get(entry.id);

                      return (
                        <div className="gov-desc-item" key={entry.id}>
                          <dt className="gov-desc-term">
                            {entry.prompt}
                            {entry.isRequired && <span className="gov-form-required"> *</span>}
                          </dt>
                          <dd className="gov-desc-val">
                            {value === undefined || value === null ? (
                              <span style={{ color: "var(--gov-text-muted)" }}>Not answered</span>
                            ) : Array.isArray(value) ? (
                              value.join(", ")
                            ) : typeof value === "boolean" ? (
                              value ? "Yes" : "No"
                            ) : (
                              String(value)
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </GovernmentCard>
              );
            })}

          {/* ---- Documents ----------------------------------------------- */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FileTextIcon size={18} />
                <span>Supporting documents ({view.documents.length})</span>
              </div>
            }
            subtitle="Files the supplier attached to this response"
          >
            {view.documents.length === 0 ? (
              <p style={{ margin: 0 }}>No document was attached.</p>
            ) : (
              <div className="gov-table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">File</th>
                      <th scope="col" style={{ width: "110px" }}>
                        Size
                      </th>
                      <th scope="col" style={{ width: "170px" }}>
                        Uploaded
                      </th>
                      <th scope="col" style={{ width: "120px" }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          {document.title}
                          {document.description !== null && (
                            <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                              {document.description}
                            </div>
                          )}
                        </td>
                        <td className="gov-table-mono">{document.fileName}</td>
                        <td>{Math.max(1, Math.round(document.sizeBytes / 1024))} KB</td>
                        <td>{formatMoment(document.uploadedAt)}</td>
                        <td>
                          <a
                            className="gov-btn gov-btn--tertiary gov-btn--sm"
                            href={responseDocumentPath(packageId, currentResponseId, document.id)}
                          >
                            <DownloadIcon size={14} />
                            <span>Download</span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GovernmentCard>

          {/* ---- Clarifications ------------------------------------------ */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MailIcon size={18} />
                <span>Clarifications ({view.clarifications.length})</span>
              </div>
            }
            subtitle="The complete exchange on this response, in both directions"
          >
            {view.clarifications.length === 0 ? (
              <p style={{ margin: 0 }}>Nothing has been asked on this response yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {view.clarifications.map((clarification) => (
                  <ClarificationThread
                    key={clarification.id}
                    clarification={clarification}
                    busy={busy}
                    draft={answers[clarification.id] ?? ""}
                    onDraft={(value) =>
                      setAnswers((current) => ({ ...current, [clarification.id]: value }))
                    }
                    onAnswer={() =>
                      void perform(
                        () =>
                          answerClarification(packageId, currentResponseId, clarification.id, {
                            answer: (answers[clarification.id] ?? "").trim(),
                          }),
                        "Your answer has been recorded and the supplier has been told.",
                      )
                    }
                  />
                ))}
              </div>
            )}
          </GovernmentCard>
        </>
      )}

      <GovernmentModal
        isOpen={clarifying}
        title="Request a clarification"
        onClose={() => setClarifying(false)}
        footer={
          <>
            <button
              type="button"
              className="gov-btn gov-btn--tertiary"
              onClick={() => setClarifying(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || question.trim().length < 10}
              onClick={() => {
                void perform(
                  () =>
                    requestClarification(packageId, currentResponseId, {
                      subject: subject.trim() === "" ? null : subject.trim(),
                      question: question.trim(),
                      respondBy: respondBy === "" ? null : respondBy,
                    }),
                  "The clarification has been sent and the response is open for the supplier to amend.",
                );
                setClarifying(false);
                setSubject("");
                setQuestion("");
                setRespondBy("");
              }}
            >
              Send request
            </button>
          </>
        }
      >
        <p className="gov-form-hint" style={{ marginBottom: "12px" }}>
          The supplier is notified and the response becomes editable again so it can answer and
          resubmit. The exchange is kept on the record.
        </p>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="clarification-subject">
            Subject
          </label>
          <input
            id="clarification-subject"
            className="gov-form-control"
            maxLength={200}
            value={subject}
            disabled={busy}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Operator training"
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="clarification-question">
            What needs clarifying <span className="gov-form-required">*</span>
          </label>
          <textarea
            id="clarification-question"
            className="gov-form-control"
            rows={5}
            maxLength={4000}
            value={question}
            disabled={busy}
            onChange={(event) => setQuestion(event.target.value)}
            autoFocus
          />
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="clarification-by">
            Reply requested by
          </label>
          <input
            id="clarification-by"
            type="date"
            className="gov-form-control"
            value={respondBy}
            disabled={busy}
            onChange={(event) => setRespondBy(event.target.value)}
          />
        </div>
      </GovernmentModal>
    </>
  );
}

function ClarificationThread({
  clarification,
  busy,
  draft,
  onDraft,
  onAnswer,
}: {
  clarification: Clarification;
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onAnswer: () => void;
}) {
  const fromVendor = clarification.raisedBySide === "VENDOR";

  return (
    <article className="gov-entry-card">
      <div className="gov-entry-card__head">
        <h4 className="gov-entry-card__title">
          {clarification.subject ?? (fromVendor ? "Supplier query" : "Clarification requested")}
        </h4>
        <span
          className={
            clarification.status === "ANSWERED"
              ? "gov-badge gov-badge--operational"
              : "gov-badge gov-badge--pending"
          }
        >
          {clarification.status === "ANSWERED" ? "Answered" : "Open"}
        </span>
      </div>

      <div className="gov-entry-card__meta">
        <span>{fromVendor ? "Asked by the supplier" : "Asked by the department"}</span>
        <span>{clarification.askedByName}</span>
        <span>{formatMoment(clarification.askedAt)}</span>
        {clarification.respondBy !== null && (
          <span>Reply requested by {formatDay(clarification.respondBy)}</span>
        )}
      </div>

      <p style={{ margin: "8px 0", fontSize: "14px", whiteSpace: "pre-wrap" }}>
        {clarification.question}
      </p>

      {clarification.answer !== null && (
        <div className="gov-callout-box">
          <span className="gov-callout-box__label">
            Answered by {clarification.answeredByName ?? "the other side"} ·{" "}
            {formatMoment(clarification.answeredAt)}
          </span>
          <p style={{ margin: 0, fontSize: "14px", whiteSpace: "pre-wrap" }}>
            {clarification.answer}
          </p>
        </div>
      )}

      {clarification.status === "OPEN" && fromVendor && (
        <div className="gov-form-group" style={{ marginTop: "10px", marginBottom: 0 }}>
          <label className="gov-form-label" htmlFor={`answer-${clarification.id}`}>
            Your answer
          </label>
          <textarea
            id={`answer-${clarification.id}`}
            className="gov-form-control"
            rows={3}
            maxLength={4000}
            value={draft}
            disabled={busy}
            onChange={(event) => onDraft(event.target.value)}
          />
          <div className="gov-form-actions">
            <button
              type="button"
              className="gov-btn gov-btn--primary gov-btn--sm"
              disabled={busy || draft.trim().length === 0}
              onClick={onAnswer}
            >
              Send answer
            </button>
          </div>
        </div>
      )}

      {clarification.status === "OPEN" && !fromVendor && (
        <p className="gov-fine-print" style={{ marginBottom: 0 }}>
          Awaiting the supplier&rsquo;s reply.
        </p>
      )}
    </article>
  );
}
