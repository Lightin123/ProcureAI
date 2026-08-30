import React from "react";

import { formatInr, type EvaluationResult } from "../api/workPackageEvaluation.js";
import { GovernmentAlert } from "./GovernmentAlert.js";
import { GovernmentModal } from "./GovernmentModal.js";

/**
 * Records the procurement decision a named official made.
 *
 * Nothing on this screen is pre-filled with an outcome and nothing recommends
 * one. The official chooses a supplier and types the reason; the ranking that
 * was on screen is shown beside the field so the two are recorded together, and
 * the reason is mandatory because a decision without a stated reason is a
 * record of an outcome rather than of a decision.
 */

const MINIMUM_REASON = 20;

interface RecordDecisionModalProps {
  result: EvaluationResult | undefined;
  decision: "SELECTED" | "REJECTED";
  packageLabel: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function RecordDecisionModal({
  result,
  decision,
  packageLabel,
  busy,
  onConfirm,
  onCancel,
}: RecordDecisionModalProps) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    setReason("");
  }, [result?.responseId, decision]);

  if (result === undefined) return null;

  const name = result.legalName ?? result.organizationName;
  const trimmed = reason.trim();
  const selecting = decision === "SELECTED";

  return (
    <GovernmentModal
      isOpen={true}
      title={selecting ? "Select this supplier" : "Record this supplier as not selected"}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="gov-btn gov-btn--tertiary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={selecting ? "gov-btn gov-btn--success" : "gov-btn gov-btn--danger"}
            disabled={busy || trimmed.length < MINIMUM_REASON}
            onClick={() => onConfirm(trimmed)}
          >
            {selecting ? "Record selection" : "Record rejection"}
          </button>
        </>
      }
    >
      <GovernmentAlert type="warning" title="This is a decision, not a calculation">
        The evaluation below is decision support. Recording this decision attributes it to you, with
        the reason you give and the moment you give it. It cannot be edited afterwards — a
        correction is recorded as a revocation alongside the original.
      </GovernmentAlert>

      <dl className="gov-desc-list">
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Supplier</dt>
          <dd className="gov-desc-val">{name}</dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Work package</dt>
          <dd className="gov-desc-val">{packageLabel}</dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Position in the evaluation</dt>
          <dd className="gov-desc-val">
            {result.rankPosition === null
              ? "Not ranked"
              : `Rank ${result.rankPosition} — ${result.totalScore.toFixed(2)} of 100`}
          </dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Quoted value</dt>
          <dd className="gov-desc-val gov-desc-val--mono">
            {formatInr(result.structuredSummary.quotedValueInr ?? null)}
          </dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Requirement compliance</dt>
          <dd className="gov-desc-val">
            {result.complianceSummary.compliant} of {result.complianceSummary.total} met
            {result.complianceSummary.insufficientInformation > 0
              ? `, ${result.complianceSummary.insufficientInformation} with insufficient information`
              : ""}
          </dd>
        </div>
      </dl>

      {result.missingInformation.length > 0 && (
        <GovernmentAlert type="info" title="Outstanding information on this response">
          <ul className="gov-plain-list" style={{ margin: 0 }}>
            {result.missingInformation.slice(0, 5).map((item) => (
              <li key={item.message} style={{ fontSize: "12px" }}>
                <strong>{item.source}:</strong> {item.message}
              </li>
            ))}
          </ul>
        </GovernmentAlert>
      )}

      <div className="gov-form-group gov-form-group--wide">
        <label className="gov-form-label" htmlFor="decision-reason">
          Reason for this decision <span className="gov-form-required">*</span>
        </label>
        <span className="gov-form-hint">
          What you concluded, and on what basis. This is the part of the record a later reviewer
          reads: the scores say what was calculated, this says what you decided from it.
        </span>
        <textarea
          id="decision-reason"
          className="gov-form-control"
          rows={5}
          maxLength={4000}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            selecting
              ? "e.g. Highest evaluated response, meets every mandatory requirement, and the quoted value is within the sanctioned estimate."
              : "e.g. Does not evidence the mandatory BIS certification and quoted above the sanctioned ceiling."
          }
        />
        {trimmed.length > 0 && trimmed.length < MINIMUM_REASON && (
          <span className="gov-form-error">
            State the reason in at least a sentence ({MINIMUM_REASON} characters).
          </span>
        )}
      </div>
    </GovernmentModal>
  );
}
