import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  fetchInvitation,
  respondToInvitation,
  type VendorInvitation,
} from "../api/vendorInvitations.js";
import { openVendorResponse } from "../api/vendorResponses.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { GovernmentModal } from "../components/GovernmentModal.js";
import { PackageIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { INVITATION_BADGE, deadlineNote, formatDay } from "./VendorInvitationsPage.js";

/**
 * One invitation, as the supplier sees it.
 *
 * The page shows the work package the department wants a response on, the
 * instructions the official wrote, the date a response is expected, and the two
 * actions. It shows nothing about how the supplier was selected: no rank, no
 * score, no comparison, no other supplier. The API does not serve those to this
 * side, and the page does not ask for them.
 *
 * Accepting registers a willingness to respond. It is not itself a proposal, a
 * quotation or a commitment to supply: what follows an acceptance is the
 * structured response, which the department opens and this page links into.
 */

export function VendorInvitationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invitationId = id ?? "";
  const navigate = useNavigate();

  const [invitation, setInvitation] = React.useState<VendorInvitation>();
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);
  const [declineReason, setDeclineReason] = React.useState("");
  const [acceptNote, setAcceptNote] = React.useState("");

  React.useEffect(() => {
    document.title = "Procurement Invitation · ProcureAI";
  }, []);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        setInvitation(await fetchInvitation(invitationId, signal));
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "This invitation could not be loaded.",
        );
      }
    },
    [invitationId],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  async function respond(decision: "ACCEPTED" | "DECLINED", note: string | null): Promise<void> {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    try {
      setInvitation(await respondToInvitation(invitationId, { decision, note }));
      setDeclining(false);
      setDeclineReason("");
      setAcceptNote("");
      setNotice(
        decision === "ACCEPTED"
          ? "Your acceptance has been recorded. The department can now see that your organisation intends to respond."
          : "Your decision to decline has been recorded, along with the reason you stated.",
      );
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "Your response could not be recorded.",
      );
      // The invitation may have been withdrawn or already answered elsewhere;
      // re-reading it puts the page back in step with the server.
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Opens the structured response, or resumes the draft already open against
   * this invitation. The server is idempotent, so pressing this twice resumes
   * rather than duplicates.
   */
  async function startResponse(): Promise<void> {
    setBusy(true);
    setError(undefined);

    try {
      const workspace = await openVendorResponse(invitationId);
      await navigate(`/vendor/responses/${workspace.response.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The response could not be opened.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const open = invitation?.status === "INVITED";
  const badge = invitation === undefined ? undefined : INVITATION_BADGE[invitation.status];
  const responseState = invitation?.response;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/vendor" },
          { label: "Procurement Invitations", to: "/vendor/invitations" },
          { label: "Invitation" },
        ]}
      />

      <PageHeader
        title="Procurement Invitation"
        subtitle={
          invitation === undefined
            ? "A work package your organisation has been invited to respond to"
            : `${invitation.packageNumber} — ${invitation.packageTitle}`
        }
        action={
          <Link className="gov-btn gov-btn--secondary" to="/vendor/invitations">
            Back to invitations
          </Link>
        }
      />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Action could not be completed" role="alert">
          {error}
        </GovernmentAlert>
      )}

      {notice !== undefined && (
        <GovernmentAlert type="success" title="Response recorded">
          {notice}
        </GovernmentAlert>
      )}

      {invitation === undefined && error === undefined && (
        <GovernmentCard title="Please wait">
          <p>Retrieving this invitation.</p>
        </GovernmentCard>
      )}

      {invitation !== undefined && badge !== undefined && (
        <>
          <GovernmentCard
            title="Invitation"
            subtitle={`Issued by ${invitation.departmentName}`}
            action={<span className={badge.className}>{badge.label}</span>}
          >
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Issuing department</dt>
                <dd className="gov-desc-val">{invitation.departmentName}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Procurement project</dt>
                <dd className="gov-desc-val">{invitation.projectTitle}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Project reference</dt>
                <dd className="gov-desc-val gov-desc-val--mono">
                  {invitation.projectReferenceNumber}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Invitation date</dt>
                <dd className="gov-desc-val">{formatDay(invitation.invitedAt)}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Response requested by</dt>
                <dd className="gov-desc-val">{formatDay(invitation.responseDeadline)}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Status</dt>
                <dd className="gov-desc-val">{badge.label}</dd>
              </div>
            </dl>

            {open && deadlineNote(invitation.responseDeadline) !== null && (
              <p className="gov-fine-print" style={{ marginBottom: 0 }}>
                {deadlineNote(invitation.responseDeadline)}
              </p>
            )}

            {invitation.message !== null && (
              <div className="gov-callout-box" style={{ marginTop: "16px" }}>
                <span className="gov-callout-box__label">Instructions from the department</span>
                <p style={{ margin: 0, fontSize: "14px" }}>{invitation.message}</p>
              </div>
            )}

            {invitation.status === "WITHDRAWN" && (
              <GovernmentAlert type="warning" title="This invitation was withdrawn">
                {invitation.departmentName} withdrew this invitation on{" "}
                {formatDay(invitation.withdrawnAt)}.
                {invitation.withdrawalReason === null
                  ? " No reason was recorded."
                  : ` Reason recorded: ${invitation.withdrawalReason}`}
              </GovernmentAlert>
            )}

            {invitation.respondedAt !== null && (
              <div style={{ marginTop: "16px" }}>
                <strong
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--gov-text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Your response
                </strong>
                <p style={{ margin: 0, fontSize: "14px" }}>
                  {invitation.status === "ACCEPTED" ? "Accepted" : "Declined"} on{" "}
                  {formatDay(invitation.respondedAt)}.
                  {invitation.responseNote === null ? "" : ` ${invitation.responseNote}`}
                </p>
              </div>
            )}
          </GovernmentCard>

          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <PackageIcon size={20} />
                <span>
                  {invitation.packageNumber} — {invitation.packageTitle}
                </span>
              </div>
            }
            subtitle="The work package this invitation concerns"
          >
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Procurement category</dt>
                <dd className="gov-desc-val">{invitation.packageCategory}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Complexity</dt>
                <dd className="gov-desc-val">{invitation.packageComplexity}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Priority</dt>
                <dd className="gov-desc-val">{invitation.packagePriority}</dd>
              </div>
            </dl>

            <p style={{ marginTop: "14px", fontSize: "14px" }}>{invitation.packageDescription}</p>

            <strong
              style={{
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--gov-text-muted)",
                display: "block",
                margin: "16px 0 6px",
              }}
            >
              Scope of work
            </strong>
            <p style={{ margin: 0, fontSize: "14px" }}>{invitation.packageScope}</p>

            {invitation.deliverables.length > 0 && (
              <>
                <strong
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--gov-text-muted)",
                    display: "block",
                    margin: "16px 0 6px",
                  }}
                >
                  Deliverables ({invitation.deliverables.length})
                </strong>
                <ul className="gov-plain-list" style={{ margin: 0 }}>
                  {invitation.deliverables.map((deliverable, index) => (
                    <li key={`${index}-${deliverable}`} style={{ fontSize: "13px" }}>
                      {deliverable}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </GovernmentCard>

          {/* ---- The structured response (Milestone 8) -------------------- */}
          {invitation.status === "ACCEPTED" && responseState !== undefined && (
            <GovernmentCard
              title="Your structured response"
              subtitle="What the department has asked your organisation to submit for this work package"
            >
              {responseState.responseId !== null ? (
                <>
                  <p style={{ marginTop: 0, fontSize: "14px" }}>
                    A response has been started for this invitation
                    {responseState.responseType === null
                      ? ""
                      : ` as ${responseState.responseType.replace(/_/g, " ").toLowerCase()}`}
                    .{" "}
                    {responseState.responseDeadline === null
                      ? "No response date was stated."
                      : `Responses are due by ${formatDay(responseState.responseDeadline)}.`}
                  </p>
                  <div className="gov-form-actions">
                    <Link
                      className="gov-btn gov-btn--primary"
                      to={`/vendor/responses/${responseState.responseId}`}
                    >
                      Open your response
                    </Link>
                  </div>
                </>
              ) : responseState.open ? (
                <>
                  <p style={{ marginTop: 0, fontSize: "14px" }}>
                    {invitation.departmentName} has asked for
                    {responseState.responseType === null
                      ? " a response"
                      : ` ${responseState.responseType.replace(/_/g, " ").toLowerCase()}`}
                    .{" "}
                    {responseState.responseDeadline === null
                      ? "No response date was stated."
                      : `Responses are due by ${formatDay(responseState.responseDeadline)}.`}{" "}
                    Your draft is saved as you go and you can return to it at any time.
                  </p>
                  <div className="gov-form-actions">
                    <button
                      type="button"
                      className="gov-btn gov-btn--primary"
                      disabled={busy}
                      onClick={() => void startResponse()}
                    >
                      Start your response
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "14px" }}>
                  {responseState.configured
                    ? "The department has prepared a response for this work package but has not opened it yet. You will be notified in this portal when it does."
                    : "The department has not yet asked for a structured response to this work package. You will be notified in this portal when it does."}
                </p>
              )}
            </GovernmentCard>
          )}

          {open && (
            <GovernmentCard
              title="Your response"
              subtitle="Accepting registers your intent to respond; it is not yet a proposal or a quotation"
            >
              <div className="gov-form-group">
                <label className="gov-form-label" htmlFor="accept-note">
                  Note to the department (optional)
                </label>
                <textarea
                  id="accept-note"
                  className="gov-form-control"
                  rows={3}
                  maxLength={2000}
                  value={acceptNote}
                  disabled={busy}
                  onChange={(event) => setAcceptNote(event.target.value)}
                  placeholder="Anything the department should know alongside your acceptance…"
                />
              </div>

              <div className="gov-form-actions">
                <button
                  type="button"
                  className="gov-btn gov-btn--success"
                  disabled={busy}
                  onClick={() =>
                    void respond("ACCEPTED", acceptNote.trim() === "" ? null : acceptNote.trim())
                  }
                >
                  Accept invitation
                </button>
                <button
                  type="button"
                  className="gov-btn gov-btn--danger"
                  disabled={busy}
                  onClick={() => setDeclining(true)}
                >
                  Decline invitation
                </button>
              </div>
            </GovernmentCard>
          )}
        </>
      )}

      <GovernmentModal
        isOpen={declining}
        title="Decline this invitation"
        onClose={() => setDeclining(false)}
        footer={
          <>
            <button
              type="button"
              className="gov-btn gov-btn--tertiary"
              onClick={() => setDeclining(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="gov-btn gov-btn--danger"
              disabled={busy || declineReason.trim().length < 1}
              onClick={() => void respond("DECLINED", declineReason.trim())}
            >
              Confirm decline
            </button>
          </>
        }
      >
        <div className="gov-form-group">
          <label className="gov-form-label" htmlFor="decline-reason">
            Reason for declining <span className="gov-form-required">*</span>
          </label>
          <p className="gov-form-hint" id="decline-reason-hint">
            The department sees this. Stating the ground — capacity, timing, scope, geography —
            is what lets it look for a supplier who can take the work.
          </p>
          <textarea
            id="decline-reason"
            className="gov-form-control"
            rows={4}
            maxLength={2000}
            value={declineReason}
            disabled={busy}
            onChange={(event) => setDeclineReason(event.target.value)}
            aria-describedby="decline-reason-hint"
            autoFocus
          />
        </div>
      </GovernmentModal>
    </>
  );
}
