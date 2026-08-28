import React from "react";

import type { MatchResult, VendorProfileStatus, VerificationState } from "../../api/vendor.js";

const VERIFICATION_LABELS: Record<VerificationState, { label: string; className: string }> = {
  UNVERIFIED: { label: "Not submitted", className: "gov-badge gov-badge--draft" },
  PENDING: { label: "Verification pending", className: "gov-badge gov-badge--pending" },
  VERIFIED: { label: "Verified", className: "gov-badge gov-badge--operational" },
  REJECTED: { label: "Changes requested", className: "gov-badge gov-badge--unavailable" },
};

export function VerificationBadge({ state }: { state: VerificationState }) {
  const config = VERIFICATION_LABELS[state] ?? VERIFICATION_LABELS.UNVERIFIED;
  return <span className={config.className}>{config.label}</span>;
}

const PROFILE_STATUS_LABELS: Record<VendorProfileStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "gov-badge gov-badge--draft" },
  SUBMITTED: { label: "Submitted for verification", className: "gov-badge gov-badge--analysis" },
  VERIFIED: { label: "Verified supplier", className: "gov-badge gov-badge--confirmed" },
  CHANGES_REQUESTED: { label: "Changes requested", className: "gov-badge gov-badge--unavailable" },
};

export function ProfileStatusBadge({ status }: { status: VendorProfileStatus }) {
  const config = PROFILE_STATUS_LABELS[status] ?? PROFILE_STATUS_LABELS.DRAFT;
  return <span className={config.className}>{config.label}</span>;
}

const BAND_CLASS: Record<MatchResult["band"], string> = {
  STRONG: "gov-match gov-match--strong",
  MODERATE: "gov-match gov-match--moderate",
  LIMITED: "gov-match gov-match--limited",
};

const BAND_LABEL: Record<MatchResult["band"], string> = {
  STRONG: "Strong capability match",
  MODERATE: "Partial capability match",
  LIMITED: "Limited capability match",
};

/**
 * The score is shown with its band rather than alone, so a number is never
 * mistaken for an eligibility determination. Matching narrows a list for a
 * human; it does not decide anything.
 */
export function MatchBadge({ match }: { match: MatchResult }) {
  return (
    <span className={BAND_CLASS[match.band]} title={BAND_LABEL[match.band]}>
      <span className="gov-match__score">{match.score}</span>
      <span className="gov-match__label">{BAND_LABEL[match.band]}</span>
    </span>
  );
}

export interface CompletionMeterProps {
  percentage: number;
  label?: string;
}

export function CompletionMeter({ percentage, label }: CompletionMeterProps) {
  const clamped = Math.max(0, Math.min(100, percentage));

  return (
    <div className="gov-meter">
      <div className="gov-meter__head">
        <span className="gov-meter__label">{label ?? "Profile completion"}</span>
        <span className="gov-meter__value">{clamped}%</span>
      </div>
      <div
        className="gov-meter__track"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Profile completion"}
      >
        <div
          className={`gov-meter__fill${clamped >= 100 ? " gov-meter__fill--complete" : ""}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
