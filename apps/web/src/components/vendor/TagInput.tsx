import React, { useState, type KeyboardEvent } from "react";

export interface TagInputProps {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: readonly string[];
  maxTags?: number;
  describedBy?: string;
}

/**
 * Free-text entries captured one idea at a time. A vendor whose vocabulary the
 * platform has never seen — "vermicompost windrow turning", "OPC 53 grade
 * clinker" — can still record it, which is the point of keeping this
 * unconstrained alongside the fixed taxonomy.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  suggestions = [],
  maxTags = 40,
  describedBy,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const remainingSuggestions = suggestions
    .filter((suggestion) => !value.includes(suggestion))
    .slice(0, 8);

  function commit(raw: string) {
    const entry = raw.trim();
    if (entry === "" || value.includes(entry) || value.length >= maxTags) {
      setDraft("");
      return;
    }
    onChange([...value, entry]);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
      return;
    }

    if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="gov-tag-input">
      {value.length > 0 && (
        <ul className="gov-tag-input__list">
          {value.map((entry) => (
            <li key={entry} className="gov-tag-input__chip">
              <span>{entry}</span>
              <button
                type="button"
                className="gov-tag-input__remove"
                aria-label={`Remove ${entry}`}
                onClick={() => onChange(value.filter((item) => item !== entry))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="gov-tag-input__entry">
        <input
          id={id}
          type="text"
          className="gov-form-control"
          value={draft}
          placeholder={placeholder ?? "Type an entry and press Enter"}
          aria-describedby={describedBy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
        />
        <button
          type="button"
          className="gov-btn gov-btn--secondary gov-btn--sm"
          onClick={() => commit(draft)}
          disabled={draft.trim() === ""}
        >
          Add
        </button>
      </div>

      {remainingSuggestions.length > 0 && (
        <div className="gov-tag-input__suggestions">
          <span className="gov-tag-input__suggestions-label">Suggested:</span>
          {remainingSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="gov-tag-input__suggestion"
              onClick={() => commit(suggestion)}
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
