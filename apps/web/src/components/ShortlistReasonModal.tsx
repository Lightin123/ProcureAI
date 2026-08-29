import React from "react";

import type { VendorRecommendation } from "../api/vendorMatching.js";
import { GovernmentModal } from "./GovernmentModal.js";

/**
 * Records why a supplier is being shortlisted.
 *
 * The reason is not decoration. It is the part of the shortlist that a later
 * audit reads: the rank and the score say what the system computed, and this
 * says what the official concluded from it. The ranking that was on screen at
 * the moment of the decision is shown alongside the field so the two are
 * recorded together.
 */

interface ShortlistReasonModalProps {
  recommendation: VendorRecommendation | undefined;
  packageLabel: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ShortlistReasonModal({
  recommendation,
  packageLabel,
  busy,
  onConfirm,
  onCancel,
}: ShortlistReasonModalProps) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    setReason("");
  }, [recommendation?.vendor.vendorProfileId]);

  if (recommendation === undefined) return null;

  const name = recommendation.vendor.legalName ?? recommendation.vendor.organizationName;
  const trimmed = reason.trim();

  return (
    <GovernmentModal
      isOpen={true}
      title="Shortlist supplier"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="gov-btn gov-btn--tertiary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="gov-btn gov-btn--success"
            disabled={busy || trimmed.length < 3}
            onClick={() => onConfirm(trimmed)}
          >
            Add to shortlist
          </button>
        </>
      }
    >
      <p className="gov-form-hint" style={{ marginBottom: "12px" }}>
        You are shortlisting <strong>{name}</strong> for <strong>{packageLabel}</strong>. The
        shortlist belongs to this work package alone and does not carry to any other package in
        the project.
      </p>

      <dl className="gov-desc-list" style={{ marginBottom: "16px" }}>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Rank</dt>
          <dd className="gov-desc-val">{recommendation.rank ?? "—"}</dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Overall score</dt>
          <dd className="gov-desc-val">{recommendation.overallScore} / 100</dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Eligibility</dt>
          <dd className="gov-desc-val">
            {recommendation.eligible
              ? `Passed ${recommendation.eligibility.passedChecks.length} mandatory check(s)`
              : "Failed a mandatory requirement"}
          </dd>
        </div>
        <div className="gov-desc-item">
          <dt className="gov-desc-term">Verification</dt>
          <dd className="gov-desc-val">{recommendation.vendor.verificationState}</dd>
        </div>
      </dl>

      <div className="gov-form-group">
        <label className="gov-form-label" htmlFor="shortlist-reason">
          Reason for shortlisting <span className="gov-form-required">*</span>
        </label>
        <p className="gov-form-hint" id="shortlist-reason-hint">
          Recorded against your name and kept in the work package&rsquo;s audit history.
        </p>
        <textarea
          id="shortlist-reason"
          className="gov-form-control"
          rows={4}
          maxLength={1000}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
          placeholder="State what in this supplier's record supports taking them forward…"
          aria-describedby="shortlist-reason-hint"
          autoFocus
        />
      </div>
    </GovernmentModal>
  );
}
