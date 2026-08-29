import React from "react";
import { Link } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  fetchVendorResponses,
  VENDOR_RESPONSE_BADGE,
  type VendorResponseSummary,
} from "../api/vendorResponses.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { FileTextIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";

/**
 * Every response this supplier has opened, drafted, submitted or withdrawn.
 *
 * Drafts stay on the list alongside submitted responses, because a draft with a
 * deadline against it is the thing most likely to be forgotten. Withdrawn and
 * closed ones stay too: a supplier is entitled to a record of what it sent.
 */

export function formatDay(value: string | null): string {
  if (value === null) return "—";
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function deadlineNote(deadline: string | null, passed: boolean): string | null {
  if (deadline === null) return null;
  if (passed) return "The date for responding has passed.";

  const days = Math.ceil((new Date(`${deadline}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "A response is due today.";
  return `${days} day(s) remain before the response date.`;
}

export function VendorResponsesPage() {
  const [responses, setResponses] = React.useState<VendorResponseSummary[]>();
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    document.title = "My Responses · ProcureAI";
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        setResponses(await fetchVendorResponses(controller.signal));
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "Your responses could not be loaded.",
        );
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  const open = (responses ?? []).filter((response) =>
    ["DRAFT", "CLARIFICATION_REQUESTED"].includes(response.status),
  );
  const sent = (responses ?? []).filter(
    (response) => !["DRAFT", "CLARIFICATION_REQUESTED"].includes(response.status),
  );

  return (
    <>
      <PageHeader
        title="My Responses"
        subtitle="Structured responses your organisation has been asked to submit"
      />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Unable to load responses" role="alert">
          {error}
        </GovernmentAlert>
      )}

      {responses === undefined && error === undefined && (
        <GovernmentCard title="Please wait">
          <p style={{ margin: 0 }}>Retrieving your responses.</p>
        </GovernmentCard>
      )}

      {responses !== undefined && responses.length === 0 && (
        <GovernmentCard title="No response has been asked for yet">
          <p style={{ margin: 0 }}>
            A response becomes available once your organisation accepts a procurement invitation
            and the issuing department opens its response for that work package. You are notified
            in the portal when that happens.
          </p>
          <p style={{ marginBottom: 0 }}>
            <Link className="gov-link-button" to="/vendor/invitations">
              View your procurement invitations
            </Link>
          </p>
        </GovernmentCard>
      )}

      {open.length > 0 && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileTextIcon size={18} />
              <span>Needing your attention ({open.length})</span>
            </div>
          }
          subtitle="Responses you can still edit and submit"
        >
          <ResponseList responses={open} />
        </GovernmentCard>
      )}

      {sent.length > 0 && (
        <GovernmentCard
          title={`Submitted and closed responses (${sent.length})`}
          subtitle="What your organisation has sent, and where each stands"
        >
          <ResponseList responses={sent} />
        </GovernmentCard>
      )}
    </>
  );
}

function ResponseList({ responses }: { responses: VendorResponseSummary[] }) {
  return (
    <div className="gov-opportunity-list">
      {responses.map((response) => {
        const badge = VENDOR_RESPONSE_BADGE[response.status];
        const note =
          response.status === "DRAFT" || response.status === "CLARIFICATION_REQUESTED"
            ? deadlineNote(response.responseDeadline, response.deadlinePassed)
            : null;

        return (
          <article key={response.id} className="gov-opportunity">
            <div className="gov-opportunity__head">
              <h3 className="gov-opportunity__title">
                {response.packageNumber} — {response.packageTitle}
              </h3>
              <span className={badge.className}>{badge.label}</span>
            </div>

            <div className="gov-opportunity__meta">
              <span>{response.departmentName}</span>
              <span>{response.responseType.replace(/_/g, " ")}</span>
              <span>{response.projectTitle}</span>
              {response.responseDeadline !== null && (
                <span>Due {formatDay(response.responseDeadline)}</span>
              )}
              {response.submittedAt !== null && (
                <span>Submitted {formatDay(response.submittedAt)}</span>
              )}
            </div>

            {note !== null && (
              <p className="gov-fine-print" style={{ margin: "0 0 8px" }}>
                {note}
              </p>
            )}

            {response.openClarifications > 0 && (
              <p className="gov-fine-print" style={{ margin: "0 0 8px" }}>
                {response.openClarifications} clarification(s) outstanding on this response.
              </p>
            )}

            {response.status === "WITHDRAWN" && response.withdrawalReason !== null && (
              <p className="gov-fine-print" style={{ margin: "0 0 8px" }}>
                Withdrawn: {response.withdrawalReason}
              </p>
            )}

            <div className="gov-opportunity__actions">
              <Link
                className="gov-btn gov-btn--primary gov-btn--sm"
                to={`/vendor/responses/${response.id}`}
              >
                {response.status === "DRAFT" || response.status === "CLARIFICATION_REQUESTED"
                  ? "Continue response"
                  : "View response"}
              </Link>
              <Link
                className="gov-btn gov-btn--tertiary gov-btn--sm"
                to={`/vendor/invitations/${response.invitationId}`}
              >
                View invitation
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
