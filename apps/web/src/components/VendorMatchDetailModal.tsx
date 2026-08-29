import React from "react";

import type { VendorMatchDetail } from "../api/vendorMatching.js";
import { GovernmentModal } from "./GovernmentModal.js";

/**
 * One supplier, read in the context of a work package.
 *
 * Deliberately not the whole capability profile. What an official needs when
 * deciding is the evidence bearing on this package — the offerings and past
 * work that overlap it, the credentials, the capacity, and the assessment
 * itself. The supplier's contact details and their private onboarding answers
 * are not part of that and are not served by the endpoint behind this.
 */

function formatInr(amount: number | null): string {
  if (amount === null) return "Not stated";
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} crore`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} lakh`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "20px" }}>
      <h3 className="gov-section-title">{title}</h3>
      {children}
    </section>
  );
}

interface VendorMatchDetailModalProps {
  isOpen: boolean;
  detail: VendorMatchDetail | undefined;
  loading: boolean;
  onClose: () => void;
}

export function VendorMatchDetailModal({
  isOpen,
  detail,
  loading,
  onClose,
}: VendorMatchDetailModalProps) {
  const name =
    detail === undefined
      ? "Supplier"
      : (detail.vendor.legalName ?? detail.vendor.organizationName);

  return (
    <GovernmentModal
      isOpen={isOpen}
      title={name}
      onClose={onClose}
      footer={
        <button type="button" className="gov-btn gov-btn--secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      {loading && (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--gov-text-secondary)" }}>
          Loading supplier record…
        </div>
      )}

      {!loading && detail !== undefined && (
        <>
          <Section title="Identity and standing">
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Organisation</dt>
                <dd className="gov-desc-val">{detail.vendor.organizationName}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Verification</dt>
                <dd className="gov-desc-val">{detail.vendor.verificationState}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Profile completeness</dt>
                <dd className="gov-desc-val">{detail.vendor.completionPercentage}%</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Geographic coverage</dt>
                <dd className="gov-desc-val">{detail.vendor.serviceCoverage ?? "Not stated"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Operating states</dt>
                <dd className="gov-desc-val">
                  {detail.vendor.operatingStates.length === 0
                    ? "Not stated"
                    : detail.vendor.operatingStates.join(", ")}
                </dd>
              </div>
            </dl>
          </Section>

          {detail.assessment !== null && (
            <Section title="Assessment against this work package">
              <p style={{ marginTop: 0, fontSize: "14px" }}>{detail.assessment.explanation}</p>

              <ul className="gov-match-components">
                {detail.assessment.dimensions.map((dimension) => (
                  <li key={dimension.key}>
                    <div className="gov-match-components__head">
                      <span>{dimension.label}</span>
                      <span>{dimension.score} / 100</span>
                    </div>
                    <div className="gov-meter__track">
                      <div
                        className="gov-meter__fill"
                        style={{ width: `${dimension.score}%` }}
                      />
                    </div>
                    <p className="gov-match-components__detail">{dimension.detail}</p>
                  </li>
                ))}
              </ul>

              {!detail.assessment.eligible && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 12px",
                    background: "var(--gov-danger-light)",
                    borderLeft: "3px solid var(--gov-danger)",
                    borderRadius: "var(--gov-radius-sm)",
                  }}
                >
                  <strong style={{ fontSize: "13px", color: "var(--gov-danger-dark)" }}>
                    Not eligible for this work package
                  </strong>
                  <ul className="gov-plain-list" style={{ margin: "6px 0 0" }}>
                    {detail.assessment.eligibility.failedChecks.map((check) => (
                      <li key={`${check.code}-${check.label}`} style={{ fontSize: "13px" }}>
                        <strong>{check.label}</strong> — {check.evidence}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {detail.offerings.length > 0 && (
            <Section title={`Products and services (${detail.offerings.length})`}>
              <ul className="gov-plain-list" style={{ margin: 0 }}>
                {detail.offerings.map((offering) => (
                  <li key={offering.id} style={{ marginBottom: "8px" }}>
                    <strong style={{ fontSize: "13px" }}>
                      [{offering.kind}] {offering.name}
                    </strong>
                    {offering.description !== null && (
                      <div style={{ fontSize: "13px", color: "var(--gov-text-secondary)" }}>
                        {offering.description}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {detail.experience.length > 0 && (
            <Section title={`Previous projects (${detail.experience.length})`}>
              {detail.experience.map((entry) => (
                <div key={entry.id} className="gov-entry-card">
                  <div className="gov-entry-card__head">
                    <strong className="gov-entry-card__title">{entry.title}</strong>
                    <span className="gov-entry-card__meta">
                      {entry.startYear === null
                        ? ""
                        : entry.endYear === null
                          ? `${entry.startYear} onwards`
                          : `${entry.startYear}–${entry.endYear}`}
                    </span>
                  </div>
                  <div className="gov-entry-card__meta">
                    {[
                      entry.clientName,
                      entry.sector,
                      entry.contractValueInr === null
                        ? null
                        : formatInr(entry.contractValueInr),
                    ]
                      .filter((value) => value !== null && value !== "")
                      .join(" · ")}
                  </div>
                  {entry.description !== null && (
                    <p className="gov-entry-card__body">{entry.description}</p>
                  )}
                  {entry.outcome !== null && (
                    <p className="gov-entry-card__outcome">Outcome: {entry.outcome}</p>
                  )}
                </div>
              ))}
            </Section>
          )}

          {detail.credentials.length > 0 && (
            <Section title={`Certifications and standards (${detail.credentials.length})`}>
              <div className="gov-table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th scope="col">Credential</th>
                      <th scope="col">Issued by</th>
                      <th scope="col" style={{ width: "120px" }}>
                        Valid until
                      </th>
                      <th scope="col" style={{ width: "120px" }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.credentials.map((credential) => (
                      <tr key={credential.id}>
                        <td>{credential.name}</td>
                        <td>{credential.issuingAuthority ?? "—"}</td>
                        <td>{credential.validUntil ?? "Not stated"}</td>
                        <td>{credential.verificationState}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section title="Capacity and delivery">
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Team size</dt>
                <dd className="gov-desc-val">{detail.capacity.teamSize ?? "Not stated"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Public-sector experience</dt>
                <dd className="gov-desc-val">
                  {detail.capacity.governmentExperience ?? "Not stated"}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Government-scale readiness</dt>
                <dd className="gov-desc-val">
                  {detail.capacity.governmentScaleReadiness ?? "Not stated"}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Typical project value</dt>
                <dd className="gov-desc-val">
                  {formatInr(detail.capacity.typicalProjectValueInr)}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Maximum project value</dt>
                <dd className="gov-desc-val">{formatInr(detail.capacity.maxProjectValueInr)}</dd>
              </div>
            </dl>

            {detail.capacity.deliveryCapability !== null && (
              <div className="gov-callout-box" style={{ marginTop: "12px" }}>
                <span className="gov-callout-box__label">Stated delivery capability</span>
                {detail.capacity.deliveryCapability}
              </div>
            )}
          </Section>
        </>
      )}
    </GovernmentModal>
  );
}
