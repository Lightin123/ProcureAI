import React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  getVendorMatchDetail,
  getVendorMatches,
  inviteVendor,
  removeShortlistedVendor,
  runVendorMatching,
  shortlistVendor,
  withdrawInvitation,
  type InvitationStatus,
  type ShortlistEntry,
  type VendorMatchDetail,
  type VendorMatchView,
  type VendorRecommendation,
} from "../api/vendorMatching.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import {
  AlertCircleIcon,
  BuildingIcon,
  MailIcon,
  PackageIcon,
  SparklesIcon,
} from "../components/GovernmentIcons.js";
import { InviteVendorModal, type InvitePayload } from "../components/InviteVendorModal.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectSectionNav } from "../components/ProjectSectionNav.js";
import { ShortlistReasonModal } from "../components/ShortlistReasonModal.js";
import { VendorComparisonModal } from "../components/VendorComparisonModal.js";
import { VendorMatchCard } from "../components/VendorMatchCard.js";
import { VendorMatchDetailModal } from "../components/VendorMatchDetailModal.js";

/**
 * Ranked supplier recommendations for one confirmed work package.
 *
 * The screen is arranged in the order the decision is made: what is being
 * bought, then what the package requires as a mandatory condition, then the
 * suppliers who satisfy those conditions, then — separately and last — the
 * suppliers who were excluded and why. The exclusions are on the same page
 * rather than hidden, because a matching system whose rejections cannot be
 * inspected is a matching system nobody should act on.
 */

function formatInr(amount: number | null): string {
  if (amount === null) return "Not stated";
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} crore`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} lakh`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

const MAX_COMPARISON = 4;

const INVITATION_BADGE: Record<InvitationStatus, { label: string; className: string }> = {
  INVITED: { label: "Awaiting response", className: "gov-badge gov-badge--pending" },
  ACCEPTED: { label: "Accepted", className: "gov-badge gov-badge--operational" },
  DECLINED: { label: "Declined", className: "gov-badge gov-badge--cancelled" },
  WITHDRAWN: { label: "Withdrawn", className: "gov-badge gov-badge--inactive" },
};

function formatMoment(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(value: string | null): string {
  if (value === null) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function WorkPackageVendorMatchingPage() {
  const { id, workPackageId } = useParams<{ id: string; workPackageId: string }>();
  const projectId = id ?? "";
  const packageId = workPackageId ?? "";
  const navigate = useNavigate();

  const [view, setView] = React.useState<VendorMatchView>();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();

  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);
  const [showExcluded, setShowExcluded] = React.useState(false);

  const [detail, setDetail] = React.useState<VendorMatchDetail>();
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const [shortlisting, setShortlisting] = React.useState<VendorRecommendation>();
  const [inviting, setInviting] = React.useState<ShortlistEntry>();

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        setView(await getVendorMatches(packageId, signal));
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "The supplier matching for this work package could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [packageId],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  async function perform(action: () => Promise<unknown>, successMessage?: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    try {
      await action();
      await load();
      if (successMessage !== undefined) setNotice(successMessage);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "The action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openVendor(vendorProfileId: string): Promise<void> {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(undefined);

    try {
      setDetail(await getVendorMatchDetail(packageId, vendorProfileId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The supplier record could not be loaded.",
      );
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  const workPackage = view?.workPackage;
  const run = view?.run ?? null;
  const recommendations = view?.recommendations ?? [];
  const excluded = view?.excluded ?? [];
  const shortlist = view?.shortlist ?? [];
  const invitations = view?.invitations ?? [];
  const shortlisted = new Set(shortlist.map((entry) => entry.vendorProfileId));
  const packageLabel =
    view?.workPackage === undefined
      ? "this work package"
      : `${view.workPackage.packageNumber} — ${view.workPackage.title}`;

  const isConfirmed = workPackage?.status === "CONFIRMED";
  const mandatory = view?.matchingRequirements?.mandatoryCertifications ?? [];

  const selectedRecommendations = React.useMemo(
    () =>
      [...recommendations, ...excluded].filter((recommendation) =>
        selected.includes(recommendation.vendor.vendorProfileId),
      ),
    [recommendations, excluded, selected],
  );

  // Recalculating can drop a selected supplier out of the results entirely.
  // Without this the Compare button keeps counting suppliers who are no longer
  // on the page and then does nothing when pressed.
  React.useEffect(() => {
    if (view === undefined) return;

    const present = new Set(
      [...recommendations, ...excluded].map((entry) => entry.vendor.vendorProfileId),
    );

    setSelected((current) => {
      const kept = current.filter((id) => present.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [view, recommendations, excluded]);

  function toggleSelect(vendorProfileId: string, isSelected: boolean): void {
    setSelected((current) => {
      if (!isSelected) return current.filter((entry) => entry !== vendorProfileId);
      if (current.includes(vendorProfileId)) return current;
      if (current.length >= MAX_COMPARISON) return current;
      return [...current, vendorProfileId];
    });
  }

  function confirmShortlist(reason: string): void {
    const recommendation = shortlisting;
    if (recommendation === undefined) return;

    setShortlisting(undefined);
    void perform(
      () => shortlistVendor(packageId, recommendation.vendor.vendorProfileId, reason),
      "The supplier has been added to the shortlist for this work package.",
    );
  }

  function confirmInvitation(payload: InvitePayload): void {
    const entry = inviting;
    if (entry === undefined) return;

    setInviting(undefined);
    void perform(
      () =>
        inviteVendor(packageId, {
          vendorProfileId: entry.vendorProfileId,
          message: payload.message,
          responseDeadline: payload.responseDeadline,
        }),
      `${entry.legalName ?? entry.organizationName} has been invited and notified in the supplier portal.`,
    );
  }

  function handleWithdraw(invitationId: string, supplierName: string): void {
    const reason = window.prompt(
      `State why the invitation to ${supplierName} is being withdrawn. The supplier is told.`,
      "",
    );
    if (reason === null) return;

    void perform(
      () => withdrawInvitation(packageId, invitationId, reason.trim() === "" ? null : reason.trim()),
      "The invitation has been withdrawn and the supplier has been notified.",
    );
  }

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Procurement Projects", to: "/projects" },
          { label: "Project", to: `/projects/${projectId}` },
          { label: "Work Packages", to: `/projects/${projectId}/work-packages` },
          { label: "Supplier Matching" },
        ]}
      />

      <PageHeader
        title="Supplier Matching"
        subtitle={
          workPackage === undefined
            ? "Eligible suppliers ranked against a confirmed work package"
            : `${workPackage.packageNumber} — ${workPackage.title}`
        }
        action={
          <button
            type="button"
            className="gov-btn gov-btn--secondary"
            onClick={() => navigate(`/projects/${projectId}/work-packages`)}
          >
            Back to work packages
          </button>
        }
      />

      <ProjectSectionNav projectId={projectId} />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Action could not be completed">
          {error}
        </GovernmentAlert>
      )}

      {notice !== undefined && (
        <GovernmentAlert type="success" title="Notification">
          {notice}
        </GovernmentAlert>
      )}

      {loading && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--gov-text-secondary)" }}>
          Loading supplier matching for this work package…
        </div>
      )}

      {!loading && workPackage !== undefined && (
        <>
          {/* ---- The work package ---------------------------------------- */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <PackageIcon size={20} />
                <span>
                  {workPackage.packageNumber} — {workPackage.title}
                </span>
              </div>
            }
            subtitle="What is being procured, and the conditions a supplier must satisfy"
          >
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Procurement category</dt>
                <dd className="gov-desc-val">{workPackage.category}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Complexity</dt>
                <dd className="gov-desc-val">{workPackage.complexity}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Priority</dt>
                <dd className="gov-desc-val">{workPackage.priority}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Status</dt>
                <dd className="gov-desc-val">{workPackage.status}</dd>
              </div>
            </dl>

            <p style={{ marginTop: "14px", fontSize: "14px" }}>{workPackage.description}</p>

            {workPackage.deliverables.length > 0 && (
              <>
                <strong
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    color: "var(--gov-text-muted)",
                    display: "block",
                    margin: "12px 0 6px",
                    letterSpacing: "0.5px",
                  }}
                >
                  Deliverables ({workPackage.deliverables.length})
                </strong>
                <ul className="gov-plain-list" style={{ margin: 0 }}>
                  {workPackage.deliverables.map((deliverable, index) => (
                    <li key={`${index}-${deliverable}`} style={{ fontSize: "13px" }}>
                      {deliverable}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {mandatory.length > 0 && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  background: "var(--gov-saffron-light)",
                  border: "1px solid #F5D2A8",
                  borderRadius: "var(--gov-radius)",
                }}
              >
                <strong
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--gov-saffron-dark)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Mandatory conditions applied as a hard filter
                </strong>
                <ul className="gov-plain-list" style={{ margin: 0 }}>
                  {mandatory.map((requirement) => (
                    <li key={requirement.code} style={{ fontSize: "13px" }}>
                      <strong>{requirement.label}</strong>
                      <div style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                        {requirement.sourceText}
                      </div>
                    </li>
                  ))}
                </ul>
                {view?.matchingRequirements?.estimatedValueCeilingInr != null && (
                  <div style={{ marginTop: "8px", fontSize: "13px" }}>
                    Stated package value:{" "}
                    <strong>
                      {formatInr(view.matchingRequirements.estimatedValueCeilingInr)}
                    </strong>
                  </div>
                )}
              </div>
            )}
          </GovernmentCard>

          {/* ---- Run the pipeline ---------------------------------------- */}
          <div className="gov-ai-banner">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <SparklesIcon size={18} />
              <h2 style={{ margin: 0, fontSize: "16px" }}>Hybrid supplier discovery</h2>
            </div>

            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--gov-text-secondary)" }}>
              Suppliers are filtered against this package&rsquo;s mandatory conditions, then
              retrieved by both keyword overlap and semantic similarity, then ranked on seven
              weighted dimensions. The ranking is a recommendation; the decision remains with the
              procuring official.
            </p>

            {run !== null && (
              <dl className="gov-desc-list" style={{ marginBottom: "16px" }}>
                <div className="gov-desc-item">
                  <dt className="gov-desc-term">Candidate pool</dt>
                  <dd className="gov-desc-val">{run.poolSize}</dd>
                </div>
                <div className="gov-desc-item">
                  <dt className="gov-desc-term">Found by keyword</dt>
                  <dd className="gov-desc-val">{run.lexicalCandidates}</dd>
                </div>
                <div className="gov-desc-item">
                  <dt className="gov-desc-term">Found by semantic</dt>
                  <dd className="gov-desc-val">
                    {run.semanticEnabled ? run.semanticCandidates : "Unavailable"}
                  </dd>
                </div>
                <div className="gov-desc-item">
                  <dt className="gov-desc-term">Eligible</dt>
                  <dd
                    className="gov-desc-val"
                    style={{ color: "var(--gov-success-dark)", fontWeight: 700 }}
                  >
                    {run.eligibleCount} / {run.poolSize}
                  </dd>
                </div>
                <div className="gov-desc-item">
                  <dt className="gov-desc-term">Embedding model</dt>
                  <dd className="gov-desc-val gov-desc-val--mono">
                    {run.embeddingModel ?? "None"}
                  </dd>
                </div>
                <div className="gov-desc-item">
                  <dt className="gov-desc-term">Last run</dt>
                  <dd className="gov-desc-val">
                    {new Date(run.createdAt).toLocaleString("en-IN")}
                  </dd>
                </div>
              </dl>
            )}

            {run !== null && !run.semanticEnabled && (
              <GovernmentAlert type="warning" title="Semantic retrieval was unavailable">
                This ranking was produced from keyword retrieval alone. Suppliers who describe
                comparable work in different terms may not appear.
              </GovernmentAlert>
            )}

            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || !isConfirmed}
              title={
                isConfirmed
                  ? "Run the matching pipeline against the current supplier registry"
                  : "Only a confirmed work package can be matched"
              }
              onClick={() =>
                void perform(
                  () => runVendorMatching(packageId),
                  "Supplier matching has been recalculated against the current registry.",
                )
              }
            >
              <SparklesIcon size={16} />
              {run === null ? "Find suitable vendors" : "Recalculate matching"}
            </button>
          </div>

          {!isConfirmed && (
            <GovernmentAlert type="warning" title="This work package is not confirmed">
              Supplier matching runs against confirmed work packages only. Confirm this package on
              the work packages page before searching for suppliers.
            </GovernmentAlert>
          )}

          {/* ---- Shortlist ----------------------------------------------- */}
          {shortlist.length > 0 && (
            <GovernmentCard
              title={`Shortlist for this work package (${shortlist.length})`}
              subtitle="Suppliers the department has marked for engagement, and whether each has been invited"
            >
              <div className="gov-table-container">
                <table className="gov-table">
                  <caption className="gov-table-caption">
                    This shortlist belongs to {workPackage.packageNumber} alone. Shortlisting a
                    supplier here does not shortlist them for any other work package in the
                    project.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Supplier</th>
                      <th scope="col" style={{ width: "70px" }}>
                        Rank
                      </th>
                      <th scope="col" style={{ width: "70px" }}>
                        Score
                      </th>
                      <th scope="col">Reason recorded</th>
                      <th scope="col" style={{ width: "150px" }}>
                        Added by
                      </th>
                      <th scope="col" style={{ width: "150px" }}>
                        Engagement
                      </th>
                      <th scope="col" style={{ width: "180px" }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortlist.map((entry) => {
                      const badge =
                        entry.invitationStatus === null
                          ? undefined
                          : INVITATION_BADGE[entry.invitationStatus];
                      const live =
                        entry.invitationStatus === "INVITED" ||
                        entry.invitationStatus === "ACCEPTED";

                      return (
                        <tr key={entry.id}>
                          <td>{entry.legalName ?? entry.organizationName}</td>
                          <td>{entry.rankAtShortlist ?? "—"}</td>
                          <td>{entry.scoreAtShortlist ?? "—"}</td>
                          <td>{entry.reason ?? "—"}</td>
                          <td>
                            {entry.addedByName}
                            <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                              {formatMoment(entry.createdAt)}
                            </div>
                          </td>
                          <td>
                            {badge === undefined ? (
                              <span style={{ color: "var(--gov-text-muted)", fontSize: "12px" }}>
                                Not yet invited
                              </span>
                            ) : (
                              <span className={badge.className}>{badge.label}</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {!live && (
                                <button
                                  type="button"
                                  className="gov-btn gov-btn--primary gov-btn--sm"
                                  disabled={busy || !isConfirmed}
                                  onClick={() => setInviting(entry)}
                                  title={
                                    entry.invitationStatus === null
                                      ? "Invite this supplier to respond to this work package"
                                      : "Issue a fresh invitation to this supplier"
                                  }
                                >
                                  {entry.invitationStatus === null ? "Invite" : "Invite again"}
                                </button>
                              )}

                              {entry.invitationStatus === "INVITED" &&
                                entry.invitationId !== null && (
                                  <button
                                    type="button"
                                    className="gov-btn gov-btn--tertiary gov-btn--sm"
                                    disabled={busy}
                                    onClick={() =>
                                      handleWithdraw(
                                        entry.invitationId as string,
                                        entry.legalName ?? entry.organizationName,
                                      )
                                    }
                                  >
                                    Withdraw
                                  </button>
                                )}

                              {!live && (
                                <button
                                  type="button"
                                  className="gov-btn gov-btn--tertiary gov-btn--sm"
                                  style={{ color: "var(--gov-danger)" }}
                                  disabled={busy}
                                  onClick={() =>
                                    void perform(
                                      () =>
                                        removeShortlistedVendor(packageId, entry.vendorProfileId),
                                      "The supplier has been removed from the shortlist.",
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GovernmentCard>
          )}

          {/* ---- Invitation tracking ------------------------------------- */}
          {invitations.length > 0 && (
            <GovernmentCard
              title={
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <MailIcon size={18} />
                  <span>Invitations issued ({invitations.length})</span>
                </div>
              }
              subtitle="Every invitation on this work package, and how each supplier answered"
            >
              <div className="gov-table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th scope="col">Supplier</th>
                      <th scope="col" style={{ width: "150px" }}>
                        Status
                      </th>
                      <th scope="col" style={{ width: "170px" }}>
                        Invited
                      </th>
                      <th scope="col" style={{ width: "130px" }}>
                        Response due
                      </th>
                      <th scope="col" style={{ width: "170px" }}>
                        Responded
                      </th>
                      <th scope="col">Supplier&rsquo;s note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((invitation) => {
                      const badge = INVITATION_BADGE[invitation.status];

                      return (
                        <tr key={invitation.id}>
                          <td>{invitation.legalName ?? invitation.organizationName}</td>
                          <td>
                            <span className={badge.className}>{badge.label}</span>
                          </td>
                          <td>
                            {formatMoment(invitation.invitedAt)}
                            <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                              by {invitation.invitedByName}
                            </div>
                          </td>
                          <td>{formatDay(invitation.responseDeadline)}</td>
                          <td>
                            {invitation.respondedAt === null ? (
                              <span style={{ color: "var(--gov-text-muted)" }}>—</span>
                            ) : (
                              <>
                                {formatMoment(invitation.respondedAt)}
                                <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                                  by {invitation.respondedByName ?? "the supplier"}
                                </div>
                              </>
                            )}
                          </td>
                          <td style={{ fontSize: "13px" }}>
                            {invitation.status === "WITHDRAWN"
                              ? `Withdrawn by ${invitation.withdrawnByName ?? "the department"}${
                                  invitation.withdrawalReason === null
                                    ? "."
                                    : `: ${invitation.withdrawalReason}`
                                }`
                              : (invitation.responseNote ?? "—")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GovernmentCard>
          )}

          {/* ---- Recommendations ----------------------------------------- */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <BuildingIcon size={20} />
                <span>Recommended suppliers ({recommendations.length})</span>
              </div>
            }
            subtitle="Eligible suppliers, ranked on weighted capability, experience, capacity, geography and compliance"
            action={
              <button
                type="button"
                className="gov-btn gov-btn--secondary gov-btn--sm"
                disabled={selected.length < 2}
                onClick={() => setComparing(true)}
                title={
                  selected.length < 2
                    ? "Select at least two suppliers to compare"
                    : `Compare ${selected.length} selected suppliers`
                }
              >
                Compare ({selected.length})
              </button>
            }
          >
            {run === null ? (
              <div
                style={{
                  padding: "36px",
                  textAlign: "center",
                  backgroundColor: "var(--gov-bg-alt)",
                  borderRadius: "var(--gov-radius)",
                  border: "1px dashed var(--gov-border-strong)",
                }}
              >
                <BuildingIcon size={32} />
                <h4 style={{ margin: "12px 0 6px", color: "var(--gov-text-primary)" }}>
                  No matching has been run for this work package
                </h4>
                <p style={{ margin: 0, color: "var(--gov-text-secondary)", fontSize: "14px" }}>
                  Use &ldquo;Find suitable vendors&rdquo; above to search the supplier registry
                  against this package&rsquo;s requirements.
                </p>
              </div>
            ) : recommendations.length === 0 ? (
              <GovernmentAlert type="warning" title="No eligible supplier was found">
                {excluded.length === 0
                  ? "No supplier in the registry matched this work package's requirements closely enough to be assessed."
                  : `${excluded.length} supplier(s) were assessed but none satisfied every mandatory condition. Their exclusion reasons are listed below.`}
              </GovernmentAlert>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {recommendations.map((recommendation) => (
                  <VendorMatchCard
                    key={recommendation.vendor.vendorProfileId}
                    recommendation={recommendation}
                    isSelected={selected.includes(recommendation.vendor.vendorProfileId)}
                    isShortlisted={shortlisted.has(recommendation.vendor.vendorProfileId)}
                    busy={busy}
                    onToggleSelect={toggleSelect}
                    onView={(vendorProfileId) => void openVendor(vendorProfileId)}
                    onShortlist={setShortlisting}
                    onRemoveShortlist={(vendorProfileId) =>
                      void perform(
                        () => removeShortlistedVendor(packageId, vendorProfileId),
                        "The supplier has been removed from the shortlist.",
                      )
                    }
                  />
                ))}
              </div>
            )}
          </GovernmentCard>

          {/* ---- Excluded ------------------------------------------------ */}
          {excluded.length > 0 && (
            <GovernmentCard
              title={
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertCircleIcon size={18} />
                  <span>Excluded by mandatory conditions ({excluded.length})</span>
                </div>
              }
              subtitle="Suppliers assessed against this package who did not satisfy every mandatory requirement"
              action={
                <button
                  type="button"
                  className="gov-btn gov-btn--tertiary gov-btn--sm"
                  onClick={() => setShowExcluded((value) => !value)}
                >
                  {showExcluded ? "Hide" : "Show"}
                </button>
              }
            >
              {showExcluded ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {excluded.map((recommendation) => (
                    <VendorMatchCard
                      key={recommendation.vendor.vendorProfileId}
                      recommendation={recommendation}
                      isSelected={selected.includes(recommendation.vendor.vendorProfileId)}
                      isShortlisted={false}
                      busy={busy}
                      onToggleSelect={toggleSelect}
                      onView={(vendorProfileId) => void openVendor(vendorProfileId)}
                      onShortlist={setShortlisting}
                      onRemoveShortlist={() => undefined}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--gov-text-secondary)" }}>
                  {excluded.length} supplier(s) were removed by the eligibility filter before
                  ranking. Their exclusion reasons are recorded and can be inspected.
                </p>
              )}
            </GovernmentCard>
          )}
        </>
      )}

      <VendorComparisonModal
        isOpen={comparing && selectedRecommendations.length >= 2}
        recommendations={selectedRecommendations}
        onClose={() => setComparing(false)}
      />

      <VendorMatchDetailModal
        isOpen={detailOpen}
        detail={detail}
        loading={detailLoading}
        onClose={() => setDetailOpen(false)}
      />

      <ShortlistReasonModal
        recommendation={shortlisting}
        packageLabel={packageLabel}
        busy={busy}
        onConfirm={confirmShortlist}
        onCancel={() => setShortlisting(undefined)}
      />

      <InviteVendorModal
        entry={inviting}
        packageLabel={packageLabel}
        busy={busy}
        onConfirm={confirmInvitation}
        onCancel={() => setInviting(undefined)}
      />
    </>
  );
}
