import React, { useCallback, useEffect, useState } from "react";

import { ApiRequestError } from "../api/client.js";
import {
  listProjectInterest,
  publishProject,
  unpublishProject,
  type OpportunityInterest,
  type ProcurementProject,
} from "../api/projects.js";
import { useHasPermission } from "../auth/AuthContext.js";
import { GovernmentAlert } from "./GovernmentAlert.js";
import { GovernmentCard } from "./GovernmentCard.js";

const PUBLISHABLE_STATUSES = new Set([
  "REQUIREMENTS_CONFIRMED",
  "WORK_PACKAGES_CONFIRMED",
  "IN_DISCOVERY",
]);

function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.details.length > 0
      ? `${error.message} ${error.details.map((detail) => detail.message).join(" ")}`
      : error.message;
  }
  return "The action could not be completed.";
}

export interface OpportunityPublicationPanelProps {
  project: ProcurementProject;
  onChange: (project: ProcurementProject) => void;
}

/**
 * Publication of a confirmed project to the supplier portal.
 *
 * Publishing is a separate, deliberate act rather than a consequence of
 * confirming requirements: the official writes the summary that leaves the
 * department, and only requirements they have accepted are exposed alongside
 * it. Withdrawal is available at any time.
 */
export function OpportunityPublicationPanel({
  project,
  onChange,
}: OpportunityPublicationPanelProps) {
  const hasPermission = useHasPermission();
  const canPublish = hasPermission("opportunity:publish");

  const [summary, setSummary] = useState(project.opportunitySummary ?? "");
  const [deadline, setDeadline] = useState(project.responseDeadline ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [interest, setInterest] = useState<OpportunityInterest[]>([]);

  const published = project.publishedAt !== null;
  const eligible = PUBLISHABLE_STATUSES.has(project.status);

  const loadInterest = useCallback(
    async (signal?: AbortSignal) => {
      if (!published) return;
      try {
        setInterest(await listProjectInterest(project.id, signal));
      } catch {
        // Interest is supplementary; failing to load it must not break the page.
      }
    },
    [project.id, published],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadInterest(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadInterest]);

  async function publish() {
    setBusy(true);
    setError(undefined);
    try {
      onChange(
        await publishProject(project.id, {
          summary: summary.trim(),
          responseDeadline: deadline === "" ? null : deadline,
        }),
      );
      await loadInterest();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError(undefined);
    try {
      onChange(await unpublishProject(project.id));
      setInterest([]);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!canPublish && !published) {
    return null;
  }

  return (
    <GovernmentCard
      title="Supplier Visibility"
      subtitle="Whether registered suppliers can see this requirement and register interest"
      action={
        published ? (
          <span className="gov-badge gov-badge--operational">Published to suppliers</span>
        ) : (
          <span className="gov-badge gov-badge--draft">Not published</span>
        )
      }
    >
      {error !== undefined && (
        <GovernmentAlert type="error" title="Action Failed" role="alert">
          {error}
        </GovernmentAlert>
      )}

      {!eligible && !published && (
        <GovernmentAlert type="info" title="Not Yet Publishable">
          A project can be published once its requirements have been confirmed. Suppliers see the
          summary written here and the requirements you have accepted — nothing else from the
          dossier leaves the department.
        </GovernmentAlert>
      )}

      {canPublish && eligible && (
        <>
          <div className="gov-form-group gov-form-group--wide">
            <label className="gov-form-label" htmlFor="publish-summary">
              Summary shown to suppliers<span className="gov-form-required">*</span>
            </label>
            <p className="gov-form-hint">
              Write this for a reader outside government: what is being sought, and what a supplier
              would need to be able to do. Internal notes, AI rationales and rejected suggestions
              are never published.
            </p>
            <textarea
              id="publish-summary"
              className="gov-form-control"
              rows={5}
              maxLength={4000}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
            <p className="gov-form-hint">{summary.trim().length} / 4,000 characters (minimum 40)</p>
          </div>

          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="publish-deadline">
              Response deadline
            </label>
            <input
              id="publish-deadline"
              className="gov-form-control"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </div>

          <div className="gov-form-actions">
            {published && (
              <button
                type="button"
                className="gov-btn gov-btn--tertiary"
                disabled={busy}
                onClick={() => void withdraw()}
              >
                Withdraw from supplier portal
              </button>
            )}
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || summary.trim().length < 40}
              onClick={() => void publish()}
            >
              {busy ? "Saving…" : published ? "Update published summary" : "Publish to suppliers"}
            </button>
          </div>
        </>
      )}

      {published && (
        <>
          <h3 className="gov-section-title">
            Suppliers Who Have Registered Interest ({interest.length})
          </h3>
          {interest.length === 0 ? (
            <p>
              No supplier has registered interest yet. Suppliers whose capability profile matches
              this requirement see it on their dashboard.
            </p>
          ) : (
            <div className="gov-table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th scope="col">Supplier</th>
                    <th scope="col">Verification</th>
                    <th scope="col">Note</th>
                    <th scope="col" style={{ width: "160px" }}>
                      Registered
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {interest.map((entry) => (
                    <tr key={entry.vendorProfileId}>
                      <td>
                        <strong>{entry.legalName ?? entry.organizationName}</strong>
                        {entry.headline !== null && (
                          <div className="gov-entry-card__meta">{entry.headline}</div>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            entry.verificationState === "VERIFIED"
                              ? "gov-badge gov-badge--operational"
                              : "gov-badge gov-badge--pending"
                          }
                        >
                          {entry.verificationState === "VERIFIED" ? "Verified" : "Unverified"}
                        </span>
                      </td>
                      <td>{entry.message ?? "—"}</td>
                      <td>{new Date(entry.submittedAt).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="gov-fine-print">
            Registering interest is a supplier telling the department they wish to be considered. It
            is not a proposal, and it confers no standing in the procurement.
          </p>
        </>
      )}
    </GovernmentCard>
  );
}
