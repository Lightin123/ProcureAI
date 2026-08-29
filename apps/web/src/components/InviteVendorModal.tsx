import React from "react";

import type { ShortlistEntry } from "../api/vendorMatching.js";
import { GovernmentModal } from "./GovernmentModal.js";

/**
 * Issues an invitation to a supplier already on this work package's shortlist.
 *
 * Both fields are optional and neither is pre-filled. A default deadline would
 * put a date in front of the supplier that no official chose, and a template
 * message would put words in an official's mouth in a record the supplier reads
 * and the audit trail keeps.
 */

export interface InvitePayload {
  message: string | null;
  responseDeadline: string | null;
}

interface InviteVendorModalProps {
  entry: ShortlistEntry | undefined;
  packageLabel: string;
  busy: boolean;
  onConfirm: (payload: InvitePayload) => void;
  onCancel: () => void;
}

function today(): string {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  return new Date(now.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function InviteVendorModal({
  entry,
  packageLabel,
  busy,
  onConfirm,
  onCancel,
}: InviteVendorModalProps) {
  const [message, setMessage] = React.useState("");
  const [deadline, setDeadline] = React.useState("");

  // Reset when a different supplier is chosen, so the previous invitation's
  // text is never carried into the next one by accident.
  React.useEffect(() => {
    setMessage("");
    setDeadline("");
  }, [entry?.vendorProfileId]);

  if (entry === undefined) return null;

  const name = entry.legalName ?? entry.organizationName;
  const deadlineIsPast = deadline !== "" && deadline < today();

  return (
    <GovernmentModal
      isOpen={true}
      title="Invite supplier to respond"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="gov-btn gov-btn--tertiary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="gov-btn gov-btn--primary"
            disabled={busy || deadlineIsPast}
            onClick={() =>
              onConfirm({
                message: message.trim() === "" ? null : message.trim(),
                responseDeadline: deadline === "" ? null : deadline,
              })
            }
          >
            Send invitation
          </button>
        </>
      }
    >
      <p className="gov-form-hint" style={{ marginBottom: "12px" }}>
        You are inviting <strong>{name}</strong> to respond to <strong>{packageLabel}</strong>.
        The supplier is notified in their portal and can accept or decline. An invitation is not
        an award and does not commit the department to engage them.
      </p>

      <dl className="gov-desc-list" style={{ marginBottom: "16px" }}>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Rank when shortlisted</dt>
          <dd className="gov-desc-val">{entry.rankAtShortlist ?? "—"}</dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Score when shortlisted</dt>
          <dd className="gov-desc-val">{entry.scoreAtShortlist ?? "—"}</dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Verification</dt>
          <dd className="gov-desc-val">{entry.verificationState}</dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Shortlisted by</dt>
          <dd className="gov-desc-val">{entry.addedByName}</dd>
        </div>
      </dl>

      <div className="gov-form-group">
        <label className="gov-form-label" htmlFor="invitation-deadline">
          Response requested by
        </label>
        <p className="gov-form-hint" id="invitation-deadline-hint">
          Optional. Shown to the supplier alongside the invitation.
        </p>
        <input
          id="invitation-deadline"
          type="date"
          className="gov-form-control"
          value={deadline}
          min={today()}
          disabled={busy}
          onChange={(event) => setDeadline(event.target.value)}
          aria-describedby="invitation-deadline-hint"
        />
        {deadlineIsPast && (
          <p className="gov-form-error">A response date in the past cannot be requested.</p>
        )}
      </div>

      <div className="gov-form-group">
        <label className="gov-form-label" htmlFor="invitation-message">
          Instructions for the supplier
        </label>
        <p className="gov-form-hint" id="invitation-message-hint">
          Optional. The supplier reads this verbatim, and it is kept on the record.
        </p>
        <textarea
          id="invitation-message"
          className="gov-form-control"
          rows={4}
          maxLength={2000}
          value={message}
          disabled={busy}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="What the department expects from this supplier, and by when…"
          aria-describedby="invitation-message-hint"
        />
      </div>
    </GovernmentModal>
  );
}
