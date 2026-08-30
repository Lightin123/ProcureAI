import React from "react";

import type {
  ConsistencyProblem,
  CriterionPayload,
  CriterionType,
  CriteriaSchema,
  EvaluationConfig,
} from "../api/workPackageEvaluation.js";
import { GovernmentAlert } from "./GovernmentAlert.js";
import { GovernmentCard } from "./GovernmentCard.js";
import { PlusIcon, TrashIcon } from "./GovernmentIcons.js";

/**
 * What responses are scored on.
 *
 * The criterion list comes from the API's own catalogue rather than being
 * written out here, so a criterion an official can add is exactly a criterion
 * the server knows how to compute. A second copy in the browser would let this
 * form offer a criterion the API cannot score.
 *
 * The weight total is shown continuously because it is the rule an official is
 * most likely to break: the criteria are stored either way, but a set that does
 * not add up to the required total is stored as a draft and an evaluation
 * refuses to run on it.
 */

interface EvaluationCriteriaPanelProps {
  schema: CriteriaSchema;
  config: EvaluationConfig | null;
  problems: ConsistencyProblem[];
  /** Which response sections this work package actually collects. */
  sections: Record<string, string>;
  responseType: string | null;
  questions: Array<{ id: string; prompt: string; answerType: string }>;
  requirementCount: number;
  busy: boolean;
  onSave: (payload: {
    title: string | null;
    notes: string | null;
    criteria: CriterionPayload[];
  }) => void;
}

interface DraftCriterion extends CriterionPayload {
  /** Local key so React can track rows that have no server id yet. */
  rowId: string;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return slug === "" ? "criterion" : slug;
}

function uniqueKey(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  let index = 2;
  while (taken.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function EvaluationCriteriaPanel({
  schema,
  config,
  problems,
  sections,
  responseType,
  questions,
  requirementCount,
  busy,
  onSave,
}: EvaluationCriteriaPanelProps) {
  const [title, setTitle] = React.useState(config?.title ?? "");
  const [notes, setNotes] = React.useState(config?.notes ?? "");
  const [criteria, setCriteria] = React.useState<DraftCriterion[]>(
    (config?.criteria ?? []).map((criterion, index) => ({
      rowId: `${criterion.id}-${index}`,
      criterionKey: criterion.criterionKey,
      criterionType: criterion.criterionType,
      direction: criterion.direction,
      label: criterion.label,
      description: criterion.description,
      weight: criterion.weight,
      targetValue: criterion.targetValue,
      questionId: criterion.questionId,
    })),
  );

  // Reloaded whenever the stored configuration changes, so the form shows what
  // was actually saved rather than what was last typed into it.
  React.useEffect(() => {
    if (config === null) return;
    setTitle(config.title ?? "");
    setNotes(config.notes ?? "");
    setCriteria(
      config.criteria.map((criterion, index) => ({
        rowId: `${criterion.id}-${index}`,
        criterionKey: criterion.criterionKey,
        criterionType: criterion.criterionType,
        direction: criterion.direction,
        label: criterion.label,
        description: criterion.description,
        weight: criterion.weight,
        targetValue: criterion.targetValue,
        questionId: criterion.questionId,
      })),
    );
  }, [config]);

  const totalWeight = criteria.reduce((sum, criterion) => sum + (criterion.weight || 0), 0);
  const balanced = totalWeight === schema.totalWeight;

  /** A criterion whose section is not collected cannot be scored from anything. */
  function unavailableReason(type: CriterionType): string | null {
    const definition = schema.criterionTypes.find((entry) => entry.type === type);
    if (definition === undefined) return null;

    if (definition.requiresSection !== null && (sections[definition.requiresSection] ?? "OFF") === "OFF") {
      const section = schema.sections.find((entry) => entry.id === definition.requiresSection);
      return `Not collected — the "${section?.label ?? definition.requiresSection}" section is switched off for this work package.`;
    }

    if (type === "REQUIREMENT_COMPLIANCE" && requirementCount === 0) {
      return "This work package carries no confirmed requirements to compare responses against.";
    }

    if (type === "CUSTOM" && questions.length === 0) {
      return "No departmental questions have been added to this work package's response form.";
    }

    return null;
  }

  function addCriterion(type: CriterionType): void {
    const definition = schema.criterionTypes.find((entry) => entry.type === type);
    if (definition === undefined) return;

    const key = uniqueKey(
      slugify(definition.label),
      criteria.map((criterion) => criterion.criterionKey),
    );

    setCriteria((current) => [
      ...current,
      {
        rowId: `new-${key}-${current.length}`,
        criterionKey: key,
        criterionType: type,
        direction: definition.direction,
        label: definition.label,
        description: null,
        weight: definition.defaultWeight,
        targetValue: null,
        questionId: type === "CUSTOM" ? (questions[0]?.id ?? null) : null,
      },
    ]);
  }

  function applyPreset(): void {
    const preset = responseType === null ? undefined : schema.presets[responseType];
    if (preset === undefined) return;

    const usable = preset.filter((entry) => unavailableReason(entry.criterionType) === null);
    if (usable.length === 0) return;

    // Dropping an unusable criterion leaves the preset's weights short, so the
    // remainder is redistributed proportionally and the last row absorbs the
    // rounding. An official who wants different weights changes them; what they
    // must not be handed is a preset that will not run.
    const presetTotal = usable.reduce((sum, entry) => sum + entry.weight, 0);
    let assigned = 0;

    const rows: DraftCriterion[] = usable.map((entry, index) => {
      const weight =
        index === usable.length - 1
          ? schema.totalWeight - assigned
          : Math.round((entry.weight / presetTotal) * schema.totalWeight);
      assigned += weight;

      const definition = schema.criterionTypes.find((item) => item.type === entry.criterionType);

      return {
        rowId: `preset-${entry.criterionType}-${index}`,
        criterionKey: slugify(entry.label),
        criterionType: entry.criterionType,
        direction: definition?.direction ?? "HIGHER_IS_BETTER",
        label: entry.label,
        description: null,
        weight,
        targetValue: null,
        questionId: null,
      };
    });

    setCriteria(rows);
  }

  function update(rowId: string, patch: Partial<DraftCriterion>): void {
    setCriteria((current) =>
      current.map((criterion) =>
        criterion.rowId === rowId ? { ...criterion, ...patch } : criterion,
      ),
    );
  }

  function remove(rowId: string): void {
    setCriteria((current) => current.filter((criterion) => criterion.rowId !== rowId));
  }

  /** Spreads the total evenly, which is the commonest thing an official wants. */
  function distributeEvenly(): void {
    if (criteria.length === 0) return;
    const share = Math.floor(schema.totalWeight / criteria.length);
    const remainder = schema.totalWeight - share * criteria.length;

    setCriteria((current) =>
      current.map((criterion, index) => ({
        ...criterion,
        weight: share + (index < remainder ? 1 : 0),
      })),
    );
  }

  const available = schema.criterionTypes.filter((definition) => {
    if (definition.type === "CUSTOM") return questions.length > 0;
    return !criteria.some((criterion) => criterion.criterionType === definition.type);
  });

  return (
    <GovernmentCard
      title="Evaluation criteria"
      subtitle="What every response to this work package is scored on, and how much each counts"
      action={
        config === null ? undefined : (
          <span
            className={
              config.status === "READY"
                ? "gov-badge gov-badge--operational"
                : "gov-badge gov-badge--draft"
            }
          >
            {config.status === "READY" ? "Ready to evaluate" : "Incomplete"}
          </span>
        )
      }
    >
      <GovernmentAlert type="info" title="How these scores are produced">
        Every score below is calculated by arithmetic over the figures suppliers stated in their
        submissions and the records on their capability profiles. No AI model produces, adjusts or
        influences a score or a rank. AI analysis is generated separately, is clearly marked as
        advisory, and is not an input to any of these numbers.
      </GovernmentAlert>

      {problems.length > 0 && (
        <GovernmentAlert type="warning" title="These criteria cannot be applied as they stand">
          <ul className="gov-plain-list" style={{ margin: 0 }}>
            {problems.map((problem) => (
              <li key={`${problem.field}-${problem.message}`} style={{ fontSize: "13px" }}>
                {problem.message}
              </li>
            ))}
          </ul>
        </GovernmentAlert>
      )}

      <div className="gov-form-grid">
        <div className="gov-form-group gov-form-group--wide">
          <label className="gov-form-label" htmlFor="evaluation-title">
            Name for this evaluation
          </label>
          <input
            id="evaluation-title"
            className="gov-form-control"
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Technical and commercial evaluation"
          />
        </div>
      </div>

      <div className="gov-form-group gov-form-group--wide">
        <label className="gov-form-label" htmlFor="evaluation-notes">
          Notes for the record
        </label>
        <span className="gov-form-hint">
          Why these criteria and these weights were chosen. Stored with the configuration and
          visible in the work package history.
        </span>
        <textarea
          id="evaluation-notes"
          className="gov-form-control"
          rows={3}
          maxLength={4000}
          value={notes}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="gov-table-toolbar">
        <div className="gov-filter-group">
          {responseType !== null && schema.presets[responseType] !== undefined && (
            <button
              type="button"
              className="gov-btn gov-btn--tertiary gov-btn--sm"
              disabled={busy}
              onClick={applyPreset}
            >
              Use the standard criteria for this response type
            </button>
          )}
          <button
            type="button"
            className="gov-btn gov-btn--tertiary gov-btn--sm"
            disabled={busy || criteria.length === 0}
            onClick={distributeEvenly}
          >
            Spread the weight evenly
          </button>
        </div>
        <span
          className={balanced ? "gov-badge gov-badge--operational" : "gov-badge gov-badge--pending"}
        >
          Weights total {totalWeight} of {schema.totalWeight}
        </span>
      </div>

      {criteria.length === 0 ? (
        <GovernmentAlert type="info" title="No criteria configured yet">
          Add the criteria this work package should be evaluated on, or start from the standard set
          for the response type you asked for.
        </GovernmentAlert>
      ) : (
        <div className="gov-table-container">
          <table className="gov-table">
            <caption className="gov-table-caption">
              Criterion, what it is scored from, threshold and weight
            </caption>
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col" style={{ width: "300px" }}>
                  How it is scored
                </th>
                <th scope="col" style={{ width: "190px" }}>
                  Threshold
                </th>
                <th scope="col" style={{ width: "110px" }}>
                  Weight
                </th>
                <th scope="col" style={{ width: "70px" }}>
                  Remove
                </th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((criterion) => {
                const definition = schema.criterionTypes.find(
                  (entry) => entry.type === criterion.criterionType,
                );
                const unavailable = unavailableReason(criterion.criterionType);

                return (
                  <tr key={criterion.rowId}>
                    <td>
                      <input
                        className="gov-form-control"
                        value={criterion.label}
                        maxLength={120}
                        disabled={busy}
                        aria-label="Criterion name"
                        onChange={(event) =>
                          update(criterion.rowId, { label: event.target.value })
                        }
                      />
                      <div style={{ fontSize: "11px", color: "var(--gov-text-muted)", marginTop: "4px" }}>
                        {definition?.label ?? criterion.criterionType}
                      </div>
                      {criterion.criterionType === "CUSTOM" && (
                        <select
                          className="gov-select"
                          style={{ marginTop: "6px", width: "100%" }}
                          value={criterion.questionId ?? ""}
                          disabled={busy}
                          aria-label="Question this criterion is scored from"
                          onChange={(event) =>
                            update(criterion.rowId, {
                              questionId: event.target.value === "" ? null : event.target.value,
                            })
                          }
                        >
                          <option value="">Choose a question…</option>
                          {questions.map((question) => (
                            <option key={question.id} value={question.id}>
                              {question.prompt}
                            </option>
                          ))}
                        </select>
                      )}
                      {criterion.criterionType === "CUSTOM" && (
                        <select
                          className="gov-select"
                          style={{ marginTop: "6px", width: "100%" }}
                          value={criterion.direction}
                          disabled={busy}
                          aria-label="Which end of the scale is better"
                          onChange={(event) =>
                            update(criterion.rowId, {
                              direction:
                                event.target.value === "LOWER_IS_BETTER"
                                  ? "LOWER_IS_BETTER"
                                  : "HIGHER_IS_BETTER",
                            })
                          }
                        >
                          <option value="HIGHER_IS_BETTER">A higher answer is better</option>
                          <option value="LOWER_IS_BETTER">A lower answer is better</option>
                        </select>
                      )}
                    </td>
                    <td style={{ fontSize: "12px" }}>
                      {definition?.method}
                      {unavailable !== null && (
                        <div style={{ color: "var(--gov-danger)", marginTop: "4px" }}>
                          {unavailable}
                        </div>
                      )}
                    </td>
                    <td>
                      {definition?.supportsTarget === true ? (
                        <>
                          <input
                            className="gov-form-control"
                            type="number"
                            min={1}
                            value={criterion.targetValue ?? ""}
                            disabled={busy}
                            aria-label={definition.targetLabel ?? "Threshold"}
                            onChange={(event) =>
                              update(criterion.rowId, {
                                targetValue:
                                  event.target.value === ""
                                    ? null
                                    : Number.parseFloat(event.target.value),
                              })
                            }
                          />
                          <div style={{ fontSize: "11px", color: "var(--gov-text-muted)", marginTop: "4px" }}>
                            {definition.targetLabel}. {definition.targetHint}
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                          Not applicable
                        </span>
                      )}
                    </td>
                    <td>
                      <input
                        className="gov-form-control"
                        type="number"
                        min={1}
                        max={100}
                        value={criterion.weight}
                        disabled={busy}
                        aria-label="Weight"
                        onChange={(event) =>
                          update(criterion.rowId, {
                            weight: Number.parseInt(event.target.value, 10) || 0,
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="gov-btn gov-btn--danger gov-btn--sm"
                        disabled={busy}
                        aria-label={`Remove ${criterion.label}`}
                        onClick={() => remove(criterion.rowId)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {available.length > 0 && (
        <div className="gov-form-section">
          <h3 className="gov-form-section__title">Add a criterion</h3>
          <p className="gov-form-section__description">
            Only criteria that can be scored from what this work package actually collects should be
            added. A criterion whose section was not asked for is marked below.
          </p>
          <div className="gov-option-grid">
            {available.map((definition) => {
              const unavailable = unavailableReason(definition.type);

              return (
                <button
                  key={definition.type}
                  type="button"
                  className="gov-btn gov-btn--secondary gov-btn--sm"
                  disabled={busy || unavailable !== null}
                  title={unavailable ?? definition.description}
                  onClick={() => addCriterion(definition.type)}
                >
                  <PlusIcon size={14} /> {definition.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="gov-form-actions gov-form-actions--split">
        <span className="gov-form-actions__status">
          {balanced
            ? "The weights add up. Save to make this evaluation runnable."
            : `Adjust the weights to total ${schema.totalWeight} before an evaluation can be run.`}
        </span>
        <div className="gov-form-actions__buttons">
          <button
            type="button"
            className="gov-btn gov-btn--primary"
            disabled={busy || criteria.length === 0}
            onClick={() =>
              onSave({
                title: title.trim() === "" ? null : title.trim(),
                notes: notes.trim() === "" ? null : notes.trim(),
                criteria: criteria.map(({ rowId: _rowId, ...criterion }) => criterion),
              })
            }
          >
            Save criteria
          </button>
        </div>
      </div>

      {config !== null && (
        <p className="gov-fine-print" style={{ marginBottom: 0 }}>
          Version {config.criteriaVersion}, last changed by {config.updatedByName}. Every evaluation
          run keeps its own copy of the criteria that were applied, so changing them here does not
          alter a score already recorded.
        </p>
      )}
    </GovernmentCard>
  );
}
