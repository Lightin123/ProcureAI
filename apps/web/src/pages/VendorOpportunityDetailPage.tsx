import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  fetchOpportunity,
  setOpportunityInterest,
  setOpportunitySaved,
  type VendorOpportunity,
} from "../api/vendor.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { PageHeader } from "../components/PageHeader.js";
import { MatchBadge } from "../components/vendor/VendorStatusBadges.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; opportunity: VendorOpportunity }
  | { kind: "failed"; message: string };

const CATEGORY_LABELS: Record<string, string> = {
  FUNCTIONAL: "Functional",
  NON_FUNCTIONAL: "Non-functional",
  BUDGET: "Budget",
  TIMELINE: "Timeline",
  COMPLIANCE: "Compliance",
  OTHER: "Other",
};

function formatDate(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function VendorOpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (id === undefined) return;
      try {
        setState({ kind: "ready", opportunity: await fetchOpportunity(id, signal) });
      } catch (error) {
        if (signal?.aborted === true) return;
        setState({
          kind: "failed",
          message:
            error instanceof ApiRequestError
              ? error.message
              : "The opportunity could not be loaded.",
        });
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    if (state.kind === "ready") {
      document.title = `${state.opportunity.title} · ProcureAI`;
    }
  }, [state]);

  async function registerInterest(withdraw: boolean) {
    if (id === undefined) return;
    setBusy(true);
    setActionError(undefined);
    try {
      await setOpportunityInterest(id, {
        withdraw,
        message: withdraw || message.trim() === "" ? null : message.trim(),
      });
      setMessage("");
      await load();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.message
          : "Your interest could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleSaved() {
    if (id === undefined || state.kind !== "ready") return;
    setActionError(undefined);
    try {
      await setOpportunitySaved(id, !state.opportunity.saved);
      await load();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError ? error.message : "The opportunity could not be saved.",
      );
    }
  }

  if (state.kind === "loading") {
    return (
      <>
        <PageHeader title="Procurement Opportunity" subtitle="Loading…" />
        <GovernmentCard title="Please wait">
          <p>Retrieving the published requirement.</p>
        </GovernmentCard>
      </>
    );
  }

  if (state.kind === "failed") {
    return (
      <>
        <PageHeader title="Procurement Opportunity" subtitle="Not available." />
        <GovernmentAlert type="error" title="Unable to Load Opportunity" role="alert">
          {state.message}
        </GovernmentAlert>
      </>
    );
  }

  const { opportunity } = state;
  const registered = opportunity.interestState === "SUBMITTED";

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Supplier Dashboard", to: "/vendor" },
          { label: "Procurement Opportunities", to: "/vendor/opportunities" },
          { label: opportunity.referenceNumber },
        ]}
      />

      <PageHeader
        title={opportunity.title}
        subtitle={`${opportunity.referenceNumber} · ${opportunity.departmentName}`}
        action={
          <button type="button" className="gov-btn gov-btn--secondary" onClick={() => void toggleSaved()}>
            {opportunity.saved ? "Remove from saved" : "Save for later"}
          </button>
        }
      />

      {actionError !== undefined && (
        <GovernmentAlert type="error" title="Action Failed" role="alert">
          {actionError}
        </GovernmentAlert>
      )}

      <div className="gov-two-column">
        <div className="gov-two-column__main">
          <GovernmentCard title="What the department is seeking">
            <p className="gov-lead">{opportunity.summary}</p>
          </GovernmentCard>

          <GovernmentCard
            title="Confirmed Requirements"
            subtitle="Requirements an official has reviewed and accepted. AI suggestions that were not accepted are not published."
          >
            {opportunity.requirements.length === 0 ? (
              <p>No individual requirements have been published for this opportunity.</p>
            ) : (
              <div className="gov-table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: "140px" }}>
                        Type
                      </th>
                      <th scope="col" style={{ width: "150px" }}>
                        Category
                      </th>
                      <th scope="col">Requirement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunity.requirements.map((requirement, index) => (
                      <tr key={`${requirement.text}-${index}`}>
                        <td>
                          <span className="gov-tag gov-tag--meta">
                            {requirement.kind === "CONSTRAINT" ? "Constraint" : "Requirement"}
                          </span>
                        </td>
                        <td>{CATEGORY_LABELS[requirement.category] ?? requirement.category}</td>
                        <td>{requirement.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GovernmentCard>

          <GovernmentCard
            title="Register Interest"
            subtitle="Tells the department you wish to be considered. It is not a proposal or a bid."
          >
            {registered ? (
              <>
                <GovernmentAlert type="success" title="Interest Registered">
                  You registered interest on {formatDate(opportunity.interestAt)}. The department
                  can see your organisation and your capability profile against this opportunity.
                </GovernmentAlert>
                <div className="gov-form-actions">
                  <button
                    type="button"
                    className="gov-btn gov-btn--tertiary"
                    disabled={busy}
                    onClick={() => void registerInterest(true)}
                  >
                    Withdraw interest
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="gov-form-group gov-form-group--wide">
                  <label className="gov-form-label" htmlFor="interest-message">
                    Note to the department
                  </label>
                  <p className="gov-form-hint">
                    Optional. A short statement of why your organisation is suited to this
                    requirement. Formal proposal submission is a later stage of the procurement
                    process and is not collected here.
                  </p>
                  <textarea
                    id="interest-message"
                    className="gov-form-control"
                    rows={4}
                    maxLength={2000}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </div>
                <div className="gov-form-actions">
                  <button
                    type="button"
                    className="gov-btn gov-btn--primary"
                    disabled={busy}
                    onClick={() => void registerInterest(false)}
                  >
                    {busy ? "Recording…" : "Register interest"}
                  </button>
                </div>
              </>
            )}
          </GovernmentCard>
        </div>

        <aside className="gov-two-column__side">
          {opportunity.match !== undefined && (
            <GovernmentCard
              title="Capability Match"
              subtitle="How your recorded profile compares against this requirement"
            >
              <div className="gov-match-summary">
                <MatchBadge match={opportunity.match} />
              </div>

              <ul className="gov-match-components">
                {opportunity.match.components.map((component) => (
                  <li key={component.label}>
                    <div className="gov-match-components__head">
                      <span>{component.label}</span>
                      <span>{Math.round(component.score * component.weight)} / {component.weight}</span>
                    </div>
                    <div className="gov-meter__track">
                      <div
                        className="gov-meter__fill"
                        style={{ width: `${Math.round(component.score * 100)}%` }}
                      />
                    </div>
                    <p className="gov-match-components__detail">{component.detail}</p>
                  </li>
                ))}
              </ul>

              {opportunity.match.unmatchedTerms.length > 0 && (
                <>
                  <h3 className="gov-section-title">Terms your profile does not cover</h3>
                  <p className="gov-form-hint">
                    If your organisation can address any of these, describe it in your capability
                    profile — matching only sees what you have written.
                  </p>
                  <ul className="gov-chip-list">
                    {opportunity.match.unmatchedTerms.map((term) => (
                      <li key={term} className="gov-chip gov-chip--gap">
                        {term}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </GovernmentCard>
          )}

          <GovernmentCard title="Opportunity Particulars">
            <dl className="gov-desc-list gov-desc-list--stacked">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Reference</dt>
                <dd className="gov-desc-val gov-desc-val--mono">{opportunity.referenceNumber}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Department</dt>
                <dd className="gov-desc-val">{opportunity.departmentName}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Published</dt>
                <dd className="gov-desc-val">{formatDate(opportunity.publishedAt)}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Responses by</dt>
                <dd className="gov-desc-val">{formatDate(opportunity.responseDeadline)}</dd>
              </div>
            </dl>
          </GovernmentCard>
        </aside>
      </div>
    </>
  );
}
