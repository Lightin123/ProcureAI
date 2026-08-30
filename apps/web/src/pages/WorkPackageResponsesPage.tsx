import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  addResponseQuestion,
  closeResponseConfig,
  fetchResponseSchema,
  fetchResponseWorkspace,
  openResponseConfig,
  removeResponseQuestion,
  saveResponseConfig,
  RESPONSE_STATUS_BADGE,
  type ConfigPayload,
  type ResponseSchema,
  type ResponseWorkspace,
} from "../api/workPackageResponses.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { FileTextIcon, MailIcon, PackageIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectSectionNav } from "../components/ProjectSectionNav.js";
import { ResponseConfigPanel } from "../components/ResponseConfigPanel.js";

/**
 * The department's response workspace for one confirmed work package.
 *
 * Arranged in the order the work is done: what is being asked for, then who was
 * invited and whether they have answered, then the responses themselves. The
 * response contents are one click away rather than inline, because a proposal
 * is long and comparing statuses is the thing this page is for.
 *
 * Nothing here scores, ranks or recommends a supplier. Collecting and tracking
 * responses is Milestone 8; scoring, comparing and deciding between them is the
 * evaluation workspace, one click away.
 */

export function formatMoment(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(value: string | null): string {
  if (value === null) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function WorkPackageResponsesPage() {
  const { id, workPackageId } = useParams<{ id: string; workPackageId: string }>();
  const projectId = id ?? "";
  const packageId = workPackageId ?? "";
  const navigate = useNavigate();

  const [schema, setSchema] = React.useState<ResponseSchema>();
  const [view, setView] = React.useState<ResponseWorkspace>();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();

  React.useEffect(() => {
    document.title = "Supplier Responses · ProcureAI";
  }, []);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [loadedSchema, loadedView] = await Promise.all([
          fetchResponseSchema(packageId, signal),
          fetchResponseWorkspace(packageId, signal),
        ]);
        setSchema(loadedSchema);
        setView(loadedView);
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "The responses for this work package could not be loaded.",
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

  /**
   * Every mutation goes through here and re-reads the workspace afterwards, so
   * the page never renders an optimistic state the server has not confirmed.
   */
  async function perform(action: () => Promise<unknown>, message: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    try {
      await action();
      await load();
      setNotice(message);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : "The action could not be completed.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const config = view?.config ?? null;
  const responses = view?.responses ?? [];
  const counts = view?.counts;

  // What is being asked for is frozen once anything has been submitted; the
  // server enforces it and the panel explains it rather than letting the
  // officer discover it through a refusal.
  const frozen = responses.some(
    (response) => response.status !== "DRAFT" && response.status !== "WITHDRAWN",
  );

  const acceptedInvitations = (view?.invitations ?? []).filter(
    (invitation) => invitation.status === "ACCEPTED",
  );
  const notStarted = acceptedInvitations.filter(
    (invitation) => !responses.some((response) => response.vendorProfileId === invitation.vendorProfileId),
  );

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/projects" },
          { label: "Procurement Projects", to: "/projects" },
          { label: view?.workPackage.projectTitle ?? "Project", to: `/projects/${projectId}` },
          { label: "Work Packages", to: `/projects/${projectId}/work-packages` },
          { label: "Supplier Responses" },
        ]}
      />

      <ProjectSectionNav projectId={projectId} />

      <PageHeader
        title="Supplier Responses"
        subtitle={
          view === undefined
            ? "Configure and track the responses invited suppliers submit"
            : `${view.workPackage.packageNumber} — ${view.workPackage.title}`
        }
        action={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="gov-btn gov-btn--secondary"
              onClick={() =>
                void navigate(`/projects/${projectId}/work-packages/${packageId}/suppliers`)
              }
            >
              Back to supplier matching
            </button>
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              onClick={() =>
                void navigate(`/projects/${projectId}/work-packages/${packageId}/evaluation`)
              }
            >
              Evaluate responses
            </button>
          </div>
        }
      />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Action could not be completed" role="alert">
          {error}
        </GovernmentAlert>
      )}

      {notice !== undefined && (
        <GovernmentAlert type="success" title="Done">
          {notice}
        </GovernmentAlert>
      )}

      {loading && (
        <GovernmentCard title="Please wait">
          <p style={{ margin: 0 }}>Retrieving the response configuration and submissions.</p>
        </GovernmentCard>
      )}

      {!loading && view !== undefined && view.workPackage.status !== "CONFIRMED" && (
        <GovernmentAlert type="warning" title="This work package is not confirmed">
          A response can only be asked for against a confirmed work package. Confirm the package
          before configuring what suppliers should submit.
        </GovernmentAlert>
      )}

      {!loading && counts !== undefined && (
        <div className="gov-stats-grid">
          <div className="gov-stat-card">
            <span className="gov-stat-card__label">Responses received</span>
            <span className="gov-stat-card__value">
              {counts.total - counts.drafts - counts.withdrawn}
            </span>
            <span className="gov-stat-card__meta">
              {counts.drafts} draft(s) in progress · {acceptedInvitations.length} supplier(s)
              accepted their invitation
            </span>
          </div>
          <div className="gov-stat-card gov-stat-card--saffron">
            <span className="gov-stat-card__label">Awaiting review</span>
            <span className="gov-stat-card__value">{counts.submitted}</span>
            <span className="gov-stat-card__meta">
              {counts.underReview} under review · {counts.clarificationRequested} awaiting
              clarification
            </span>
          </div>
          <div className="gov-stat-card gov-stat-card--success">
            <span className="gov-stat-card__label">Ready for evaluation</span>
            <span className="gov-stat-card__value">{counts.readyForEvaluation}</span>
            <span className="gov-stat-card__meta">
              Complete responses the department has accepted for assessment
            </span>
          </div>
          <div className="gov-stat-card gov-stat-card--secondary">
            <span className="gov-stat-card__label">Open clarifications</span>
            <span className="gov-stat-card__value">{counts.openClarifications}</span>
            <span className="gov-stat-card__meta">
              Questions outstanding in either direction · {counts.withdrawn} withdrawn
            </span>
          </div>
        </div>
      )}

      {!loading && schema !== undefined && (
        <ResponseConfigPanel
          schema={schema}
          config={config}
          questions={view?.questions ?? []}
          busy={busy}
          frozen={frozen}
          onSave={(payload: ConfigPayload) =>
            void perform(
              () => saveResponseConfig(packageId, payload),
              "The response configuration has been saved.",
            )
          }
          onOpen={() =>
            void perform(async () => {
              const result = await openResponseConfig(packageId);
              setNotice(
                `Responses are now open. ${result.notifiedSuppliers} supplier(s) were notified.`,
              );
            }, "Responses are now open to the invited suppliers.")
          }
          onClose={() =>
            void perform(
              () => closeResponseConfig(packageId),
              "Collection has been closed. Submitted responses are unaffected.",
            )
          }
          onAddQuestion={(question) =>
            void perform(
              () => addResponseQuestion(packageId, question),
              "The question has been added.",
            )
          }
          onRemoveQuestion={(questionId) =>
            void perform(
              () => removeResponseQuestion(packageId, questionId),
              "The question has been removed.",
            )
          }
        />
      )}

      {!loading && config !== null && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileTextIcon size={20} />
              <span>Responses ({responses.length})</span>
            </div>
          }
          subtitle="Every supplier response to this work package, and where each stands"
        >
          {responses.length === 0 ? (
            <GovernmentAlert type="info" title="No supplier has started a response">
              {config.status === "DRAFT"
                ? "The response has not been opened to suppliers yet. Open it above to notify every supplier that accepted its invitation."
                : "The response is open. Suppliers that accepted their invitation can now start drafting."}
            </GovernmentAlert>
          ) : (
            <div className="gov-table-container">
              <table className="gov-table">
                <caption className="gov-table-caption">
                  Vendor, response type, status, submission and deadline
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Vendor</th>
                    <th scope="col" style={{ width: "150px" }}>
                      Response type
                    </th>
                    <th scope="col" style={{ width: "180px" }}>
                      Status
                    </th>
                    <th scope="col" style={{ width: "170px" }}>
                      Submitted at
                    </th>
                    <th scope="col" style={{ width: "130px" }}>
                      Deadline
                    </th>
                    <th scope="col" style={{ width: "110px" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((response) => {
                    const badge = RESPONSE_STATUS_BADGE[response.status];

                    return (
                      <tr key={response.id}>
                        <td>
                          {response.legalName ?? response.organizationName}
                          <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                            {response.verificationState} ·{" "}
                            {response.documentCount} document(s)
                            {response.openClarifications > 0
                              ? ` · ${response.openClarifications} open clarification(s)`
                              : ""}
                          </div>
                        </td>
                        <td>{response.responseType.replace(/_/g, " ")}</td>
                        <td>
                          <span className={badge.className}>{badge.label}</span>
                          {response.submissionCount > 1 && (
                            <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                              {response.submissionCount} submissions
                            </div>
                          )}
                        </td>
                        <td>
                          {formatMoment(response.submittedAt)}
                          {response.submittedByName !== null && (
                            <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                              by {response.submittedByName}
                            </div>
                          )}
                        </td>
                        <td>
                          {formatDay(response.responseDeadline)}
                          {response.deadlinePassed && (
                            <div style={{ fontSize: "11px", color: "var(--gov-danger)" }}>
                              Date passed
                            </div>
                          )}
                        </td>
                        <td>
                          {response.status === "DRAFT" ? (
                            <span
                              style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}
                              title="A draft is not visible to the department until the supplier submits it"
                            >
                              Not submitted
                            </span>
                          ) : (
                            <Link
                              className="gov-btn gov-btn--primary gov-btn--sm"
                              to={`/projects/${projectId}/work-packages/${packageId}/responses/${response.id}`}
                            >
                              Open
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {notStarted.length > 0 && config.status === "OPEN" && (
            <p className="gov-fine-print" style={{ marginBottom: 0 }}>
              {notStarted.length} supplier(s) accepted an invitation but have not opened a
              response yet:{" "}
              {notStarted.map((invitation) => invitation.legalName ?? invitation.organizationName).join(", ")}.
            </p>
          )}
        </GovernmentCard>
      )}

      {!loading && view !== undefined && view.invitations.length === 0 && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MailIcon size={18} />
              <span>No supplier has been invited</span>
            </div>
          }
        >
          <p style={{ margin: 0 }}>
            Responses are collected from suppliers that were invited to this work package and
            accepted. Shortlist and invite suppliers first.
          </p>
          <p style={{ marginBottom: 0 }}>
            <Link
              className="gov-link-button"
              to={`/projects/${projectId}/work-packages/${packageId}/suppliers`}
            >
              Go to supplier matching
            </Link>
          </p>
        </GovernmentCard>
      )}

      {!loading && view !== undefined && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <PackageIcon size={18} />
              <span>Confirmed requirements ({view.requirements.length})</span>
            </div>
          }
          subtitle="What suppliers are asked to answer, requirement by requirement"
        >
          {view.requirements.length === 0 ? (
            <p style={{ margin: 0 }}>
              This work package carries no confirmed requirements, so the requirement section of a
              response will be empty.
            </p>
          ) : (
            <ol className="gov-plain-list" style={{ margin: 0 }}>
              {view.requirements.map((requirement) => (
                <li key={requirement.id} style={{ fontSize: "13px", marginBottom: "6px" }}>
                  <span className="gov-tag gov-tag--meta">{requirement.category}</span>{" "}
                  {requirement.text}
                </li>
              ))}
            </ol>
          )}
        </GovernmentCard>
      )}
    </>
  );
}
