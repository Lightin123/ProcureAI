import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  fetchDashboard,
  markNotificationsRead,
  requestCapabilityInsights,
  type CapabilityInsights,
  type VendorDashboard,
} from "../api/vendor.js";
import { useCurrentUser } from "../auth/AuthContext.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { PageHeader } from "../components/PageHeader.js";
import {
  CompletionMeter,
  MatchBadge,
  ProfileStatusBadge,
  VerificationBadge,
} from "../components/vendor/VendorStatusBadges.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; dashboard: VendorDashboard }
  | { kind: "failed"; message: string };

function formatDate(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.ceil((target.getTime() - Date.now()) / 86_400_000);
}

export function VendorDashboardPage() {
  const user = useCurrentUser();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [insights, setInsights] = useState<CapabilityInsights | undefined>(undefined);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsError, setInsightsError] = useState<string | undefined>(undefined);

  useEffect(() => {
    document.title = "Supplier Dashboard · ProcureAI";
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const dashboard = await fetchDashboard(signal);
      setState({ kind: "ready", dashboard });
      setInsights(dashboard.profile.aiInsights ?? undefined);
    } catch (error) {
      if (signal?.aborted === true) return;
      setState({
        kind: "failed",
        message:
          error instanceof ApiRequestError
            ? error.message
            : "The supplier workspace could not be loaded.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  async function generateInsights() {
    setInsightsBusy(true);
    setInsightsError(undefined);
    try {
      const result = await requestCapabilityInsights();
      setInsights(result.insights);
    } catch (error) {
      setInsightsError(
        error instanceof ApiRequestError
          ? error.message
          : "The capability assessment could not be generated.",
      );
    } finally {
      setInsightsBusy(false);
    }
  }

  async function dismissNotifications() {
    await markNotificationsRead();
    await load();
  }

  if (state.kind === "loading") {
    return (
      <>
        <PageHeader title="Supplier Dashboard" subtitle="Loading your workspace…" />
        <GovernmentCard title="Please wait">
          <p>Retrieving your capability profile and matched procurement opportunities.</p>
        </GovernmentCard>
      </>
    );
  }

  if (state.kind === "failed") {
    return (
      <>
        <PageHeader title="Supplier Dashboard" subtitle="The workspace could not be loaded." />
        <GovernmentAlert type="error" title="Unable to Load Workspace" role="alert">
          {state.message}
        </GovernmentAlert>
      </>
    );
  }

  const { dashboard } = state;
  const { profile, counts, completion } = dashboard;
  const onboardingIncomplete = !completion.readyToSubmit;

  return (
    <>
      <PageHeader
        title="Supplier Dashboard"
        subtitle={`${profile.legalName ?? profile.organizationName} · ${user.roleLabel}`}
        action={
          <Link className="gov-btn gov-btn--primary" to="/vendor/onboarding">
            {onboardingIncomplete ? "Continue onboarding" : "Edit capability profile"}
          </Link>
        }
      />

      {profile.status === "DRAFT" && (
        <GovernmentAlert type="warning" title="Capability Profile Not Yet Submitted">
          Your profile is a draft. Complete the outstanding mandatory fields and submit it for
          verification — a draft profile can be matched to opportunities but cannot register
          interest in one.
        </GovernmentAlert>
      )}

      {profile.status === "CHANGES_REQUESTED" && (
        <GovernmentAlert type="error" title="Changes Requested by the Portal Administration" role="alert">
          {profile.verificationNotes ?? "Review your submitted details and resubmit."}
        </GovernmentAlert>
      )}

      {profile.status === "VERIFIED" && (
        <GovernmentAlert type="success" title="Verified Supplier">
          Your capability profile has been verified. Verified suppliers rank higher in matching and
          can be shortlisted by departments.
        </GovernmentAlert>
      )}

      <div className="gov-stats-grid">
        <div className="gov-stat-card">
          <span className="gov-stat-card__label">Profile Completion</span>
          <span className="gov-stat-card__value">{completion.percentage}%</span>
          <span className="gov-stat-card__meta">
            {completion.missingRequired.length === 0
              ? "All mandatory fields answered"
              : `${completion.missingRequired.length} mandatory field(s) outstanding`}
          </span>
        </div>
        <div className="gov-stat-card gov-stat-card--saffron">
          <span className="gov-stat-card__label">Open Opportunities</span>
          <span className="gov-stat-card__value">{counts.openOpportunities}</span>
          <span className="gov-stat-card__meta">Published across all departments</span>
        </div>
        <div className="gov-stat-card gov-stat-card--success">
          <span className="gov-stat-card__label">Interest Registered</span>
          <span className="gov-stat-card__value">{counts.interestSubmitted}</span>
          <span className="gov-stat-card__meta">{counts.savedOpportunities} saved for later</span>
        </div>
        <div className="gov-stat-card gov-stat-card--secondary">
          <span className="gov-stat-card__label">Documents</span>
          <span className="gov-stat-card__value">{counts.documents}</span>
          <span className="gov-stat-card__meta">
            {counts.pendingDocuments} awaiting verification
          </span>
        </div>
      </div>

      <div className="gov-two-column">
        <div className="gov-two-column__main">
          <GovernmentCard
            title="Recommended Procurement Opportunities"
            subtitle="Ranked by how well your recorded capabilities cover what each department has asked for"
            action={
              <Link className="gov-btn gov-btn--secondary gov-btn--sm" to="/vendor/opportunities">
                View all
              </Link>
            }
          >
            {dashboard.recommendedOpportunities.length === 0 ? (
              <p>
                No procurement opportunities have been published yet. When a department publishes
                one, it will be matched against your capability profile and appear here.
              </p>
            ) : (
              <ul className="gov-opportunity-list">
                {dashboard.recommendedOpportunities.map((opportunity) => (
                  <li key={opportunity.id} className="gov-opportunity">
                    <div className="gov-opportunity__head">
                      <div>
                        <Link
                          className="gov-opportunity__title"
                          to={`/vendor/opportunities/${opportunity.id}`}
                        >
                          {opportunity.title}
                        </Link>
                        <p className="gov-opportunity__meta">
                          {opportunity.referenceNumber} · {opportunity.departmentName}
                          {opportunity.responseDeadline !== null &&
                            ` · Responses by ${formatDate(opportunity.responseDeadline)}`}
                        </p>
                      </div>
                      {opportunity.match !== undefined && <MatchBadge match={opportunity.match} />}
                    </div>
                    <p className="gov-opportunity__summary">{opportunity.summary}</p>
                    {opportunity.match !== undefined &&
                      opportunity.match.matchedTerms.length > 0 && (
                        <ul className="gov-chip-list">
                          {opportunity.match.matchedTerms.slice(0, 8).map((term) => (
                            <li key={term} className="gov-chip gov-chip--match">
                              {term}
                            </li>
                          ))}
                        </ul>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </GovernmentCard>

          <GovernmentCard
            title="AI Capability Assessment"
            subtitle="An assessment of how your profile reads to a government buyer"
            action={
              <button
                type="button"
                className="gov-btn gov-btn--secondary gov-btn--sm"
                disabled={insightsBusy}
                onClick={() => void generateInsights()}
              >
                {insightsBusy
                  ? "Assessing…"
                  : insights === undefined
                    ? "Generate assessment"
                    : "Regenerate"}
              </button>
            }
          >
            {insightsError !== undefined && (
              <GovernmentAlert type="error" title="Assessment Unavailable" role="alert">
                {insightsError}
              </GovernmentAlert>
            )}

            {insights === undefined ? (
              <p>
                No assessment has been generated yet. The assessment reads your capability profile
                and describes how your organisation is positioned for public procurement. It is
                advisory: nothing in matching, verification or eligibility reads it back.
              </p>
            ) : (
              <>
                <div className="gov-callout-box">
                  <span className="gov-callout-box__label">Positioning</span>
                  <p>{insights.positioning_summary}</p>
                </div>

                <div className="gov-insight-columns">
                  <div>
                    <h3 className="gov-section-title">Strengths</h3>
                    {insights.strengths.length === 0 ? (
                      <p>None identified from the profile as recorded.</p>
                    ) : (
                      <ul className="gov-insight-list">
                        {insights.strengths.map((item) => (
                          <li key={item.title}>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="gov-section-title">Gaps</h3>
                    {insights.gaps.length === 0 ? (
                      <p>No gaps identified.</p>
                    ) : (
                      <ul className="gov-insight-list">
                        {insights.gaps.map((item) => (
                          <li key={item.title}>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {insights.suggested_opportunity_areas.length > 0 && (
                  <>
                    <h3 className="gov-section-title">Procurement areas to watch</h3>
                    <ul className="gov-chip-list">
                      {insights.suggested_opportunity_areas.map((area) => (
                        <li key={area} className="gov-chip">
                          {area}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="gov-fine-print">
                  Generated by {profile.aiInsightsModel ?? insights.model}
                  {profile.aiInsightsAt !== null &&
                    ` on ${new Date(profile.aiInsightsAt).toLocaleString("en-IN")}`}
                  . This is decision support for your own use — it does not affect your
                  verification status or how you are matched.
                </p>
              </>
            )}
          </GovernmentCard>

          <GovernmentCard
            title="Interest Registered"
            subtitle="Opportunities you have told the department you wish to be considered for"
          >
            {dashboard.submissions.length === 0 ? (
              <p>
                You have not registered interest in any opportunity yet. Open an opportunity and
                use “Register interest” to tell the department you wish to be considered.
              </p>
            ) : (
              <div className="gov-table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th scope="col">Opportunity</th>
                      <th scope="col">Department</th>
                      <th scope="col">Status</th>
                      <th scope="col">Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.submissions.map((submission) => (
                      <tr key={submission.id}>
                        <td>
                          <Link to={`/vendor/opportunities/${submission.id}`}>
                            {submission.title}
                          </Link>
                          <div className="gov-table-mono">{submission.referenceNumber}</div>
                        </td>
                        <td>{submission.departmentName}</td>
                        <td>
                          <span
                            className={
                              submission.interestState === "SUBMITTED"
                                ? "gov-badge gov-badge--confirmed"
                                : "gov-badge gov-badge--draft"
                            }
                          >
                            {submission.interestState === "SUBMITTED" ? "Interest registered" : "Withdrawn"}
                          </span>
                        </td>
                        <td>{formatDate(submission.interestAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GovernmentCard>
        </div>

        <aside className="gov-two-column__side">
          <GovernmentCard title="Profile Status">
            <CompletionMeter percentage={completion.percentage} />
            <dl className="gov-desc-list gov-desc-list--stacked">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Profile state</dt>
                <dd className="gov-desc-val">
                  <ProfileStatusBadge status={profile.status} />
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Verification</dt>
                <dd className="gov-desc-val">
                  <VerificationBadge state={profile.verificationState} />
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Submitted</dt>
                <dd className="gov-desc-val">{formatDate(profile.submittedAt)}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Products &amp; services</dt>
                <dd className="gov-desc-val">{counts.offerings}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Recorded projects</dt>
                <dd className="gov-desc-val">{counts.experience}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Credentials</dt>
                <dd className="gov-desc-val">{counts.credentials}</dd>
              </div>
            </dl>
            <Link className="gov-btn gov-btn--secondary" to="/vendor/profile">
              View full profile
            </Link>
          </GovernmentCard>

          <GovernmentCard title="Improve Your Profile">
            {dashboard.suggestions.length === 0 ? (
              <p>Nothing outstanding. Your profile is complete and well described.</p>
            ) : (
              <ul className="gov-suggestion-list">
                {dashboard.suggestions.map((suggestion) => (
                  <li key={suggestion.title} className={`gov-suggestion gov-suggestion--${suggestion.priority.toLowerCase()}`}>
                    <div className="gov-suggestion__head">
                      <span className="gov-suggestion__priority">{suggestion.priority}</span>
                      <strong>{suggestion.title}</strong>
                    </div>
                    <p>{suggestion.detail}</p>
                    <Link
                      className="gov-link-button"
                      to={`/vendor/onboarding?step=${suggestion.stepId}`}
                    >
                      Go to section
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </GovernmentCard>

          <GovernmentCard
            title="Upcoming Deadlines"
            subtitle="Response dates on published opportunities"
          >
            {dashboard.upcomingDeadlines.length === 0 ? (
              <p>No response deadlines have been set on the published opportunities.</p>
            ) : (
              <ul className="gov-deadline-list">
                {dashboard.upcomingDeadlines.map((deadline) => {
                  const days =
                    deadline.responseDeadline === null
                      ? undefined
                      : daysUntil(deadline.responseDeadline);
                  return (
                    <li key={deadline.id} className="gov-deadline">
                      <Link to={`/vendor/opportunities/${deadline.id}`}>{deadline.title}</Link>
                      <span className="gov-deadline__meta">
                        {formatDate(deadline.responseDeadline)}
                        {days !== undefined &&
                          (days < 0
                            ? " · closed"
                            : days === 0
                              ? " · closes today"
                              : ` · ${days} day${days === 1 ? "" : "s"} remaining`)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </GovernmentCard>

          <GovernmentCard
            title="Notifications"
            action={
              counts.unreadNotifications > 0 && (
                <button
                  type="button"
                  className="gov-btn gov-btn--tertiary gov-btn--sm"
                  onClick={() => void dismissNotifications()}
                >
                  Mark all read
                </button>
              )
            }
          >
            {dashboard.notifications.length === 0 ? (
              <p>No notifications.</p>
            ) : (
              <ul className="gov-notification-list">
                {dashboard.notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={`gov-notification${notification.readAt === null ? " gov-notification--unread" : ""}`}
                  >
                    <div className="gov-notification__head">
                      <strong>{notification.title}</strong>
                      <span>{formatDate(notification.createdAt)}</span>
                    </div>
                    <p>{notification.body}</p>
                    {notification.linkPath !== null && (
                      <Link className="gov-link-button" to={notification.linkPath}>
                        Open
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </GovernmentCard>
        </aside>
      </div>
    </>
  );
}
