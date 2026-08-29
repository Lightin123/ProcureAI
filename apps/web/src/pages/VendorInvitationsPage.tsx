import React from "react";
import { Link } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  fetchInvitations,
  type InvitationStatus,
  type VendorInvitation,
} from "../api/vendorInvitations.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { MailIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";

/**
 * Every procurement invitation addressed to this supplier.
 *
 * Answered and withdrawn invitations stay on the list. A supplier is entitled
 * to a record of what it was asked and what it replied, and an invitation that
 * disappears once a department withdraws it is a record the supplier cannot
 * check.
 */

export const INVITATION_BADGE: Record<
  InvitationStatus,
  { label: string; className: string }
> = {
  INVITED: { label: "Awaiting your response", className: "gov-badge gov-badge--pending" },
  ACCEPTED: { label: "Accepted", className: "gov-badge gov-badge--operational" },
  DECLINED: { label: "Declined", className: "gov-badge gov-badge--cancelled" },
  WITHDRAWN: { label: "Withdrawn by department", className: "gov-badge gov-badge--inactive" },
};

export function formatDay(value: string | null): string {
  if (value === null) return "—";
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function deadlineNote(responseDeadline: string | null): string | null {
  if (responseDeadline === null) return null;

  const days = Math.ceil(
    (new Date(`${responseDeadline}T00:00:00`).getTime() - Date.now()) / 86_400_000,
  );

  if (days < 0) return `The stated response date passed ${Math.abs(days)} day(s) ago.`;
  if (days === 0) return "A response is requested today.";
  return `${days} day(s) remain before the stated response date.`;
}

export function VendorInvitationsPage() {
  const [invitations, setInvitations] = React.useState<VendorInvitation[]>();
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    document.title = "Procurement Invitations · ProcureAI";
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        setInvitations(await fetchInvitations(controller.signal));
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "Your procurement invitations could not be loaded.",
        );
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  const awaiting = (invitations ?? []).filter((item) => item.status === "INVITED");
  const answered = (invitations ?? []).filter((item) => item.status !== "INVITED");

  return (
    <>
      <PageHeader
        title="Procurement Invitations"
        subtitle="Work packages your organisation has been invited to respond to"
      />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Unable to load invitations" role="alert">
          {error}
        </GovernmentAlert>
      )}

      {invitations === undefined && error === undefined && (
        <GovernmentCard title="Please wait">
          <p>Retrieving invitations addressed to your organisation.</p>
        </GovernmentCard>
      )}

      {invitations !== undefined && invitations.length === 0 && (
        <GovernmentCard title="No invitations yet">
          <p style={{ margin: 0 }}>
            Your organisation has not been invited to a work package. Departments invite suppliers
            from their own shortlists; keeping your capability profile complete and verified is
            what puts you in front of them.
          </p>
          <p style={{ marginBottom: 0 }}>
            <Link className="gov-link-button" to="/vendor/opportunities">
              Browse published procurement opportunities
            </Link>
          </p>
        </GovernmentCard>
      )}

      {awaiting.length > 0 && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MailIcon size={18} />
              <span>Awaiting your response ({awaiting.length})</span>
            </div>
          }
          subtitle="Open each invitation to review the work package and accept or decline"
        >
          <InvitationList invitations={awaiting} />
        </GovernmentCard>
      )}

      {answered.length > 0 && (
        <GovernmentCard
          title={`Closed invitations (${answered.length})`}
          subtitle="Invitations your organisation has answered, and those the department withdrew"
        >
          <InvitationList invitations={answered} />
        </GovernmentCard>
      )}
    </>
  );
}

function InvitationList({ invitations }: { invitations: VendorInvitation[] }) {
  return (
    <div className="gov-opportunity-list">
      {invitations.map((invitation) => {
        const badge = INVITATION_BADGE[invitation.status];
        const note = invitation.status === "INVITED" ? deadlineNote(invitation.responseDeadline) : null;

        return (
          <article key={invitation.id} className="gov-opportunity">
            <div className="gov-opportunity__head">
              <h3 className="gov-opportunity__title">
                {invitation.packageNumber} — {invitation.packageTitle}
              </h3>
              <span className={badge.className}>{badge.label}</span>
            </div>

            <div className="gov-opportunity__meta">
              <span>{invitation.departmentName}</span>
              <span>{invitation.projectTitle}</span>
              <span>Invited {formatDay(invitation.invitedAt)}</span>
              {invitation.responseDeadline !== null && (
                <span>Respond by {formatDay(invitation.responseDeadline)}</span>
              )}
            </div>

            <p className="gov-opportunity__summary">{invitation.packageDescription}</p>

            {note !== null && (
              <p className="gov-fine-print" style={{ margin: "0 0 8px" }}>
                {note}
              </p>
            )}

            <div className="gov-opportunity__actions">
              <Link
                className="gov-btn gov-btn--primary gov-btn--sm"
                to={`/vendor/invitations/${invitation.id}`}
              >
                {invitation.status === "INVITED" ? "Review and respond" : "View invitation"}
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
