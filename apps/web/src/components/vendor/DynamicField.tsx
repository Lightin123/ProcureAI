import React from "react";

import type { OnboardingField } from "../../api/vendor.js";
import { TagInput } from "./TagInput.js";

export interface DynamicFieldProps {
  field: OnboardingField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  /** States and sub-domain suggestions come from the served taxonomy. */
  states: readonly string[];
  subDomainSuggestions: readonly string[];
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function toggle(list: string[], entry: string): string[] {
  return list.includes(entry) ? list.filter((item) => item !== entry) : [...list, entry];
}

/**
 * Renders one question from the served onboarding schema. Every field type the
 * schema can declare is handled here, so adding a question to the API's
 * questionnaire needs no change in the portal.
 */
export function DynamicField({
  field,
  value,
  onChange,
  error,
  states,
  subDomainSuggestions,
}: DynamicFieldProps) {
  const id = `field-${field.path.replace(/\./g, "-")}`;
  const hintId = field.hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter((entry) => entry !== undefined).join(" ") || undefined;
  const invalidClass = error === undefined ? "" : " gov-form-control--error";

  function label(control: React.ReactNode, labelFor?: string) {
    return (
      <div className={`gov-form-group${field.wide === true ? " gov-form-group--wide" : ""}`}>
        <label className="gov-form-label" htmlFor={labelFor ?? id}>
          {field.label}
          {field.required === true && <span className="gov-form-required">*</span>}
        </label>
        {field.hint !== undefined && (
          <p className="gov-form-hint" id={hintId}>
            {field.hint}
          </p>
        )}
        {control}
        {error !== undefined && (
          <p className="gov-form-error" id={errorId}>
            {error}
          </p>
        )}
      </div>
    );
  }

  switch (field.type) {
    case "textarea":
      return label(
        <textarea
          id={id}
          className={`gov-form-control${invalidClass}`}
          rows={field.rows ?? 4}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          value={asString(value)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
          onChange={(event) => onChange(event.target.value)}
        />,
      );

    case "select":
      return label(
        <select
          id={id}
          className={`gov-form-control${invalidClass}`}
          value={asString(value)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>,
      );

    case "state":
      return label(
        <select
          id={id}
          className={`gov-form-control${invalidClass}`}
          value={asString(value)}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select…</option>
          {states.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>,
      );

    case "multiselect": {
      const selected = asArray(value);
      return label(
        <div className="gov-option-grid" role="group" aria-describedby={describedBy}>
          {(field.options ?? []).map((option) => (
            <label key={option.value} className="gov-option-card">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => onChange(toggle(selected, option.value))}
              />
              <span className="gov-option-card__body">
                <span className="gov-option-card__label">{option.label}</span>
                {option.hint !== undefined && (
                  <span className="gov-option-card__hint">{option.hint}</span>
                )}
              </span>
            </label>
          ))}
        </div>,
        undefined,
      );
    }

    case "states": {
      const selected = asArray(value);
      return label(
        <div className="gov-state-picker" role="group" aria-describedby={describedBy}>
          <div className="gov-state-picker__actions">
            <button
              type="button"
              className="gov-btn gov-btn--tertiary gov-btn--sm"
              onClick={() => onChange([...states])}
            >
              Select all
            </button>
            <button
              type="button"
              className="gov-btn gov-btn--tertiary gov-btn--sm"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
            >
              Clear
            </button>
            <span className="gov-state-picker__count">{selected.length} selected</span>
          </div>
          <div className="gov-state-picker__grid">
            {states.map((state) => (
              <label key={state} className="gov-state-picker__item">
                <input
                  type="checkbox"
                  checked={selected.includes(state)}
                  onChange={() => onChange(toggle(selected, state))}
                />
                <span>{state}</span>
              </label>
            ))}
          </div>
        </div>,
        undefined,
      );
    }

    case "tags":
      return label(
        <TagInput
          id={id}
          value={asArray(value)}
          onChange={onChange}
          placeholder={field.placeholder}
          describedBy={describedBy}
        />,
      );

    case "subdomains":
      return label(
        <TagInput
          id={id}
          value={asArray(value)}
          onChange={onChange}
          suggestions={subDomainSuggestions}
          placeholder="Add a sub-domain"
          describedBy={describedBy}
        />,
      );

    case "boolean":
      return label(
        <label className="gov-switch" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{value === true ? "Yes" : "No"}</span>
        </label>,
      );

    case "number":
    case "year":
      return label(
        <input
          id={id}
          type="number"
          className={`gov-form-control${invalidClass}`}
          value={asString(value)}
          min={field.min}
          max={field.max}
          step={1}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
          onChange={(event) => onChange(event.target.value)}
        />,
      );

    case "currency":
      return label(
        <div className="gov-currency-input">
          <span className="gov-currency-input__symbol" aria-hidden="true">
            ₹
          </span>
          <input
            id={id}
            type="number"
            className={`gov-form-control${invalidClass}`}
            value={asString(value)}
            min={field.min ?? 0}
            step={1000}
            inputMode="decimal"
            aria-describedby={describedBy}
            aria-invalid={error !== undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>,
      );

    default:
      return label(
        <input
          id={id}
          type={field.type === "url" ? "url" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
          className={`gov-form-control${invalidClass}`}
          value={asString(value)}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
          onChange={(event) => onChange(event.target.value)}
        />,
      );
  }
}
