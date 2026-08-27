import { useState, type FormEvent } from "react";
import { GovernmentModal } from "./GovernmentModal.js";

export interface RejectReasonDialogProps {
  requirementText: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function RejectReasonDialog({
  requirementText,
  onConfirm,
  onCancel,
}: RejectReasonDialogProps) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const isValid = trimmed.length >= 3;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    onConfirm(trimmed);
  }

  return (
    <GovernmentModal
      isOpen={true}
      title="Record Rejection Reason"
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            className="gov-btn gov-btn--tertiary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="gov-btn gov-btn--danger"
            disabled={!isValid}
            onClick={handleSubmit}
          >
            Confirm Rejection
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <p className="gov-form-hint" style={{ marginBottom: "12px" }}>
          You are rejecting the following suggestion:
        </p>

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
          “{requirementText}”
        </blockquote>

        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="rejection-reason">
            Reason for rejection <span className="gov-form-required">*</span>
          </label>
          <p className="gov-form-hint" id="rejection-reason-hint">
            Record the administrative or technical rationale for audit and procurement transparency.
          </p>
          <textarea
            id="rejection-reason"
            className="gov-form-control"
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="State why this requirement/constraint is not appropriate..."
            aria-describedby="rejection-reason-hint"
            autoFocus
          />
        </div>
      </form>
    </GovernmentModal>
  );
}
