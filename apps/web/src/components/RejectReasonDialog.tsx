import { useState, type FormEvent } from "react";

interface RejectReasonDialogProps {
  requirementText: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function RejectReasonDialog({ requirementText, onCancel, onConfirm }: RejectReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError("A reason is required when rejecting a suggestion.");
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="reject-heading">
      <div className="dialog">
        <h2 className="dialog__heading" id="reject-heading">
          Reject Suggestion
        </h2>
        <div className="dialog__body">
          <p className="dialog__context">{requirementText}</p>
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-field">
              <label className="form-field__label" htmlFor="reject-reason">
                Reason for rejection <span className="form-field__required">* required</span>
              </label>
              <p className="form-field__hint" id="reject-reason-hint">
                This reason is recorded against the item for audit purposes.
              </p>
              <textarea
                id="reject-reason"
                className={`form-field__input form-field__textarea${error === undefined ? "" : " form-field__input--error"}`}
                rows={4}
                value={reason}
                aria-describedby="reject-reason-hint"
                aria-invalid={error !== undefined}
                onChange={(event) => setReason(event.target.value)}
              />
              {error !== undefined && (
                <p className="form-field__error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="dialog__actions">
              <button type="button" className="button button--secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="button button--danger">
                Reject Suggestion
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
