import React from "react";
import { Link, useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  answerClarification,
  askClarification,
  fetchVendorResponse,
  removeResponseDocument,
  responseDocumentPath,
  saveQuestionAnswer,
  saveRequirementAnswer,
  saveVendorDraft,
  submitVendorResponse,
  uploadResponseDocument,
  withdrawVendorResponse,
  VENDOR_RESPONSE_BADGE,
  type ResponseFieldDefinition,
  type ResponseQuestion,
  type VendorResponseWorkspace,
} from "../api/vendorResponses.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import {
  CheckCircleIcon,
  DownloadIcon,
  MailIcon,
  TrashIcon,
} from "../components/GovernmentIcons.js";
import { GovernmentModal } from "../components/GovernmentModal.js";
import { PageHeader } from "../components/PageHeader.js";
import { formatDay } from "./VendorResponsesPage.js";

/**
 * Drafting, reviewing and submitting one structured response.
 *
 * The form is built entirely from the catalogue the API serves with the
 * workspace — the sections, their fields, the department's custom questions and
 * the confirmed requirements. Nothing about what is being asked for is written
 * out in this file, so the form, the progress indicator and the server's
 * submission check are three readings of one declaration and cannot disagree
 * (D58).
 *
 * The supplier's own progress is the server's completeness computation, not a
 * local count, which is why a response the bar shows as ready is a response the
 * API will accept.
 *
 * Nothing is submitted implicitly. Saving a section keeps a draft; the response
 * reaches the department only through the review step's submit.
 */

function formatMoment(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The draft values held in the form, before they are saved. */
type DraftValues = Record<string, string | number | boolean | null>;

const REVIEW_STEP = "__review";

export function VendorResponseEditorPage() {
  const { id } = useParams<{ id: string }>();
  const responseId = id ?? "";

  const [view, setView] = React.useState<VendorResponseWorkspace>();
  const [step, setStep] = React.useState<string>();
  const [draft, setDraft] = React.useState<DraftValues>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const [missing, setMissing] = React.useState<Array<{ field: string; message: string }>>([]);

  const [withdrawing, setWithdrawing] = React.useState(false);
  const [withdrawReason, setWithdrawReason] = React.useState("");
  const [asking, setAsking] = React.useState(false);
  const [askSubject, setAskSubject] = React.useState("");
  const [askQuestion, setAskQuestion] = React.useState("");
  const [clarificationDrafts, setClarificationDrafts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    document.title = "Respond to Work Package · ProcureAI";
  }, []);

  /** Copies the stored body into the form, discarding unsaved edits. */
  const adopt = React.useCallback((workspace: VendorResponseWorkspace) => {
    setView(workspace);
    setDraft({ ...(workspace.response.body as unknown as DraftValues) });
  }, []);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        adopt(await fetchVendorResponse(responseId, signal));
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "This response could not be loaded.",
        );
      }
    },
    [responseId, adopt],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  async function perform(action: () => Promise<VendorResponseWorkspace>, message: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    try {
      adopt(await action());
      setNotice(message);
      setMissing([]);
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.message);
        setMissing(caught.details);
      } else {
        setError("The action could not be completed.");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  // The sections the department actually asked for, in catalogue order.
  const activeSections = (view?.sections ?? []).filter(
    (section) => (view?.config.sections[section.id] ?? "OFF") !== "OFF",
  );

  const currentStep =
    step ?? (activeSections[0]?.id ?? REVIEW_STEP);
  const isReview = currentStep === REVIEW_STEP;
  const section = activeSections.find((entry) => entry.id === currentStep);

  const editable = view?.editable === true;
  const badge = view === undefined ? undefined : VENDOR_RESPONSE_BADGE[view.response.status];

  const progressFor = (sectionId: string) =>
    view?.completeness.sections.find((entry) => entry.sectionId === sectionId);

  const openGovernmentClarifications = (view?.clarifications ?? []).filter(
    (entry) => entry.raisedBySide === "GOVERNMENT" && entry.status === "OPEN",
  );

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/vendor" },
          { label: "My Responses", to: "/vendor/responses" },
          { label: "Response" },
        ]}
      />

      <PageHeader
        title={view?.config.responseTypeLabel ?? "Response"}
        subtitle={
          view === undefined
            ? "Your organisation's structured response"
            : `${view.response.packageNumber} — ${view.response.packageTitle} · ${view.response.departmentName}`
        }
        action={
          <Link className="gov-btn gov-btn--secondary" to="/vendor/responses">
            Back to my responses
          </Link>
        }
      />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Action could not be completed" role="alert">
          {error}
          {missing.length > 0 && (
            <ul className="gov-plain-list" style={{ marginTop: "8px" }}>
              {missing.map((item) => (
                <li key={item.field}>{item.message}</li>
              ))}
            </ul>
          )}
        </GovernmentAlert>
      )}

      {notice !== undefined && (
        <GovernmentAlert type="success" title="Saved">
          {notice}
        </GovernmentAlert>
      )}

      {view === undefined && error === undefined && (
        <GovernmentCard title="Please wait">
          <p style={{ margin: 0 }}>Retrieving your response.</p>
        </GovernmentCard>
      )}

      {view !== undefined && badge !== undefined && (
        <>
          <GovernmentCard
            title="What is being asked for"
            subtitle={view.config.title ?? `${view.config.responseTypeLabel} for this work package`}
            action={<span className={badge.className}>{badge.label}</span>}
          >
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Issuing department</dt>
                <dd className="gov-desc-val">{view.response.departmentName}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Procurement project</dt>
                <dd className="gov-desc-val">{view.response.projectTitle}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Responses due by</dt>
                <dd className="gov-desc-val">{formatDay(view.config.responseDeadline)}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Last submitted</dt>
                <dd className="gov-desc-val">{formatMoment(view.response.submittedAt)}</dd>
              </div>
            </dl>

            {view.config.instructions !== null && (
              <div className="gov-callout-box" style={{ marginTop: "12px" }}>
                <span className="gov-callout-box__label">Instructions from the department</span>
                <p style={{ margin: 0, fontSize: "14px", whiteSpace: "pre-wrap" }}>
                  {view.config.instructions}
                </p>
              </div>
            )}

            {view.config.deadlinePassed && editable && (
              <GovernmentAlert type="warning" title="The response date has passed">
                The department&rsquo;s stated date has gone by. A submission will be refused unless
                the department extends the date or asks you for a clarification.
              </GovernmentAlert>
            )}

            {!editable && view.response.status !== "WITHDRAWN" && (
              <GovernmentAlert type="info" title="This response has been submitted">
                It can no longer be edited. If the department needs anything further it will
                request a clarification, which reopens the response for you to amend and resubmit.
              </GovernmentAlert>
            )}

            {openGovernmentClarifications.length > 0 && (
              <GovernmentAlert type="warning" title="The department has asked you to clarify">
                {openGovernmentClarifications.length} question(s) are outstanding. Answer them
                below before resubmitting.
              </GovernmentAlert>
            )}
          </GovernmentCard>

          <div className="gov-onboarding">
            <aside className="gov-onboarding__sidebar">
              <div className="gov-onboarding__progress">
                <div className="gov-meter">
                  <div className="gov-meter__head">
                    <span className="gov-meter__label">Completion</span>
                    <span className="gov-meter__value">{view.completeness.percent}%</span>
                  </div>
                  <div
                    className="gov-meter__track"
                    role="progressbar"
                    aria-valuenow={view.completeness.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Response completion"
                  >
                    <div
                      className={`gov-meter__fill${view.completeness.complete ? " gov-meter__fill--complete" : ""}`}
                      style={{ width: `${view.completeness.percent}%` }}
                    />
                  </div>
                </div>
                <p className="gov-onboarding__progress-note">
                  {view.completeness.complete
                    ? "Everything the department requires has been answered."
                    : `${view.completeness.requiredComplete} of ${view.completeness.requiredTotal} required items answered.`}
                </p>
              </div>

              <nav aria-label="Response sections">
                <ol className="gov-stepper">
                  {activeSections.map((entry, index) => {
                    const progress = progressFor(entry.id);
                    const active = entry.id === currentStep;

                    return (
                      <li key={entry.id} className="gov-stepper__item">
                        <button
                          type="button"
                          className={`gov-stepper__button${active ? " gov-stepper__button--active" : ""}${
                            progress?.complete === true ? " gov-stepper__button--complete" : ""
                          }`}
                          onClick={() => setStep(entry.id)}
                          aria-current={active ? "step" : undefined}
                        >
                          <span className="gov-stepper__index" aria-hidden="true">
                            {progress?.complete === true ? (
                              <CheckCircleIcon size={14} />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <span className="gov-stepper__body">
                            <span className="gov-stepper__title">{entry.label}</span>
                            <span className="gov-stepper__meta">
                              {view.config.sections[entry.id] === "REQUIRED"
                                ? `Required · ${progress?.requiredComplete ?? 0}/${progress?.requiredTotal ?? 0}`
                                : "Optional"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}

                  {view.config.allowDocuments && (
                    <li className="gov-stepper__item">
                      <button
                        type="button"
                        className={`gov-stepper__button${currentStep === "documents" ? " gov-stepper__button--active" : ""}${
                          progressFor("documents")?.complete === true
                            ? " gov-stepper__button--complete"
                            : ""
                        }`}
                        onClick={() => setStep("documents")}
                      >
                        <span className="gov-stepper__index" aria-hidden="true">
                          {activeSections.length + 1}
                        </span>
                        <span className="gov-stepper__body">
                          <span className="gov-stepper__title">Supporting documents</span>
                          <span className="gov-stepper__meta">
                            {view.config.documentsRequired ? "Required" : "Optional"} ·{" "}
                            {view.documents.length} attached
                          </span>
                        </span>
                      </button>
                    </li>
                  )}

                  <li className="gov-stepper__item">
                    <button
                      type="button"
                      className={`gov-stepper__button${isReview ? " gov-stepper__button--active" : ""}`}
                      onClick={() => setStep(REVIEW_STEP)}
                      aria-current={isReview ? "step" : undefined}
                    >
                      <span className="gov-stepper__index" aria-hidden="true">
                        {activeSections.length + (view.config.allowDocuments ? 2 : 1)}
                      </span>
                      <span className="gov-stepper__body">
                        <span className="gov-stepper__title">Review &amp; submit</span>
                        <span className="gov-stepper__meta">Final check</span>
                      </span>
                    </button>
                  </li>
                </ol>
              </nav>
            </aside>

            <div className="gov-onboarding__content">
              {isReview ? (
                <ReviewStep
                  view={view}
                  busy={busy}
                  onGoToSection={(sectionId) => setStep(sectionId)}
                  onSubmit={() =>
                    void perform(
                      () => submitVendorResponse(responseId),
                      "Your response has been submitted to the department.",
                    )
                  }
                  onWithdraw={() => setWithdrawing(true)}
                />
              ) : currentStep === "documents" ? (
                <DocumentsStep
                  view={view}
                  responseId={responseId}
                  busy={busy}
                  editable={editable}
                  onUpload={(body) =>
                    void perform(
                      () => uploadResponseDocument(responseId, body),
                      "The document has been attached.",
                    )
                  }
                  onRemove={(documentId) =>
                    void perform(
                      () => removeResponseDocument(responseId, documentId),
                      "The document has been removed.",
                    )
                  }
                />
              ) : section?.perRequirement === true ? (
                <RequirementsStep
                  view={view}
                  busy={busy}
                  editable={editable}
                  onSave={(requirementId, body) =>
                    void perform(
                      () => saveRequirementAnswer(responseId, requirementId, body),
                      "Your answer to this requirement has been saved.",
                    )
                  }
                />
              ) : section !== undefined ? (
                <SectionStep
                  key={section.id}
                  section={section}
                  required={view.config.sections[section.id] === "REQUIRED"}
                  questions={view.questions.filter((entry) => entry.section === section.id)}
                  answers={view.questionAnswers}
                  draft={draft}
                  busy={busy}
                  editable={editable}
                  onChange={(key, value) =>
                    setDraft((current) => ({ ...current, [key]: value }))
                  }
                  onSaveFields={(values) =>
                    void perform(
                      () => saveVendorDraft(responseId, values),
                      "Your draft has been saved. You can return to it at any time.",
                    )
                  }
                  onSaveQuestion={(questionId, value) =>
                    void perform(
                      () => saveQuestionAnswer(responseId, questionId, value),
                      "Your answer has been saved.",
                    )
                  }
                />
              ) : null}

              <ClarificationsPanel
                view={view}
                busy={busy}
                drafts={clarificationDrafts}
                onDraft={(clarificationId, value) =>
                  setClarificationDrafts((current) => ({ ...current, [clarificationId]: value }))
                }
                onAsk={() => setAsking(true)}
                onAnswer={(clarificationId) =>
                  void perform(
                    () =>
                      answerClarification(
                        responseId,
                        clarificationId,
                        (clarificationDrafts[clarificationId] ?? "").trim(),
                      ),
                    "Your answer has been sent to the department.",
                  )
                }
              />
            </div>
          </div>
        </>
      )}

      <GovernmentModal
        isOpen={withdrawing}
        title="Withdraw this response"
        onClose={() => setWithdrawing(false)}
        footer={
          <>
            <button
              type="button"
              className="gov-btn gov-btn--tertiary"
              onClick={() => setWithdrawing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="gov-btn gov-btn--danger"
              disabled={busy || withdrawReason.trim().length < 3}
              onClick={() => {
                void perform(
                  () => withdrawVendorResponse(responseId, withdrawReason.trim()),
                  "Your response has been withdrawn and the department has been told.",
                );
                setWithdrawing(false);
                setWithdrawReason("");
              }}
            >
              Confirm withdrawal
            </button>
          </>
        }
      >
        <p className="gov-form-hint" style={{ marginBottom: "12px" }}>
          Withdrawing does not delete what you submitted. The department keeps the record and is
          shown the reason you give here.
        </p>
        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="withdraw-reason">
            Reason for withdrawing <span className="gov-form-required">*</span>
          </label>
          <textarea
            id="withdraw-reason"
            className="gov-form-control"
            rows={4}
            maxLength={2000}
            value={withdrawReason}
            disabled={busy}
            onChange={(event) => setWithdrawReason(event.target.value)}
            autoFocus
          />
        </div>
      </GovernmentModal>

      <GovernmentModal
        isOpen={asking}
        title="Ask the department a question"
        onClose={() => setAsking(false)}
        footer={
          <>
            <button
              type="button"
              className="gov-btn gov-btn--tertiary"
              onClick={() => setAsking(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || askQuestion.trim().length < 10}
              onClick={() => {
                void perform(
                  () =>
                    askClarification(responseId, {
                      subject: askSubject.trim() === "" ? null : askSubject.trim(),
                      question: askQuestion.trim(),
                    }),
                  "Your question has been sent to the department.",
                );
                setAsking(false);
                setAskSubject("");
                setAskQuestion("");
              }}
            >
              Send question
            </button>
          </>
        }
      >
        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="ask-subject">
            Subject
          </label>
          <input
            id="ask-subject"
            className="gov-form-control"
            maxLength={200}
            value={askSubject}
            disabled={busy}
            onChange={(event) => setAskSubject(event.target.value)}
          />
        </div>
        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="ask-question">
            Your question <span className="gov-form-required">*</span>
          </label>
          <textarea
            id="ask-question"
            className="gov-form-control"
            rows={5}
            maxLength={4000}
            value={askQuestion}
            disabled={busy}
            onChange={(event) => setAskQuestion(event.target.value)}
            autoFocus
          />
        </div>
      </GovernmentModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// One section of standard fields, plus any custom questions shown under it
// ---------------------------------------------------------------------------

function SectionStep({
  section,
  required,
  questions,
  answers,
  draft,
  busy,
  editable,
  onChange,
  onSaveFields,
  onSaveQuestion,
}: {
  section: { id: string; label: string; description: string; fields: ResponseFieldDefinition[] };
  required: boolean;
  questions: ResponseQuestion[];
  answers: Array<{ questionId: string; value: unknown }>;
  draft: DraftValues;
  busy: boolean;
  editable: boolean;
  onChange: (key: string, value: string | number | boolean | null) => void;
  onSaveFields: (values: DraftValues) => void;
  onSaveQuestion: (questionId: string, value: unknown) => void;
}) {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.value]));

  return (
    <GovernmentCard
      title={section.label}
      subtitle={section.description}
      action={
        <span className="gov-tag gov-tag--meta">{required ? "Required" : "Optional"}</span>
      }
    >
      {section.fields.map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          required={required && field.essential}
          value={draft[field.key] ?? null}
          busy={busy}
          editable={editable}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}

      {questions.map((question) => (
        <QuestionEditor
          key={question.id}
          question={question}
          value={answerByQuestion.get(question.id)}
          busy={busy}
          editable={editable}
          onSave={(value) => onSaveQuestion(question.id, value)}
        />
      ))}

      {editable && section.fields.length > 0 && (
        <div className="gov-form-actions">
          <button
            type="button"
            className="gov-btn gov-btn--primary"
            disabled={busy}
            onClick={() => {
              // Only this section's own fields are sent, so saving one section
              // cannot overwrite a value the supplier is editing in another.
              const values: DraftValues = {};
              for (const field of section.fields) values[field.key] = draft[field.key] ?? null;
              onSaveFields(values);
            }}
          >
            Save this section
          </button>
        </div>
      )}

      {!editable && (
        <p className="gov-fine-print" style={{ marginBottom: 0 }}>
          This response has been submitted and is shown as it was sent.
        </p>
      )}
    </GovernmentCard>
  );
}

function FieldEditor({
  field,
  required,
  value,
  busy,
  editable,
  onChange,
}: {
  field: ResponseFieldDefinition;
  required: boolean;
  value: string | number | boolean | null;
  busy: boolean;
  editable: boolean;
  onChange: (value: string | number | boolean | null) => void;
}) {
  const inputId = `field-${field.key}`;
  const disabled = busy || !editable;

  if (field.type === "BOOLEAN") {
    return (
      <div className="gov-form-group">
        <label className="gov-switch">
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>
            {field.label}
            {required && <span className="gov-form-required"> *</span>}
          </span>
        </label>
        {field.hint !== undefined && <p className="gov-form-hint">{field.hint}</p>}
      </div>
    );
  }

  return (
    <div className="gov-form-group">
      <label className="gov-form-label" htmlFor={inputId}>
        {field.label}
        {required && <span className="gov-form-required"> *</span>}
      </label>
      {field.hint !== undefined && <p className="gov-form-hint">{field.hint}</p>}

      {field.type === "LONG_TEXT" ? (
        <textarea
          id={inputId}
          className="gov-form-control"
          rows={6}
          maxLength={field.maxLength}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        />
      ) : field.type === "NUMBER" || field.type === "MONEY" ? (
        <input
          id={inputId}
          type="number"
          min={field.type === "MONEY" ? 0 : 1}
          step={1}
          className="gov-form-control"
          value={typeof value === "number" ? String(value) : ""}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            onChange(Number.isNaN(parsed) ? null : parsed);
          }}
        />
      ) : field.type === "DATE" ? (
        <input
          id={inputId}
          type="date"
          className="gov-form-control"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        />
      ) : (
        <input
          id={inputId}
          className="gov-form-control"
          maxLength={field.maxLength}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        />
      )}
    </div>
  );
}

/**
 * One of the department's custom questions.
 *
 * Saved on its own rather than with the section, because the answer's shape is
 * decided by the question and validated against it server-side; batching it
 * with the section fields would make one rejected answer discard the rest.
 */
function QuestionEditor({
  question,
  value,
  busy,
  editable,
  onSave,
}: {
  question: ResponseQuestion;
  value: unknown;
  busy: boolean;
  editable: boolean;
  onSave: (value: unknown) => void;
}) {
  const [local, setLocal] = React.useState<unknown>(value ?? null);
  React.useEffect(() => setLocal(value ?? null), [value]);

  const inputId = `question-${question.id}`;
  const disabled = busy || !editable;

  return (
    <div className="gov-question-card">
      <div className="gov-question-card__header">
        <span className="gov-question-text">
          {question.prompt}
          {question.isRequired && <span className="gov-form-required"> *</span>}
        </span>
      </div>

      {question.helpText !== null && <p className="gov-form-hint">{question.helpText}</p>}

      {question.answerType === "LONG_TEXT" ? (
        <textarea
          id={inputId}
          className="gov-form-control"
          rows={4}
          value={typeof local === "string" ? local : ""}
          disabled={disabled}
          onChange={(event) => setLocal(event.target.value)}
        />
      ) : question.answerType === "SHORT_TEXT" ? (
        <input
          id={inputId}
          className="gov-form-control"
          value={typeof local === "string" ? local : ""}
          disabled={disabled}
          onChange={(event) => setLocal(event.target.value)}
        />
      ) : question.answerType === "NUMBER" ? (
        <input
          id={inputId}
          type="number"
          className="gov-form-control"
          value={typeof local === "number" ? String(local) : ""}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value);
            setLocal(Number.isNaN(parsed) ? null : parsed);
          }}
        />
      ) : question.answerType === "DATE" ? (
        <input
          id={inputId}
          type="date"
          className="gov-form-control"
          value={typeof local === "string" ? local : ""}
          disabled={disabled}
          onChange={(event) => setLocal(event.target.value)}
        />
      ) : question.answerType === "BOOLEAN" ? (
        <label className="gov-switch">
          <input
            type="checkbox"
            checked={local === true}
            disabled={disabled}
            onChange={(event) => setLocal(event.target.checked)}
          />
          <span>Yes</span>
        </label>
      ) : question.answerType === "SINGLE_CHOICE" ? (
        <div className="gov-option-grid">
          {question.options.map((option) => (
            <label key={option} className="gov-option-card">
              <input
                type="radio"
                name={inputId}
                checked={local === option}
                disabled={disabled}
                onChange={() => setLocal(option)}
              />
              <span className="gov-option-card__body">
                <span className="gov-option-card__label">{option}</span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="gov-option-grid">
          {question.options.map((option) => {
            const chosen = Array.isArray(local) ? (local as string[]) : [];

            return (
              <label key={option} className="gov-option-card">
                <input
                  type="checkbox"
                  checked={chosen.includes(option)}
                  disabled={disabled}
                  onChange={(event) =>
                    setLocal(
                      event.target.checked
                        ? [...chosen, option]
                        : chosen.filter((entry) => entry !== option),
                    )
                  }
                />
                <span className="gov-option-card__body">
                  <span className="gov-option-card__label">{option}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {editable && (
        <div className="gov-form-actions">
          <button
            type="button"
            className="gov-btn gov-btn--secondary gov-btn--sm"
            disabled={disabled}
            onClick={() => onSave(local)}
          >
            Save answer
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requirement-by-requirement answers
// ---------------------------------------------------------------------------

function RequirementsStep({
  view,
  busy,
  editable,
  onSave,
}: {
  view: VendorResponseWorkspace;
  busy: boolean;
  editable: boolean;
  onSave: (
    requirementId: string,
    body: { compliance: string; answer: string | null; notes: string | null },
  ) => void;
}) {
  const stored = new Map(view.requirementAnswers.map((answer) => [answer.requirementId, answer]));
  const required = view.config.sections.requirements === "REQUIRED";

  return (
    <GovernmentCard
      title="Requirement-by-requirement response"
      subtitle="Each confirmed requirement on this work package, answered individually"
      action={<span className="gov-tag gov-tag--meta">{required ? "Required" : "Optional"}</span>}
    >
      {view.requirements.length === 0 ? (
        <p style={{ margin: 0 }}>
          This work package carries no confirmed requirements, so there is nothing to answer here.
        </p>
      ) : (
        view.requirements.map((requirement, index) => (
          <RequirementAnswerEditor
            key={requirement.id}
            index={index + 1}
            requirement={requirement}
            compliance={view.requirementCompliance}
            stored={stored.get(requirement.id)}
            busy={busy}
            editable={editable}
            onSave={(body) => onSave(requirement.id, body)}
          />
        ))
      )}
    </GovernmentCard>
  );
}

function RequirementAnswerEditor({
  index,
  requirement,
  compliance,
  stored,
  busy,
  editable,
  onSave,
}: {
  index: number;
  requirement: { id: string; category: string; text: string };
  compliance: Array<{ value: string; label: string }>;
  stored: { compliance: string; answer: string | null; notes: string | null } | undefined;
  busy: boolean;
  editable: boolean;
  onSave: (body: { compliance: string; answer: string | null; notes: string | null }) => void;
}) {
  const [position, setPosition] = React.useState(stored?.compliance ?? "MEETS");
  const [answer, setAnswer] = React.useState(stored?.answer ?? "");
  const [notes, setNotes] = React.useState(stored?.notes ?? "");

  React.useEffect(() => {
    setPosition(stored?.compliance ?? "MEETS");
    setAnswer(stored?.answer ?? "");
    setNotes(stored?.notes ?? "");
  }, [stored]);

  const disabled = busy || !editable;

  return (
    <div className="gov-requirement-card">
      <div className="gov-requirement-card__header">
        <span className="gov-question-num">{index}</span>
        <div>
          <span className="gov-tag gov-tag--meta">{requirement.category}</span>
          <p style={{ margin: "4px 0 0", fontSize: "14px" }}>{requirement.text}</p>
        </div>
        {stored !== undefined && (
          <span className="gov-badge gov-badge--operational">Answered</span>
        )}
      </div>

      <div className="gov-form-group">
        <label className="gov-form-label" htmlFor={`compliance-${requirement.id}`}>
          Your position <span className="gov-form-required">*</span>
        </label>
        <select
          id={`compliance-${requirement.id}`}
          className="gov-select"
          value={position}
          disabled={disabled}
          onChange={(event) => setPosition(event.target.value)}
        >
          {compliance.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="gov-form-group">
        <label className="gov-form-label" htmlFor={`answer-${requirement.id}`}>
          How your response addresses this
          {position !== "NOT_APPLICABLE" && <span className="gov-form-required"> *</span>}
        </label>
        <textarea
          id={`answer-${requirement.id}`}
          className="gov-form-control"
          rows={3}
          maxLength={8000}
          value={answer}
          disabled={disabled}
          onChange={(event) => setAnswer(event.target.value)}
        />
      </div>

      <div className="gov-form-group">
        <label className="gov-form-label" htmlFor={`notes-${requirement.id}`}>
          Additional note
        </label>
        <input
          id={`notes-${requirement.id}`}
          className="gov-form-control"
          maxLength={2000}
          value={notes}
          disabled={disabled}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {editable && (
        <div className="gov-form-actions">
          <button
            type="button"
            className="gov-btn gov-btn--secondary gov-btn--sm"
            disabled={disabled}
            onClick={() =>
              onSave({
                compliance: position,
                answer: answer.trim() === "" ? null : answer.trim(),
                notes: notes.trim() === "" ? null : notes.trim(),
              })
            }
          >
            Save this answer
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supporting documents
// ---------------------------------------------------------------------------

function DocumentsStep({
  view,
  responseId,
  busy,
  editable,
  onUpload,
  onRemove,
}: {
  view: VendorResponseWorkspace;
  responseId: string;
  busy: boolean;
  editable: boolean;
  onUpload: (body: {
    title: string;
    description: string | null;
    fileName: string;
    mimeType: string;
    content: string;
  }) => void;
  onRemove: (documentId: string) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [file, setFile] = React.useState<File>();
  const [fileError, setFileError] = React.useState<string>();

  async function attach(): Promise<void> {
    if (file === undefined) return;
    setFileError(undefined);

    if (file.size > view.upload.maxBytes) {
      setFileError(
        `The file must be ${Math.round(view.upload.maxBytes / (1024 * 1024))} MB or smaller.`,
      );
      return;
    }

    if (!view.upload.acceptedTypes.includes(file.type)) {
      setFileError("Attach a PDF, JPEG, PNG or WebP file.");
      return;
    }

    // The API takes the bytes base64-encoded in the JSON body, the same way a
    // compliance document is uploaded (D59).
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    onUpload({
      title: title.trim(),
      description: description.trim() === "" ? null : description.trim(),
      fileName: file.name,
      mimeType: file.type,
      content: btoa(binary),
    });

    setTitle("");
    setDescription("");
    setFile(undefined);
  }

  return (
    <GovernmentCard
      title="Supporting documents"
      subtitle="Work plans, drawings, certificates or anything else the department asked for"
      action={
        <span className="gov-tag gov-tag--meta">
          {view.config.documentsRequired ? "At least one required" : "Optional"}
        </span>
      }
    >
      {view.documents.length === 0 ? (
        <p>No document has been attached to this response.</p>
      ) : (
        <div className="gov-table-container" style={{ marginBottom: "16px" }}>
          <table className="gov-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">File</th>
                <th scope="col" style={{ width: "100px" }}>
                  Size
                </th>
                <th scope="col" style={{ width: "190px" }}>
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
                  <td>
                    <a
                      className="gov-btn gov-btn--tertiary gov-btn--sm"
                      href={responseDocumentPath(responseId, document.id)}
                    >
                      <DownloadIcon size={14} />
                      <span>Download</span>
                    </a>
                    {editable && (
                      <button
                        type="button"
                        className="gov-btn gov-btn--tertiary gov-btn--sm"
                        style={{ color: "var(--gov-danger)" }}
                        disabled={busy}
                        onClick={() => onRemove(document.id)}
                      >
                        <TrashIcon size={14} />
                        <span>Remove</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable ? (
        <>
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="document-title">
              Title <span className="gov-form-required">*</span>
            </label>
            <input
              id="document-title"
              className="gov-form-control"
              maxLength={200}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ward level work plan"
            />
          </div>

          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="document-description">
              What this document contains
            </label>
            <input
              id="document-description"
              className="gov-form-control"
              maxLength={1000}
              value={description}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="document-file">
              File <span className="gov-form-required">*</span>
            </label>
            <p className="gov-form-hint">
              PDF, JPEG, PNG or WebP, up to{" "}
              {Math.round(view.upload.maxBytes / (1024 * 1024))} MB.
            </p>
            <input
              id="document-file"
              type="file"
              className="gov-form-control"
              accept={view.upload.acceptedTypes.join(",")}
              disabled={busy}
              onChange={(event) => setFile(event.target.files?.[0])}
            />
            {fileError !== undefined && <p className="gov-form-error">{fileError}</p>}
          </div>

          <div className="gov-form-actions">
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || file === undefined || title.trim().length < 2}
              onClick={() => void attach()}
            >
              Attach document
            </button>
          </div>
        </>
      ) : (
        <p className="gov-fine-print" style={{ marginBottom: 0 }}>
          This response has been submitted. Documents can no longer be added or removed.
        </p>
      )}
    </GovernmentCard>
  );
}

// ---------------------------------------------------------------------------
// Review and submit
// ---------------------------------------------------------------------------

function ReviewStep({
  view,
  busy,
  onGoToSection,
  onSubmit,
  onWithdraw,
}: {
  view: VendorResponseWorkspace;
  busy: boolean;
  onGoToSection: (sectionId: string) => void;
  onSubmit: () => void;
  onWithdraw: () => void;
}) {
  const withdrawable = !["READY_FOR_EVALUATION", "WITHDRAWN"].includes(view.response.status);
  const outstanding = view.clarifications.filter(
    (entry) => entry.raisedBySide === "GOVERNMENT" && entry.status === "OPEN",
  ).length;

  return (
    <GovernmentCard
      title="Review and submit"
      subtitle="Check what the department will receive before you send it"
    >
      {view.completeness.complete ? (
        <GovernmentAlert type="success" title="Everything required has been answered">
          {view.completeness.optionalTotal - view.completeness.optionalComplete > 0
            ? `${view.completeness.optionalTotal - view.completeness.optionalComplete} optional item(s) are still blank. You can submit without them.`
            : "Every item, required and optional, has been answered."}
        </GovernmentAlert>
      ) : (
        <GovernmentAlert type="warning" title="Some required information is missing" role="alert">
          The department requires the following before this response can be submitted.
        </GovernmentAlert>
      )}

      <div className="gov-table-container">
        <table className="gov-table">
          <thead>
            <tr>
              <th scope="col">Section</th>
              <th scope="col" style={{ width: "120px" }}>
                Asked for
              </th>
              <th scope="col" style={{ width: "150px" }}>
                Required items
              </th>
              <th scope="col" style={{ width: "110px" }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {view.completeness.sections.map((section) => (
              <tr key={section.sectionId}>
                <td>
                  {section.label}
                  {!section.complete && (
                    <div style={{ fontSize: "12px", color: "var(--gov-danger)" }}>
                      {section.requiredTotal - section.requiredComplete} outstanding
                    </div>
                  )}
                </td>
                <td>{section.mode === "REQUIRED" ? "Required" : "Optional"}</td>
                <td>
                  {section.requiredComplete} / {section.requiredTotal}
                </td>
                <td>
                  <button
                    type="button"
                    className="gov-btn gov-btn--tertiary gov-btn--sm"
                    onClick={() => onGoToSection(section.sectionId)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view.completeness.missing.length > 0 && (
        <>
          <h3 className="gov-section-title">Outstanding items</h3>
          <ul className="gov-plain-list">
            {view.completeness.missing.map((item) => (
              <li key={item.field} style={{ fontSize: "13px" }}>
                {item.message}
              </li>
            ))}
          </ul>
        </>
      )}

      {outstanding > 0 && (
        <GovernmentAlert type="warning" title="Clarifications outstanding">
          The department has asked {outstanding} question(s). Answer them before resubmitting.
        </GovernmentAlert>
      )}

      <div className="gov-form-actions">
        <button
          type="button"
          className="gov-btn gov-btn--primary gov-btn--lg"
          disabled={busy || !view.editable || !view.completeness.complete || outstanding > 0}
          onClick={onSubmit}
        >
          {view.response.submissionCount > 0 ? "Resubmit response" : "Submit response"}
        </button>

        {withdrawable && (
          <button
            type="button"
            className="gov-btn gov-btn--danger"
            disabled={busy}
            onClick={onWithdraw}
          >
            Withdraw response
          </button>
        )}
      </div>

      <p className="gov-fine-print" style={{ marginBottom: 0 }}>
        Submitting sends the response to {view.response.departmentName}. It cannot be edited
        afterwards unless the department requests a clarification. Submitting is not a contract
        and does not commit either side to an award.
      </p>
    </GovernmentCard>
  );
}

// ---------------------------------------------------------------------------
// Clarifications
// ---------------------------------------------------------------------------

function ClarificationsPanel({
  view,
  busy,
  drafts,
  onDraft,
  onAsk,
  onAnswer,
}: {
  view: VendorResponseWorkspace;
  busy: boolean;
  drafts: Record<string, string>;
  onDraft: (clarificationId: string, value: string) => void;
  onAsk: () => void;
  onAnswer: (clarificationId: string) => void;
}) {
  return (
    <GovernmentCard
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MailIcon size={18} />
          <span>Clarifications ({view.clarifications.length})</span>
        </div>
      }
      subtitle="Questions in both directions, kept with this response"
      action={
        view.config.allowClarifications && view.response.status !== "WITHDRAWN" ? (
          <button
            type="button"
            className="gov-btn gov-btn--secondary gov-btn--sm"
            disabled={busy}
            onClick={onAsk}
          >
            Ask a question
          </button>
        ) : undefined
      }
    >
      {!view.config.allowClarifications && (
        <p className="gov-fine-print">
          The department has not opened clarification questions on this work package. It can still
          ask you for one.
        </p>
      )}

      {view.clarifications.length === 0 ? (
        <p style={{ margin: 0 }}>Nothing has been asked on this response yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {view.clarifications.map((clarification) => {
            const fromDepartment = clarification.raisedBySide === "GOVERNMENT";

            return (
              <article key={clarification.id} className="gov-entry-card">
                <div className="gov-entry-card__head">
                  <h4 className="gov-entry-card__title">
                    {clarification.subject ??
                      (fromDepartment ? "Clarification requested" : "Your question")}
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
                  <span>{fromDepartment ? view.response.departmentName : "Your organisation"}</span>
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

                {clarification.status === "OPEN" && fromDepartment && (
                  <div className="gov-form-group" style={{ marginTop: "10px", marginBottom: 0 }}>
                    <label className="gov-form-label" htmlFor={`reply-${clarification.id}`}>
                      Your reply <span className="gov-form-required">*</span>
                    </label>
                    <textarea
                      id={`reply-${clarification.id}`}
                      className="gov-form-control"
                      rows={3}
                      maxLength={4000}
                      value={drafts[clarification.id] ?? ""}
                      disabled={busy}
                      onChange={(event) => onDraft(clarification.id, event.target.value)}
                    />
                    <div className="gov-form-actions">
                      <button
                        type="button"
                        className="gov-btn gov-btn--primary gov-btn--sm"
                        disabled={busy || (drafts[clarification.id] ?? "").trim().length === 0}
                        onClick={() => onAnswer(clarification.id)}
                      >
                        Send reply
                      </button>
                    </div>
                  </div>
                )}

                {clarification.status === "OPEN" && !fromDepartment && (
                  <p className="gov-fine-print" style={{ marginBottom: 0 }}>
                    Awaiting the department&rsquo;s reply.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </GovernmentCard>
  );
}
