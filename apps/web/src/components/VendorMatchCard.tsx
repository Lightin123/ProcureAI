import React from "react";

import type { DimensionScore, VendorRecommendation } from "../api/vendorMatching.js";
import { BuildingIcon, CheckCircleIcon, AlertCircleIcon } from "./GovernmentIcons.js";

const BAND_LABEL: Record<VendorRecommendation["band"], string> = {
  STRONG: "Strong fit",
  MODERATE: "Partial fit",
  LIMITED: "Limited fit",
};

const UNVERIFIED_BADGE = { label: "Unverified", className: "gov-badge gov-badge--draft" };

const VERIFICATION_BADGE: Record<string, { label: string; className: string }> = {
  UNVERIFIED: UNVERIFIED_BADGE,
  PENDING: { label: "Verification pending", className: "gov-badge gov-badge--pending" },
  VERIFIED: { label: "Verified", className: "gov-badge gov-badge--operational" },
  REJECTED: { label: "Verification rejected", className: "gov-badge gov-badge--unavailable" },
};

/**
 * How a supplier entered the candidate pool.
 *
 * Shown because it is the clearest evidence that hybrid retrieval is doing
 * something: a supplier marked "semantic" was found by meaning rather than by
 * wording, and a keyword search alone would not have surfaced them.
 */
function RetrievalTag({ sources }: { sources: VendorRecommendation["retrievalSources"] }) {
  const both = sources.includes("LEXICAL") && sources.includes("SEMANTIC");
  const label = both
    ? "Keyword + semantic"
    : sources.includes("SEMANTIC")
      ? "Semantic only"
      : "Keyword only";

  const title = both
    ? "Found by both keyword overlap and semantic similarity."
    : sources.includes("SEMANTIC")
      ? "Found by semantic similarity alone — this supplier describes the work in different terms from the package, and a keyword search would not have surfaced them."
      : "Found by keyword overlap alone.";

  return (
    <span className="gov-tag gov-tag--meta" title={title}>
      {label}
    </span>
  );
}

function DimensionBar({ dimension }: { dimension: DimensionScore }) {
  return (
    <li>
      <div className="gov-match-components__head">
        <span>{dimension.label}</span>
        <span>
          {dimension.score}
          <span style={{ color: "var(--gov-text-muted)", fontWeight: 400 }}>
            {" "}
            / 100 · weight {dimension.weight}
          </span>
        </span>
      </div>
      <div
        className="gov-meter__track"
        role="progressbar"
        aria-valuenow={dimension.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={dimension.label}
      >
        <div className="gov-meter__fill" style={{ width: `${dimension.score}%` }} />
      </div>
      <p className="gov-match-components__detail">{dimension.detail}</p>
    </li>
  );
}

interface VendorMatchCardProps {
  recommendation: VendorRecommendation;
  isSelected: boolean;
  isShortlisted: boolean;
  busy: boolean;
  onToggleSelect: (vendorProfileId: string, selected: boolean) => void;
  onView: (vendorProfileId: string) => void;
  onShortlist: (recommendation: VendorRecommendation) => void;
  onRemoveShortlist: (vendorProfileId: string) => void;
}

export function VendorMatchCard({
  recommendation,
  isSelected,
  isShortlisted,
  busy,
  onToggleSelect,
  onView,
  onShortlist,
  onRemoveShortlist,
}: VendorMatchCardProps) {
  const { vendor, eligibility, evidence } = recommendation;
  const name = vendor.legalName ?? vendor.organizationName;
  const verification = VERIFICATION_BADGE[vendor.verificationState] ?? UNVERIFIED_BADGE;
  const [expanded, setExpanded] = React.useState(false);

  return (
    <article
      className={`gov-wp-card${isSelected ? " gov-wp-card--selected" : ""}`}
      aria-label={`${name}, ${recommendation.overallScore} out of 100`}
    >
      <div className="gov-wp-card__header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <input
            type="checkbox"
            className="gov-checkbox"
            checked={isSelected}
            disabled={busy}
            onChange={(event) => onToggleSelect(vendor.vendorProfileId, event.target.checked)}
            aria-label={`Select ${name} for comparison`}
          />

          {recommendation.rank !== null && (
            <strong
              style={{
                color: "var(--gov-primary-dark)",
                letterSpacing: "0.5px",
                fontSize: "15px",
              }}
            >
              #{recommendation.rank}
            </strong>
          )}

          <BuildingIcon size={16} />
          <strong style={{ fontSize: "15px" }}>{name}</strong>

          <span className={verification.className}>{verification.label}</span>
          <RetrievalTag sources={recommendation.retrievalSources} />
          {isShortlisted && <span className="gov-tag">Shortlisted</span>}
        </div>

        <span
          className={`gov-match gov-match--${recommendation.band.toLowerCase()}`}
          title={`${recommendation.overallScore} out of 100`}
        >
          <span className="gov-match__score">{recommendation.overallScore}</span>
          <span className="gov-match__label">{BAND_LABEL[recommendation.band]}</span>
        </span>
      </div>

      {vendor.headline !== null && (
        <p style={{ margin: "10px 0 0", color: "var(--gov-text-secondary)", fontSize: "14px" }}>
          {vendor.headline}
        </p>
      )}

      <div style={{ marginTop: "12px" }}>
        <span
          className={
            eligibility.eligible
              ? "gov-badge gov-badge--operational"
              : "gov-badge gov-badge--unavailable"
          }
        >
          {eligibility.eligible ? "Eligible" : "Not eligible"}
        </span>
        {eligibility.eligible && eligibility.passedChecks.length > 0 && (
          <span
            style={{ marginLeft: "8px", fontSize: "12px", color: "var(--gov-text-muted)" }}
          >
            {eligibility.passedChecks.length} mandatory check(s) passed
          </span>
        )}
      </div>

      {/* Ineligibility is stated first and in full. A supplier who cannot be
          engaged is not a ranking position, and the officer is entitled to the
          ground on which the system removed them. */}
      {!eligibility.eligible && (
        <div
          style={{
            marginTop: "12px",
            padding: "10px 12px",
            background: "var(--gov-danger-light)",
            borderLeft: `3px solid var(--gov-danger)`,
            borderRadius: "var(--gov-radius-sm)",
          }}
        >
          <strong
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: "var(--gov-danger-dark)",
              display: "block",
              marginBottom: "6px",
            }}
          >
            Excluded because
          </strong>
          <ul className="gov-plain-list" style={{ margin: 0 }}>
            {eligibility.failedChecks.map((check) => (
              <li key={`${check.code}-${check.label}`} style={{ fontSize: "13px" }}>
                <strong>{check.label}</strong> — {check.evidence}
                <div style={{ fontSize: "12px", color: "var(--gov-text-muted)", marginTop: "2px" }}>
                  {check.requirement}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: "14px", display: "grid", gap: "16px", gridTemplateColumns: "1fr" }}>
        <ul className="gov-match-components">
          {recommendation.dimensions.map((dimension) => (
            <DimensionBar key={dimension.key} dimension={dimension} />
          ))}
        </ul>
      </div>

      {evidence.strengths.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          <strong
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              color: "var(--gov-text-muted)",
              display: "block",
              marginBottom: "6px",
              letterSpacing: "0.5px",
            }}
          >
            Why this supplier
          </strong>
          <ul className="gov-plain-list" style={{ margin: 0 }}>
            {evidence.strengths.map((strength, index) => (
              <li
                key={`${index}-${strength}`}
                style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px" }}
              >
                <span style={{ color: "var(--gov-success-dark)", flexShrink: 0 }}>
                  <CheckCircleIcon size={14} />
                </span>
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evidence.gaps.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          <strong
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              color: "var(--gov-text-muted)",
              display: "block",
              marginBottom: "6px",
              letterSpacing: "0.5px",
            }}
          >
            Potential gaps
          </strong>
          <ul className="gov-plain-list" style={{ margin: 0 }}>
            {evidence.gaps.map((gap, index) => (
              <li
                key={`${index}-${gap}`}
                style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px" }}
              >
                <span style={{ color: "var(--gov-saffron-dark)", flexShrink: 0 }}>
                  <AlertCircleIcon size={14} />
                </span>
                <span>{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: "12px" }}>
          {evidence.matchedCapabilities.length > 0 && (
            <>
              <strong
                style={{
                  fontSize: "12px",
                  textTransform: "uppercase",
                  color: "var(--gov-text-muted)",
                  letterSpacing: "0.5px",
                }}
              >
                Matched capability terms
              </strong>
              <ul className="gov-chip-list">
                {evidence.matchedCapabilities.map((term) => (
                  <li key={term} className="gov-chip gov-chip--match">
                    {term}
                  </li>
                ))}
              </ul>
            </>
          )}

          {evidence.missingCapabilities.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <strong
                style={{
                  fontSize: "12px",
                  textTransform: "uppercase",
                  color: "var(--gov-text-muted)",
                  letterSpacing: "0.5px",
                }}
              >
                Package terms not present in the profile
              </strong>
              <ul className="gov-chip-list">
                {evidence.missingCapabilities.map((term) => (
                  <li key={term} className="gov-chip gov-chip--gap">
                    {term}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {eligibility.passedChecks.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <strong
                style={{
                  fontSize: "12px",
                  textTransform: "uppercase",
                  color: "var(--gov-text-muted)",
                  letterSpacing: "0.5px",
                }}
              >
                Mandatory checks passed
              </strong>
              <ul className="gov-plain-list" style={{ margin: "6px 0 0" }}>
                {eligibility.passedChecks.map((check) => (
                  <li key={`${check.code}-${check.label}`} style={{ fontSize: "13px" }}>
                    <strong>{check.label}</strong> — {check.evidence}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="gov-wp-card__footer">
        <button
          type="button"
          className="gov-btn gov-btn--secondary gov-btn--sm"
          onClick={() => onView(vendor.vendorProfileId)}
          disabled={busy}
        >
          View supplier
        </button>

        <button
          type="button"
          className="gov-btn gov-btn--tertiary gov-btn--sm"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide evidence" : "Show evidence"}
        </button>

        {isShortlisted ? (
          <button
            type="button"
            className="gov-btn gov-btn--tertiary gov-btn--sm"
            style={{ color: "var(--gov-danger)" }}
            onClick={() => onRemoveShortlist(vendor.vendorProfileId)}
            disabled={busy}
          >
            Remove from shortlist
          </button>
        ) : (
          <button
            type="button"
            className="gov-btn gov-btn--success gov-btn--sm"
            onClick={() => onShortlist(recommendation)}
            disabled={busy || !eligibility.eligible}
            title={
              eligibility.eligible
                ? "Add this supplier to the shortlist for this work package"
                : "A supplier who fails a mandatory requirement cannot be shortlisted"
            }
          >
            Shortlist
          </button>
        )}
      </div>
    </article>
  );
}
