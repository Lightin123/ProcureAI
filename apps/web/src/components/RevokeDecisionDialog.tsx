import React from "react";

import { DECISION_BADGE, type ProcurementDecision } from "../api/workPackageEvaluation.js";
import { GovernmentAlert } from "./GovernmentAlert.js";
import { GovernmentModal } from "./GovernmentModal.js";

/**
 * Revokes a recorded procurement decision.
 *
 * The original decision and its reason are shown, because what is being
 * revoked is a statement somebody made and stands by until this moment. The
 * revocation carries its own reason for the same purpose the original one did:
 * neither row is edited, so the record reads as a sequence of decisions rather
 * than as a single mutable field.
 */

const MINIMUM_REASON = 20;

interface RevokeDecisionDialogProps {
  decision: ProcurementDecision | undefined;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function RevokeDecisionDialog({
  decision,
  busy,
  onConfirm,
  onCancel,
}: RevokeDecisionDialogProps) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    setReason("");
  }, [decision?.id]);

  if (decision === undefined) return null;

  const trimmed = reason.trim();
  const badge = DECISION_BADGE[decision.decision];

  return (
    <GovernmentModal
      isOpen={true}
      title="Revoke this decision"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="gov-btn gov-btn--tertiary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="gov-btn gov-btn--danger"
            disabled={busy || trimmed.length < MINIMUM_REASON}
            onClick={() => onConfirm(trimmed)}
          >
            Revoke decision
          </button>
        </>
      }
    >
      <GovernmentAlert type="warning" title="The original decision stays on the record">
        Revoking does not delete what was decided. The original decision, its reason and its author
        remain, and this revocation is recorded alongside them with your own reason.
      </GovernmentAlert>

      <dl className="gov-desc-list">
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Supplier</dt>
          <dd className="gov-desc-val">{decision.legalName ?? decision.organizationName}</dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Decision being revoked</dt>
          <dd className="gov-desc-val">
            <span className={badge?.className}>{badge?.label}</span>
          </dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Recorded by</dt>
          <dd className="gov-desc-val">{decision.decidedByName}</dd>
        </div>
      </dl>

      <blockquote
        style={{
          margin: "0 0 16px",
          padding: "10px 14px",
          backgroundColor: "var(--gov-bg-alt)",
          borderLeft: "3px solid var(--gov-danger)",
          fontSize: "14px",
          fontStyle: "italic",
          color: "var(--gov-text-primary)",
        }}
      >
        “{decision.reason}”
      </blockquote>

      <div className="gov-form-group gov-form-group--wide">
        <label className="gov-form-label" htmlFor="revocation-reason">
          Reason for revoking <span className="gov-form-required">*</span>
        </label>
        <span className="gov-form-hint">
          What changed, or what was wrong with the decision as recorded. A later reviewer reads this
          beside the original.
        </span>
        <textarea
          id="revocation-reason"
          className="gov-form-control"
          rows={4}
          maxLength={4000}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Revoked pending a clarification on the quoted price validity period."
          autoFocus
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
