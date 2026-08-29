import React from "react";

import type {
  ConfigPayload,
  ResponseConfig,
  ResponseQuestion,
  ResponseSchema,
  ResponseType,
  SectionMode,
} from "../api/workPackageResponses.js";
import { CONFIG_STATUS_BADGE } from "../api/workPackageResponses.js";
import { GovernmentAlert } from "./GovernmentAlert.js";
import { GovernmentCard } from "./GovernmentCard.js";
import { PlusIcon, TrashIcon } from "./GovernmentIcons.js";

/**
 * What the department is asking every invited supplier for.
 *
 * The section list, the response types and the answer types all come from the
 * API's own catalogue rather than being written out here (D58), so a section an
 * official can switch on is exactly a section the server validates and the
 * supplier is shown. A second copy in the browser would let this form offer a
 * choice the API does not honour.
 *
 * Editing what is being asked for is disabled once a supplier has submitted:
 * the API refuses it, and disabling the controls explains why rather than
 * letting the officer discover it through a 409.
 */

interface ResponseConfigPanelProps {
  schema: ResponseSchema;
  config: ResponseConfig | null;
  questions: ResponseQuestion[];
  busy: boolean;
  /** True once any supplier has submitted; freezes what is being asked for. */
  frozen: boolean;
  onSave: (payload: ConfigPayload) => void;
  onOpen: () => void;
  onClose: () => void;
  onAddQuestion: (question: {
    section: string;
    prompt: string;
    helpText: string | null;
    answerType: ResponseQuestion["answerType"];
    options: string[];
    isRequired: boolean;
  }) => void;
  onRemoveQuestion: (questionId: string) => void;
}

const MODE_LABEL: Record<SectionMode, string> = {
  OFF: "Not asked for",
  OPTIONAL: "Optional",
  REQUIRED: "Required",
};

export function ResponseConfigPanel({
  schema,
  config,
  questions,
  busy,
  frozen,
  onSave,
  onOpen,
  onClose,
  onAddQuestion,
  onRemoveQuestion,
}: ResponseConfigPanelProps) {
  const [responseType, setResponseType] = React.useState<ResponseType>(
    config?.responseType ?? "PROPOSAL",
  );
  const [title, setTitle] = React.useState(config?.title ?? "");
  const [instructions, setInstructions] = React.useState(config?.instructions ?? "");
  const [deadline, setDeadline] = React.useState(config?.responseDeadline ?? "");
  const [sections, setSections] = React.useState<Record<string, SectionMode>>(
    config?.sections ?? schema.defaultSections.PROPOSAL,
  );
  const [allowClarifications, setAllowClarifications] = React.useState(
    config?.allowClarifications ?? true,
  );
  const [allowDocuments, setAllowDocuments] = React.useState(config?.allowDocuments ?? true);
  const [documentsRequired, setDocumentsRequired] = React.useState(
    config?.documentsRequired ?? false,
  );

  // Reloaded whenever the stored configuration changes, so the form reflects
  // what was actually saved rather than what was last typed.
  React.useEffect(() => {
    if (config === null) return;
    setResponseType(config.responseType);
    setTitle(config.title ?? "");
    setInstructions(config.instructions ?? "");
    setDeadline(config.responseDeadline ?? "");
    setSections(config.sections);
    setAllowClarifications(config.allowClarifications);
    setAllowDocuments(config.allowDocuments);
    setDocumentsRequired(config.documentsRequired);
  }, [config]);

  /**
   * Changing the response type resets the section modes to that type's own
   * defaults. Carrying a proposal's sections into a quotation would leave an
   * official asking for an execution methodology in a priced response.
   */
  function chooseType(next: ResponseType): void {
    setResponseType(next);
    setSections({ ...schema.defaultSections[next] });
  }

  const badge = config === null ? null : CONFIG_STATUS_BADGE[config.status];
  const locked = frozen || busy;

  return (
    <>
      <GovernmentCard
        title="What suppliers are being asked for"
        subtitle="Configured once for this work package, so every response can be read side by side"
        action={badge === null ? undefined : <span className={badge.className}>{badge.label}</span>}
      >
        {frozen && (
          <GovernmentAlert type="info" title="A supplier has already submitted">
            The response type and the sections asked for are now fixed. The deadline and the
            instructions can still be changed — extending a date disadvantages nobody, but
            changing what is being asked for after a submission would change the terms of a
            competition already under way.
          </GovernmentAlert>
        )}

        <fieldset className="gov-form-group" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="gov-form-label">
            Type of response <span className="gov-form-required">*</span>
          </legend>
          <div className="gov-option-grid">
            {schema.responseTypes.map((option) => (
              <label key={option.value} className="gov-option-card">
                <input
                  type="radio"
                  name="response-type"
                  value={option.value}
                  checked={responseType === option.value}
                  disabled={locked}
                  onChange={() => chooseType(option.value)}
                />
                <span className="gov-option-card__body">
                  <span className="gov-option-card__label">{option.label}</span>
                  <span className="gov-option-card__hint">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="gov-form-grid">
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="response-title">
              Title shown to suppliers
            </label>
            <input
              id="response-title"
              className="gov-form-control"
              maxLength={200}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Proposal for ward level waste infrastructure"
            />
          </div>

          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="response-deadline">
              Responses due by
            </label>
            <input
              id="response-deadline"
              type="date"
              className="gov-form-control"
              value={deadline}
              disabled={busy}
              onChange={(event) => setDeadline(event.target.value)}
            />
            <p className="gov-form-hint">
              Optional. Shown to every invited supplier, and enforced when they submit.
            </p>
          </div>
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="response-instructions">
            Instructions to suppliers
          </label>
          <textarea
            id="response-instructions"
            className="gov-form-control"
            rows={4}
            maxLength={8000}
            value={instructions}
            disabled={busy}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="What the department expects in the response, and anything a supplier must attach…"
          />
        </div>

        <h3 className="gov-section-title">Sections</h3>
        <p className="gov-form-hint" style={{ marginTop: 0 }}>
          A required section must be completed before a supplier can submit. An optional one is
          offered but never demanded. A section that is not asked for is not shown at all.
        </p>

        <div className="gov-table-container">
          <table className="gov-table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col" style={{ width: "420px" }}>
                  How it is treated
                </th>
              </tr>
            </thead>
            <tbody>
              {schema.sections.map((section) => {
                const mode = sections[section.id] ?? "OPTIONAL";

                return (
                  <tr key={section.id}>
                    <td>
                      <strong>{section.label}</strong>
                      <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                        {section.description}
                      </div>
                    </td>
                    <td>
                      {section.alwaysOn ? (
                        <span className="gov-tag gov-tag--meta">
                          Always required — this is what a response is
                        </span>
                      ) : (
                        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                          {schema.sectionModes.map((option) => (
                            <label key={option} className="gov-checkbox">
                              <input
                                type="radio"
                                name={`section-${section.id}`}
                                value={option}
                                checked={mode === option}
                                disabled={locked}
                                onChange={() =>
                                  setSections((current) => ({ ...current, [section.id]: option }))
                                }
                              />
                              <span>{MODE_LABEL[option]}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h3 className="gov-section-title">Clarifications and documents</h3>

        <label className="gov-switch" style={{ marginBottom: "10px" }}>
          <input
            type="checkbox"
            checked={allowClarifications}
            disabled={busy}
            onChange={(event) => setAllowClarifications(event.target.checked)}
          />
          <span>
            Suppliers may ask the department clarification questions on this work package
          </span>
        </label>

        <label className="gov-switch" style={{ marginBottom: "10px" }}>
          <input
            type="checkbox"
            checked={allowDocuments}
            disabled={locked}
            onChange={(event) => {
              setAllowDocuments(event.target.checked);
              if (!event.target.checked) setDocumentsRequired(false);
            }}
          />
          <span>Suppliers may attach supporting documents</span>
        </label>

        <label className="gov-switch">
          <input
            type="checkbox"
            checked={documentsRequired}
            disabled={locked || !allowDocuments}
            onChange={(event) => setDocumentsRequired(event.target.checked)}
          />
          <span>At least one supporting document is required before a supplier can submit</span>
        </label>

        <div className="gov-form-actions">
          <button
            type="button"
            className="gov-btn gov-btn--primary"
            disabled={busy}
            onClick={() =>
              onSave({
                responseType,
                title: title.trim() === "" ? null : title.trim(),
                instructions: instructions.trim() === "" ? null : instructions.trim(),
                responseDeadline: deadline === "" ? null : deadline,
                sections,
                allowClarifications,
                allowDocuments,
                documentsRequired,
              })
            }
          >
            {config === null ? "Save configuration" : "Save changes"}
          </button>

          {config?.status === "DRAFT" && (
            <button
              type="button"
              className="gov-btn gov-btn--success"
              disabled={busy}
              onClick={onOpen}
            >
              Open to invited suppliers
            </button>
          )}

          {config?.status === "OPEN" && (
            <button
              type="button"
              className="gov-btn gov-btn--secondary"
              disabled={busy}
              onClick={onClose}
            >
              Close collection
            </button>
          )}
        </div>

        {config?.status === "DRAFT" && (
          <p className="gov-fine-print" style={{ marginBottom: 0 }}>
            Nothing is visible to suppliers until this is opened. Opening notifies every supplier
            that has accepted its invitation to this work package.
          </p>
        )}
      </GovernmentCard>

      <QuestionEditor
        schema={schema}
        questions={questions}
        disabled={config === null || frozen || busy}
        frozen={frozen}
        configured={config !== null}
        onAdd={onAddQuestion}
        onRemove={onRemoveQuestion}
      />
    </>
  );
}

interface QuestionEditorProps {
  schema: ResponseSchema;
  questions: ResponseQuestion[];
  disabled: boolean;
  frozen: boolean;
  configured: boolean;
  onAdd: ResponseConfigPanelProps["onAddQuestion"];
  onRemove: (questionId: string) => void;
}

/**
 * The department's own questions, over and above the standard sections.
 *
 * They belong to the configuration rather than to any one response, which is
 * what keeps the answers comparable across suppliers.
 */
function QuestionEditor({
  schema,
  questions,
  disabled,
  frozen,
  configured,
  onAdd,
  onRemove,
}: QuestionEditorProps) {
  const answerable = schema.sections.filter((section) => !section.perRequirement);

  const [section, setSection] = React.useState(answerable[0]?.id ?? "technical");
  const [prompt, setPrompt] = React.useState("");
  const [helpText, setHelpText] = React.useState("");
  const [answerType, setAnswerType] =
    React.useState<ResponseQuestion["answerType"]>("SHORT_TEXT");
  const [options, setOptions] = React.useState("");
  const [isRequired, setIsRequired] = React.useState(false);

  const needsOptions =
    schema.questionTypes.find((type) => type.value === answerType)?.requiresOptions === true;

  const parsedOptions = options
    .split("\n")
    .map((option) => option.trim())
    .filter((option) => option !== "");

  const canAdd =
    !disabled && prompt.trim().length >= 5 && (!needsOptions || parsedOptions.length >= 2);

  return (
    <GovernmentCard
      title={`Custom questions (${questions.length})`}
      subtitle="Asked of every supplier, alongside the standard sections"
    >
      {!configured && (
        <p className="gov-form-hint" style={{ marginTop: 0 }}>
          Save the configuration above before adding questions to it.
        </p>
      )}

      {questions.length > 0 && (
        <div className="gov-table-container" style={{ marginBottom: "16px" }}>
          <table className="gov-table">
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col" style={{ width: "150px" }}>
                  Section
                </th>
                <th scope="col" style={{ width: "130px" }}>
                  Answer
                </th>
                <th scope="col" style={{ width: "100px" }}>
                  Required
                </th>
                <th scope="col" style={{ width: "90px" }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr key={question.id}>
                  <td>
                    {question.prompt}
                    {question.options.length > 0 && (
                      <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                        {question.options.join(" · ")}
                      </div>
                    )}
                  </td>
                  <td>
                    {schema.sections.find((entry) => entry.id === question.section)?.label ??
                      question.section}
                  </td>
                  <td>
                    {schema.questionTypes.find((type) => type.value === question.answerType)
                      ?.label ?? question.answerType}
                  </td>
                  <td>{question.isRequired ? "Yes" : "No"}</td>
                  <td>
                    <button
                      type="button"
                      className="gov-btn gov-btn--tertiary gov-btn--sm"
                      style={{ color: "var(--gov-danger)" }}
                      disabled={disabled}
                      title={frozen ? "A supplier has already answered this question" : undefined}
                      onClick={() => onRemove(question.id)}
                    >
                      <TrashIcon size={14} />
                      <span>Remove</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="gov-form-grid">
        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="question-section">
            Show under
          </label>
          <select
            id="question-section"
            className="gov-select"
            value={section}
            disabled={disabled}
            onChange={(event) => setSection(event.target.value)}
          >
            {answerable.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="question-type">
            Answer type
          </label>
          <select
            id="question-type"
            className="gov-select"
            value={answerType}
            disabled={disabled}
            onChange={(event) =>
              setAnswerType(event.target.value as ResponseQuestion["answerType"])
            }
          >
            {schema.questionTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="gov-form-group">
        <label className="gov-form-label" htmlFor="question-prompt">
          Question
        </label>
        <input
          id="question-prompt"
          className="gov-form-control"
          maxLength={1000}
          value={prompt}
          disabled={disabled}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="How will segregated material be transported to the processing site?"
        />
      </div>

      <div className="gov-form-group">
        <label className="gov-form-label" htmlFor="question-help">
          Guidance for suppliers
        </label>
        <input
          id="question-help"
          className="gov-form-control"
          maxLength={1000}
          value={helpText}
          disabled={disabled}
          onChange={(event) => setHelpText(event.target.value)}
        />
      </div>

      {needsOptions && (
        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="question-options">
            Options, one per line <span className="gov-form-required">*</span>
          </label>
          <textarea
            id="question-options"
            className="gov-form-control"
            rows={4}
            value={options}
            disabled={disabled}
            onChange={(event) => setOptions(event.target.value)}
            placeholder={"Own fleet\nContracted transport\nMunicipal fleet"}
          />
          {parsedOptions.length === 1 && (
            <p className="gov-form-error">Offer at least two options to choose from.</p>
          )}
        </div>
      )}

      <label className="gov-switch">
        <input
          type="checkbox"
          checked={isRequired}
          disabled={disabled}
          onChange={(event) => setIsRequired(event.target.checked)}
        />
        <span>A supplier cannot submit without answering this</span>
      </label>

      <div className="gov-form-actions">
        <button
          type="button"
          className="gov-btn gov-btn--secondary"
          disabled={!canAdd}
          onClick={() => {
            onAdd({
              section,
              prompt: prompt.trim(),
              helpText: helpText.trim() === "" ? null : helpText.trim(),
              answerType,
              options: needsOptions ? parsedOptions : [],
              isRequired,
            });
            setPrompt("");
            setHelpText("");
            setOptions("");
            setIsRequired(false);
          }}
        >
          <PlusIcon size={16} />
          <span>Add question</span>
        </button>
      </div>
    </GovernmentCard>
  );
}
