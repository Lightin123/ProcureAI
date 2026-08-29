import React from "react";

import type { DimensionKey, VendorRecommendation } from "../api/vendorMatching.js";
import { GovernmentModal } from "./GovernmentModal.js";

/**
 * Side-by-side comparison of the suppliers an official has selected.
 *
 * Built to support an actual procurement decision rather than to look like a
 * comparison: the eligibility row comes first because it is categorical and the
 * scores below it are only meaningful among suppliers who passed it, and the
 * supporting evidence is shown under the numbers because a score without its
 * basis is not something anyone can defend.
 */

const DIMENSION_ORDER: DimensionKey[] = [
  "capability",
  "semantic",
  "experience",
  "capacity",
  "geographic",
  "compliance",
  "credibility",
];

function scoreCell(score: number, best: number, worst: number) {
  const isBest = score === best && best !== worst;
  const isWorst = score === worst && best !== worst;

  return {
    fontWeight: isBest ? 700 : 400,
    color: isBest
      ? "var(--gov-success-dark)"
      : isWorst
        ? "var(--gov-text-muted)"
        : "var(--gov-text-primary)",
  } as const;
}

interface VendorComparisonModalProps {
  isOpen: boolean;
  recommendations: VendorRecommendation[];
  onClose: () => void;
}

export function VendorComparisonModal({
  isOpen,
  recommendations,
  onClose,
}: VendorComparisonModalProps) {
  if (recommendations.length === 0) return null;

  const labels = new Map<DimensionKey, string>();
  for (const recommendation of recommendations) {
    for (const dimension of recommendation.dimensions) {
      labels.set(dimension.key, dimension.label);
    }
  }

  const scoreFor = (recommendation: VendorRecommendation, key: DimensionKey): number =>
    recommendation.dimensions.find((dimension) => dimension.key === key)?.score ?? 0;

  const weightFor = (key: DimensionKey): number =>
    recommendations[0]?.dimensions.find((dimension) => dimension.key === key)?.weight ?? 0;

  const overalls = recommendations.map((r) => r.overallScore);

  return (
    <GovernmentModal
      isOpen={isOpen}
      title={`Compare suppliers (${recommendations.length})`}
      onClose={onClose}
      footer={
        <button type="button" className="gov-btn gov-btn--secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="gov-table-container">
        <table className="gov-table">
          <caption className="gov-table-caption">
            Every figure is computed from the supplier&rsquo;s recorded profile against this work
            package. Scores are comparable within this comparison only.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: "200px" }}>
                Criterion
              </th>
              {recommendations.map((recommendation) => (
                <th key={recommendation.vendor.vendorProfileId} scope="col">
                  {recommendation.rank !== null && (
                    <span style={{ color: "var(--gov-primary-dark)" }}>
                      #{recommendation.rank}{" "}
                    </span>
                  )}
                  {recommendation.vendor.legalName ?? recommendation.vendor.organizationName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Eligibility</th>
              {recommendations.map((recommendation) => (
                <td key={recommendation.vendor.vendorProfileId}>
                  <span
                    className={
                      recommendation.eligible
                        ? "gov-badge gov-badge--operational"
                        : "gov-badge gov-badge--unavailable"
                    }
                  >
                    {recommendation.eligible ? "PASS" : "FAIL"}
                  </span>
                </td>
              ))}
            </tr>

            <tr>
              <th scope="row">Verification</th>
              {recommendations.map((recommendation) => (
                <td key={recommendation.vendor.vendorProfileId}>
                  {recommendation.vendor.verificationState}
                </td>
              ))}
            </tr>

            {DIMENSION_ORDER.filter((key) => labels.has(key)).map((key) => {
              const scores = recommendations.map((r) => scoreFor(r, key));
              const best = Math.max(...scores);
              const worst = Math.min(...scores);

              return (
                <tr key={key}>
                  <th scope="row">
                    {labels.get(key)}
                    <span
                      style={{
                        display: "block",
                        fontWeight: 400,
                        fontSize: "11px",
                        color: "var(--gov-text-muted)",
                      }}
                    >
                      weight {weightFor(key)}
                    </span>
                  </th>
                  {recommendations.map((recommendation) => {
                    const score = scoreFor(recommendation, key);
                    return (
                      <td key={recommendation.vendor.vendorProfileId} style={scoreCell(score, best, worst)}>
                        {score}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            <tr style={{ borderTop: "2px solid var(--gov-border-strong)" }}>
              <th scope="row" style={{ fontSize: "14px" }}>
                Overall
              </th>
              {recommendations.map((recommendation) => (
                <td
                  key={recommendation.vendor.vendorProfileId}
                  style={{
                    ...scoreCell(
                      recommendation.overallScore,
                      Math.max(...overalls),
                      Math.min(...overalls),
                    ),
                    fontSize: "18px",
                  }}
                >
                  {recommendation.overallScore}
                </td>
              ))}
            </tr>

            <tr>
              <th scope="row">Found by</th>
              {recommendations.map((recommendation) => (
                <td
                  key={recommendation.vendor.vendorProfileId}
                  style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}
                >
                  {recommendation.retrievalSources.join(" + ").toLowerCase()}
                  {recommendation.semanticSimilarity !== null && (
                    <div>cosine {recommendation.semanticSimilarity.toFixed(3)}</div>
                  )}
                </td>
              ))}
            </tr>

            {/* Counts rather than the terms themselves: the full lists are in
                the evidence panel below, and a table cell holding twenty chips
                stops being comparable, which is the only thing a table is for. */}
            <tr>
              <th scope="row">Capability coverage</th>
              {recommendations.map((recommendation) => (
                <td key={recommendation.vendor.vendorProfileId} style={{ fontSize: "13px" }}>
                  {recommendation.evidence.matchedCapabilities.length} matched
                  <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                    {recommendation.evidence.missingCapabilities.length} package term(s) absent
                  </div>
                </td>
              ))}
            </tr>

            <tr>
              <th scope="row">Relevant experience</th>
              {recommendations.map((recommendation) => (
                <td key={recommendation.vendor.vendorProfileId} style={{ fontSize: "13px" }}>
                  {recommendation.evidence.relevantExperience.length === 0 ? (
                    <span style={{ color: "var(--gov-text-muted)" }}>None recorded</span>
                  ) : (
                    <>
                      {recommendation.evidence.relevantExperience[0]?.title}
                      {recommendation.evidence.relevantExperience.length > 1 && (
                        <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                          and {recommendation.evidence.relevantExperience.length - 1} more
                        </div>
                      )}
                    </>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <th scope="row">Credentials recorded</th>
              {recommendations.map((recommendation) => (
                <td key={recommendation.vendor.vendorProfileId} style={{ fontSize: "13px" }}>
                  {recommendation.evidence.credentials.length === 0 ? (
                    <span style={{ color: "var(--gov-text-muted)" }}>None recorded</span>
                  ) : (
                    recommendation.evidence.credentials.slice(0, 3).join(", ")
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <th scope="row">Geographic coverage</th>
              {recommendations.map((recommendation) => (
                <td key={recommendation.vendor.vendorProfileId} style={{ fontSize: "13px" }}>
                  {recommendation.vendor.serviceCoverage ?? "Not stated"}
                  <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                    {recommendation.vendor.operatingStates.length === 0
                      ? "No operating states recorded"
                      : `${recommendation.vendor.operatingStates.length} operating state(s)`}
                  </div>
                </td>
              ))}
            </tr>

            <tr>
              <th scope="row">Profile completion</th>
              {recommendations.map((recommendation) => (
                <td key={recommendation.vendor.vendorProfileId} style={{ fontSize: "13px" }}>
                  {recommendation.vendor.completionPercentage}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="gov-section-title" style={{ marginTop: "24px" }}>
        Supporting evidence
      </h3>

      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: `repeat(${Math.min(recommendations.length, 3)}, minmax(0, 1fr))`,
        }}
      >
        {recommendations.map((recommendation) => (
          <div
            key={recommendation.vendor.vendorProfileId}
            style={{
              border: "1px solid var(--gov-border)",
              borderRadius: "var(--gov-radius)",
              padding: "12px",
              background: "var(--gov-bg-alt)",
            }}
          >
            <strong style={{ fontSize: "13px", display: "block", marginBottom: "8px" }}>
              {recommendation.vendor.legalName ?? recommendation.vendor.organizationName}
            </strong>

            {recommendation.evidence.strengths.length > 0 && (
              <>
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    color: "var(--gov-text-muted)",
                    letterSpacing: "0.5px",
                  }}
                >
                  Strengths
                </span>
                <ul className="gov-plain-list" style={{ margin: "4px 0 10px" }}>
                  {recommendation.evidence.strengths.slice(0, 4).map((strength) => (
                    <li key={strength} style={{ fontSize: "12px" }}>
                      &#10003; {strength}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {recommendation.evidence.gaps.length > 0 && (
              <>
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    color: "var(--gov-text-muted)",
                    letterSpacing: "0.5px",
                  }}
                >
                  Gaps
                </span>
                <ul className="gov-plain-list" style={{ margin: "4px 0 10px" }}>
                  {recommendation.evidence.gaps.slice(0, 4).map((gap) => (
                    <li key={gap} style={{ fontSize: "12px" }}>
                      &#9888; {gap}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* An ineligible supplier's exclusion ground is stated in full and
                never abbreviated: it is the only fact in this panel that
                decides whether the scores above it mean anything. */}
            {!recommendation.eligible && recommendation.eligibility.failedChecks.length > 0 && (
              <>
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    color: "var(--gov-danger-dark)",
                    letterSpacing: "0.5px",
                  }}
                >
                  Excluded because
                </span>
                <ul className="gov-plain-list" style={{ margin: "4px 0 10px" }}>
                  {recommendation.eligibility.failedChecks.map((check) => (
                    <li key={`${check.code}-${check.label}`} style={{ fontSize: "12px" }}>
                      <strong>{check.label}</strong> — {check.evidence}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {recommendation.evidence.matchedCapabilities.length > 0 && (
              <>
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    color: "var(--gov-text-muted)",
                    letterSpacing: "0.5px",
                  }}
                >
                  Matched capability terms
                </span>
                <ul className="gov-chip-list">
                  {recommendation.evidence.matchedCapabilities.slice(0, 10).map((term) => (
                    <li key={term} className="gov-chip gov-chip--match">
                      {term}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {recommendation.evidence.missingCapabilities.length > 0 && (
              <>
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    color: "var(--gov-text-muted)",
                    letterSpacing: "0.5px",
                  }}
                >
                  Package terms not present in the profile
                </span>
                <ul className="gov-chip-list">
                  {recommendation.evidence.missingCapabilities.slice(0, 10).map((term) => (
                    <li key={term} className="gov-chip gov-chip--gap">
                      {term}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </GovernmentModal>
  );
}
