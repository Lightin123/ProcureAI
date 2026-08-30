import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  COMPLIANCE_BADGE,
  DECISION_BADGE,
  fetchComparison,
  fetchCriteriaSchema,
  fetchEvaluationWorkspace,
  formatInr,
  recordDecision,
  revokeDecision,
  runEvaluation,
  saveEvaluationConfig,
  type CriteriaSchema,
  type EvaluationComparison,
  type EvaluationResult,
  type EvaluationWorkspace,
  type ProcurementDecision,
} from "../api/workPackageEvaluation.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { EvaluationCriteriaPanel } from "../components/EvaluationCriteriaPanel.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import {
  CheckCircleIcon,
  FileTextIcon,
  HistoryIcon,
  RobotIcon,
} from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectSectionNav } from "../components/ProjectSectionNav.js";
import { RecordDecisionModal } from "../components/RecordDecisionModal.js";
import { RevokeDecisionDialog } from "../components/RevokeDecisionDialog.js";
import { formatDay, formatMoment } from "./WorkPackageResponsesPage.js";

/**
 * The department's evaluation workspace for one confirmed work package.
 *
 * Arranged in the order the work is actually done, and labelled so an official
 * with no technical background can follow it:
 *
 *   what is being scored on
 *     -> which responses can be scored
 *       -> run the evaluation
 *         -> read the ranking and its reasons
 *           -> compare suppliers side by side
 *             -> record the decision
 *
 * Two things this page states plainly and repeatedly, because they are what
 * makes the tool defensible: the scores are arithmetic, and the decision is a
 * person's. AI analysis appears only where it is marked as advisory, and never
 * beside a number it did not produce.
 */

export function WorkPackageEvaluationPage() {
  const { id, workPackageId } = useParams<{ id: string; workPackageId: string }>();
  const projectId = id ?? "";
  const packageId = workPackageId ?? "";
  const navigate = useNavigate();

  const [schema, setSchema] = React.useState<CriteriaSchema>();
  const [view, setView] = React.useState<EvaluationWorkspace>();
  const [comparison, setComparison] = React.useState<EvaluationComparison>();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [errorDetails, setErrorDetails] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState<string>();
  const [deciding, setDeciding] = React.useState<{
    result: EvaluationResult;
    decision: "SELECTED" | "REJECTED";
  }>();
  const [revoking, setRevoking] = React.useState<ProcurementDecision>();

  React.useEffect(() => {
    document.title = "Response Evaluation · ProcureAI";
  }, []);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [loadedSchema, loadedView] = await Promise.all([
          fetchCriteriaSchema(packageId, signal),
          fetchEvaluationWorkspace(packageId, signal),
        ]);
        setSchema(loadedSchema);
        setView(loadedView);

        // The comparison is only meaningful once something has been evaluated,
        // and 409s until then. Absence is a state, not a failure.
        if (loadedView.latestRun !== null) {
          try {
            setComparison(await fetchComparison(packageId, undefined, signal));
          } catch {
            setComparison(undefined);
          }
        } else {
          setComparison(undefined);
        }
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "The evaluation workspace could not be loaded.",
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

  /** Every mutation re-reads the workspace, so nothing optimistic is rendered. */
  async function perform(action: () => Promise<unknown>, message: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setErrorDetails([]);
    setNotice(undefined);

    try {
      await action();
      await load();
      setNotice(message);
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.message);
        setErrorDetails((caught.details ?? []).map((detail) => detail.message));
      } else {
        setError("The action could not be completed.");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const config = view?.config ?? null;
  const responses = view?.responses ?? [];
  const ready = responses.filter((response) => response.readyForEvaluation);
  const results = (view?.results ?? []).filter((result) => result.ranked);
  const excludedResults = (view?.results ?? []).filter((result) => !result.ranked);
  const decisions = view?.decisions ?? [];
  const liveDecisions = decisions.filter((decision) => decision.status === "ACTIVE");
  const selected = liveDecisions.find((decision) => decision.decision === "SELECTED");

  const runnable =
    config !== null &&
    config.status === "READY" &&
    (view?.consistencyProblems.length ?? 0) === 0 &&
    ready.length > 0;

  const packageLabel =
    view === undefined ? "" : `${view.workPackage.packageNumber} — ${view.workPackage.title}`;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/projects" },
          { label: "Procurement Projects", to: "/projects" },
          { label: view?.workPackage.projectTitle ?? "Project", to: `/projects/${projectId}` },
          { label: "Work Packages", to: `/projects/${projectId}/work-packages` },
          {
            label: "Supplier Responses",
            to: `/projects/${projectId}/work-packages/${packageId}/responses`,
          },
          { label: "Evaluation" },
        ]}
      />

      <ProjectSectionNav projectId={projectId} />

      <PageHeader
        title="Response Evaluation"
        subtitle={
          view === undefined
            ? "Score, compare and decide between the responses received"
            : packageLabel
        }
        action={
          <button
            type="button"
            className="gov-btn gov-btn--secondary"
            onClick={() =>
              void navigate(`/projects/${projectId}/work-packages/${packageId}/responses`)
            }
          >
            Back to responses
          </button>
        }
      />

      {error !== undefined && (
        <GovernmentAlert type="error" title="Action could not be completed" role="alert">
          {error}
          {errorDetails.length > 0 && (
            <ul className="gov-plain-list" style={{ marginTop: "8px", marginBottom: 0 }}>
              {errorDetails.map((detail) => (
                <li key={detail} style={{ fontSize: "13px" }}>
                  {detail}
                </li>
              ))}
            </ul>
          )}
        </GovernmentAlert>
      )}

      {notice !== undefined && (
        <GovernmentAlert type="success" title="Done">
          {notice}
        </GovernmentAlert>
      )}

      {loading && (
        <GovernmentCard title="Please wait">
          <p style={{ margin: 0 }}>Retrieving the evaluation criteria and the responses received.</p>
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* How this works                                                    */}
      {/* ---------------------------------------------------------------- */}

      {!loading && view !== undefined && (
        <GovernmentCard
          title="How this evaluation works"
          subtitle="Four separate steps, in this order, with the decision reserved to you"
        >
          <ol className="gov-plain-list" style={{ margin: 0 }}>
            <li style={{ fontSize: "13px", marginBottom: "8px" }}>
              <strong>AI analysis (advisory).</strong> A written reading of each response, quoting
              the part of the submission it came from. It is optional, it is clearly labelled, and
              it does not produce or change any score.
            </li>
            <li style={{ fontSize: "13px", marginBottom: "8px" }}>
              <strong>Deterministic evaluation.</strong> Every criterion below is scored by
              arithmetic over the figures suppliers stated and the records on their capability
              profiles. The same responses and the same criteria always produce the same numbers.
            </li>
            <li style={{ fontSize: "13px", marginBottom: "8px" }}>
              <strong>Ranked recommendations.</strong> The order follows from the scores and
              nothing else. Every position shows the factors that produced it.
            </li>
            <li style={{ fontSize: "13px" }}>
              <strong>Your decision.</strong> Nothing here selects a supplier. You do, with a reason
              you record, and the evaluation you were looking at is stored with it.
            </li>
          </ol>
        </GovernmentCard>
      )}

      {!loading && view !== undefined && view.responseConfig === null && (
        <GovernmentAlert type="warning" title="Nothing has been asked for on this work package">
          Responses can only be evaluated once the department has configured what suppliers must
          submit and collected at least one response.{" "}
          <Link to={`/projects/${projectId}/work-packages/${packageId}/responses`}>
            Configure the response first.
          </Link>
        </GovernmentAlert>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Status                                                            */}
      {/* ---------------------------------------------------------------- */}

      {!loading && view !== undefined && (
        <div className="gov-stats-grid">
          <div className="gov-stat-card">
            <span className="gov-stat-card__label">Responses received</span>
            <span className="gov-stat-card__value">{responses.length}</span>
            <span className="gov-stat-card__meta">
              {ready.length} marked ready for evaluation
            </span>
          </div>
          <div className="gov-stat-card gov-stat-card--saffron">
            <span className="gov-stat-card__label">Criteria configured</span>
            <span className="gov-stat-card__value">{config?.criteria.length ?? 0}</span>
            <span className="gov-stat-card__meta">
              {config === null
                ? "Not configured yet"
                : config.status === "READY"
                  ? `Version ${config.criteriaVersion}, ready to run`
                  : `Version ${config.criteriaVersion}, incomplete`}
            </span>
          </div>
          <div className="gov-stat-card gov-stat-card--secondary">
            <span className="gov-stat-card__label">Responses evaluated</span>
            <span className="gov-stat-card__value">{view.latestRun?.rankedCount ?? 0}</span>
            <span className="gov-stat-card__meta">
              {view.latestRun === null
                ? "No evaluation has been run"
                : `Last run ${formatMoment(view.latestRun.createdAt)} by ${view.latestRun.requestedByName}`}
            </span>
          </div>
          <div className="gov-stat-card gov-stat-card--success">
            <span className="gov-stat-card__label">Decision</span>
            <span className="gov-stat-card__value">{selected === undefined ? "—" : "1"}</span>
            <span className="gov-stat-card__meta">
              {selected === undefined
                ? "No supplier has been selected"
                : `${selected.legalName ?? selected.organizationName} selected by ${selected.decidedByName}`}
            </span>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Criteria                                                          */}
      {/* ---------------------------------------------------------------- */}

      {!loading && schema !== undefined && view !== undefined && view.responseConfig !== null && (
        <EvaluationCriteriaPanel
          schema={schema}
          config={config}
          problems={view.consistencyProblems}
          sections={view.responseConfig.sections}
          responseType={view.responseConfig.responseType}
          questions={view.questions}
          requirementCount={view.requirementCount}
          busy={busy}
          onSave={(payload) =>
            void perform(
              () => saveEvaluationConfig(packageId, payload),
              "The evaluation criteria have been saved.",
            )
          }
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Responses and the run                                             */}
      {/* ---------------------------------------------------------------- */}

      {!loading && view !== undefined && view.responseConfig !== null && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileTextIcon size={20} />
              <span>Responses to evaluate ({responses.length})</span>
            </div>
          }
          subtitle="Only a response the department has marked ready for evaluation is scored"
          action={
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || !runnable}
              title={
                runnable
                  ? "Score every response marked ready, against the configured criteria"
                  : "Configure consistent criteria and mark at least one response ready first"
              }
              onClick={() =>
                void perform(
                  () => runEvaluation(packageId),
                  "The evaluation has been run and recorded.",
                )
              }
            >
              Run evaluation
            </button>
          }
        >
          {responses.length === 0 ? (
            <GovernmentAlert type="info" title="No response has been submitted yet">
              Responses appear here once suppliers submit them. A draft a supplier has started is
              not readable by the department and is not evaluated.
            </GovernmentAlert>
          ) : (
            <div className="gov-table-container">
              <table className="gov-table">
                <caption className="gov-table-caption">
                  Supplier, response status, eligibility from supplier matching, and whether it is
                  ready to be evaluated
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Supplier</th>
                    <th scope="col" style={{ width: "170px" }}>
                      Response status
                    </th>
                    <th scope="col" style={{ width: "160px" }}>
                      Eligibility
                    </th>
                    <th scope="col" style={{ width: "160px" }}>
                      Submitted
                    </th>
                    <th scope="col" style={{ width: "120px" }}>
                      AI analysis
                    </th>
                    <th scope="col" style={{ width: "110px" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((response) => (
                    <tr key={response.responseId}>
                      <td>
                        {response.legalName ?? response.organizationName}
                        <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                          {response.verificationState} · {response.documentCount} document(s)
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            response.readyForEvaluation
                              ? "gov-badge gov-badge--operational"
                              : "gov-badge gov-badge--pending"
                          }
                        >
                          {response.status.replace(/_/g, " ").toLowerCase()}
                        </span>
                        {!response.readyForEvaluation && (
                          <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                            Mark ready on the response reader before it can be scored
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: "12px" }}>
                        {response.eligibility === null ? (
                          <span style={{ color: "var(--gov-text-muted)" }}>
                            No supplier matching run
                          </span>
                        ) : (
                          <>
                            <span
                              className={
                                response.eligibility.eligible
                                  ? "gov-badge gov-badge--operational"
                                  : "gov-badge gov-badge--cancelled"
                              }
                            >
                              {response.eligibility.eligible ? "Eligible" : "Not eligible"}
                            </span>
                            <div style={{ color: "var(--gov-text-muted)", marginTop: "4px" }}>
                              Match score {response.eligibility.overallScore}/100
                            </div>
                          </>
                        )}
                      </td>
                      <td style={{ fontSize: "12px" }}>{formatMoment(response.submittedAt)}</td>
                      <td style={{ fontSize: "12px" }}>
                        {response.hasAiAnalysis ? (
                          <span className="gov-tag gov-tag--ai">Generated</span>
                        ) : (
                          <span style={{ color: "var(--gov-text-muted)" }}>Not generated</span>
                        )}
                      </td>
                      <td>
                        <Link
                          className="gov-btn gov-btn--secondary gov-btn--sm"
                          to={`/projects/${projectId}/work-packages/${packageId}/evaluation/responses/${response.responseId}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ready.length === 0 && responses.length > 0 && (
            <GovernmentAlert type="warning" title="Nothing is ready to be evaluated yet">
              A response is evaluated once the department has reviewed it and marked it ready for
              evaluation. Open each submitted response, review it, and mark it ready.
            </GovernmentAlert>
          )}
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* The ranking                                                       */}
      {/* ---------------------------------------------------------------- */}

      {!loading && view?.latestRun != null && results.length > 0 && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircleIcon size={20} />
              <span>Ranked responses ({results.length})</span>
            </div>
          }
          subtitle={`Evaluation of ${formatMoment(view.latestRun.createdAt)}, criteria version ${view.latestRun.criteriaVersion}, scoring version ${view.latestRun.scoringVersion}`}
        >
          <GovernmentAlert type="info" title="This ranking is a calculation, not a recommendation">
            The order below follows from the criterion scores and their weights. It is decision
            support: selecting a supplier remains your decision, recorded with your reason.
          </GovernmentAlert>

          <div className="gov-table-container">
            <table className="gov-table">
              <caption className="gov-table-caption">
                Rank, supplier, total score, the strongest and weakest factors behind it, and the
                requirement compliance found
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "60px" }}>
                    Rank
                  </th>
                  <th scope="col">Supplier</th>
                  <th scope="col" style={{ width: "100px" }}>
                    Total
                  </th>
                  <th scope="col" style={{ width: "130px" }}>
                    Quoted value
                  </th>
                  <th scope="col" style={{ width: "150px" }}>
                    Requirements met
                  </th>
                  <th scope="col">Strongest and weakest factors</th>
                  <th scope="col" style={{ width: "230px" }}>
                    Decision
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const decision = liveDecisions.find(
                    (entry) => entry.responseId === result.responseId,
                  );
                  const strongest = result.structuredSummary.strongestFactors ?? [];
                  const weakest = result.structuredSummary.weakestFactors ?? [];

                  return (
                    <tr key={result.responseId}>
                      <td>
                        <strong>{result.rankPosition}</strong>
                      </td>
                      <td>
                        <Link
                          to={`/projects/${projectId}/work-packages/${packageId}/evaluation/responses/${result.responseId}`}
                        >
                          {result.legalName ?? result.organizationName}
                        </Link>
                        <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                          {result.missingInformation.length} item(s) of information outstanding
                        </div>
                      </td>
                      <td>
                        <strong>{result.totalScore.toFixed(2)}</strong>
                        <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                          of 100
                        </div>
                      </td>
                      <td className="gov-table-mono">
                        {formatInr(result.structuredSummary.quotedValueInr ?? null)}
                      </td>
                      <td style={{ fontSize: "12px" }}>
                        {result.complianceSummary.compliant} of {result.complianceSummary.total}
                        {result.complianceSummary.insufficientInformation > 0 && (
                          <div style={{ color: "var(--gov-text-muted)" }}>
                            {result.complianceSummary.insufficientInformation} with insufficient
                            information
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: "12px" }}>
                        {strongest[0] !== undefined && (
                          <div>
                            <span className="gov-chip gov-chip--match">
                              {strongest[0].label} +{strongest[0].weightedContribution.toFixed(1)}
                            </span>
                          </div>
                        )}
                        {weakest[0] !== undefined && (
                          <div style={{ marginTop: "4px" }}>
                            <span className="gov-chip gov-chip--gap">
                              {weakest[0].label} −{weakest[0].forgoneContribution.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        {decision !== undefined ? (
                          <>
                            <span className={DECISION_BADGE[decision.decision]?.className}>
                              {DECISION_BADGE[decision.decision]?.label}
                            </span>
                            <div style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                              by {decision.decidedByName}, {formatMoment(decision.decidedAt)}
                            </div>
                            <button
                              type="button"
                              className="gov-btn gov-btn--tertiary gov-btn--sm"
                              style={{ marginTop: "6px" }}
                              disabled={busy}
                              onClick={() => setRevoking(decision)}
                            >
                              Revoke
                            </button>
                          </>
                        ) : (
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="gov-btn gov-btn--success gov-btn--sm"
                              disabled={busy || selected !== undefined}
                              title={
                                selected === undefined
                                  ? "Record this supplier as selected, with your reason"
                                  : "A supplier has already been selected for this work package"
                              }
                              onClick={() => setDeciding({ result, decision: "SELECTED" })}
                            >
                              Select
                            </button>
                            <button
                              type="button"
                              className="gov-btn gov-btn--danger gov-btn--sm"
                              disabled={busy}
                              onClick={() => setDeciding({ result, decision: "REJECTED" })}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {excludedResults.length > 0 && (
            <>
              <h3 className="gov-form-section__title">
                Responses not assessed ({excludedResults.length})
              </h3>
              <ul className="gov-plain-list" style={{ margin: 0 }}>
                {excludedResults.map((result) => (
                  <li key={result.responseId} style={{ fontSize: "13px" }}>
                    <strong>{result.legalName ?? result.organizationName}:</strong>{" "}
                    {result.exclusionReason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Side-by-side comparison                                           */}
      {/* ---------------------------------------------------------------- */}

      {!loading && comparison !== undefined && comparison.columns.length > 0 && (
        <GovernmentCard
          title="Compare suppliers side by side"
          subtitle="Built from the stored evaluation, so what is compared is exactly what was calculated"
        >
          <div className="gov-table-container">
            <table className="gov-table">
              <caption className="gov-table-caption">
                Every ranked supplier compared on eligibility, price, timeline, capacity,
                certifications, compliance, and each configured criterion
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "220px" }}>
                    Comparison
                  </th>
                  {comparison.columns.map((column) => (
                    <th key={column.responseId} scope="col">
                      {column.legalName ?? column.organizationName}
                      <div style={{ fontWeight: 400, fontSize: "11px" }}>
                        Rank {column.rankPosition}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Total score</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId}>
                      <strong>{column.totalScore.toFixed(2)}</strong> / 100
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Eligibility (supplier matching)</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId} style={{ fontSize: "12px" }}>
                      {column.eligibility === null
                        ? "Not assessed"
                        : column.eligibility.eligible
                          ? "Eligible"
                          : "Not eligible"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Quoted value</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId} className="gov-table-mono">
                      {formatInr(column.structuredSummary.quotedValueInr ?? null)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Delivery duration</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId}>
                      {column.structuredSummary.estimatedDurationWeeks === null ||
                      column.structuredSummary.estimatedDurationWeeks === undefined
                        ? "Not stated"
                        : `${column.structuredSummary.estimatedDurationWeeks} weeks`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Earliest start</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId}>
                      {formatDay(column.structuredSummary.proposedStartDate ?? null)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Committed team</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId}>
                      {column.structuredSummary.committedTeamSize ?? "Not stated"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Mandatory certifications evidenced</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId}>
                      {column.structuredSummary.certificationsEvidenced ?? 0} of{" "}
                      {column.structuredSummary.certificationsRequired ?? 0}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Public-sector delivery declared</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId} style={{ fontSize: "12px" }}>
                      {column.structuredSummary.governmentExperience ?? "Not declared"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Requirement compliance</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId} style={{ fontSize: "12px" }}>
                      {column.complianceSummary.compliant} met ·{" "}
                      {column.complianceSummary.partiallyCompliant} partial ·{" "}
                      {column.complianceSummary.nonCompliant} not met ·{" "}
                      {column.complianceSummary.insufficientInformation} insufficient
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Supporting documents</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId}>{column.structuredSummary.documentCount ?? 0}</td>
                  ))}
                </tr>

                {comparison.run.criteriaSnapshot.map((criterion) => (
                  <tr key={criterion.criterionKey}>
                    <th scope="row">
                      {criterion.label}
                      <div style={{ fontWeight: 400, fontSize: "11px" }}>
                        weight {criterion.weight}
                      </div>
                    </th>
                    {comparison.columns.map((column) => {
                      const score = column.criterionScores.find(
                        (entry) => entry.criterionKey === criterion.criterionKey,
                      );

                      return (
                        <td key={column.responseId} style={{ fontSize: "12px" }}>
                          {score === undefined ? (
                            "—"
                          ) : (
                            <>
                              <strong>{score.score}</strong> / 100
                              <div style={{ color: "var(--gov-text-muted)" }}>
                                contributes {score.weightedContribution.toFixed(2)}
                              </div>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <tr>
                  <th scope="row">Strengths (calculated)</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId} style={{ fontSize: "11px" }}>
                      <ul className="gov-plain-list" style={{ margin: 0 }}>
                        {column.strengths.slice(0, 3).map((strength) => (
                          <li key={strength}>{strength}</li>
                        ))}
                      </ul>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Gaps (calculated)</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId} style={{ fontSize: "11px" }}>
                      <ul className="gov-plain-list" style={{ margin: 0 }}>
                        {column.gaps.slice(0, 3).map((gap) => (
                          <li key={gap}>{gap}</li>
                        ))}
                      </ul>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Missing information</th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId} style={{ fontSize: "11px" }}>
                      {column.missingInformation.length === 0 ? (
                        "None outstanding"
                      ) : (
                        <ul className="gov-plain-list" style={{ margin: 0 }}>
                          {column.missingInformation.slice(0, 3).map((item) => (
                            <li key={item.message}>{item.message}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">
                    <span className="gov-tag gov-tag--ai">AI advisory</span> Summary
                  </th>
                  {comparison.columns.map((column) => (
                    <td key={column.responseId} style={{ fontSize: "11px" }}>
                      {column.aiAnalysis === null
                        ? "No AI analysis has been generated for this response."
                        : column.aiAnalysis.summary}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="gov-fine-print" style={{ marginBottom: 0 }}>
            Every figure above except the row marked “AI advisory” is read from the stored
            evaluation and was calculated from what the supplier submitted. The advisory row is
            generated by a language model, is not part of any score, and should be checked against
            the response itself.
          </p>
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Requirement-by-requirement comparison                             */}
      {/* ---------------------------------------------------------------- */}

      {!loading && comparison !== undefined && comparison.requirements.length > 0 && (
        <GovernmentCard
          title="Requirement-by-requirement comparison"
          subtitle="What each supplier said about each confirmed requirement, and what that amounts to"
        >
          <div className="gov-table-container">
            <table className="gov-table">
              <caption className="gov-table-caption">
                Every confirmed requirement against every ranked supplier's stated position
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "280px" }}>
                    Requirement
                  </th>
                  {comparison.columns.map((column) => (
                    <th key={column.responseId} scope="col">
                      {column.legalName ?? column.organizationName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.requirements.map((requirement) => (
                  <tr key={requirement.id}>
                    <th scope="row" style={{ fontSize: "12px", fontWeight: 400 }}>
                      <span className="gov-tag gov-tag--meta">{requirement.category}</span>{" "}
                      {requirement.text}
                    </th>
                    {comparison.columns.map((column) => {
                      const finding = column.compliance.find(
                        (entry) => entry.requirementId === requirement.id,
                      );

                      if (finding === undefined) {
                        return (
                          <td key={column.responseId} style={{ fontSize: "12px" }}>
                            —
                          </td>
                        );
                      }

                      const badge = COMPLIANCE_BADGE[finding.status];

                      return (
                        <td key={column.responseId} style={{ fontSize: "12px" }}>
                          <span className={badge.className}>{badge.label}</span>
                          {finding.statedPosition !== null && (
                            <div style={{ color: "var(--gov-text-muted)", marginTop: "4px" }}>
                              Supplier stated: {finding.statedPosition.replace(/_/g, " ").toLowerCase()}
                            </div>
                          )}
                          {finding.vendorStatement !== null && (
                            <div style={{ marginTop: "4px" }}>
                              {finding.vendorStatement.slice(0, 200)}
                              {finding.vendorStatement.length > 200 ? "…" : ""}
                            </div>
                          )}
                          {finding.note !== null && (
                            <div style={{ color: "var(--gov-danger)", marginTop: "4px" }}>
                              {finding.note}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Decisions recorded                                                */}
      {/* ---------------------------------------------------------------- */}

      {!loading && decisions.length > 0 && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <HistoryIcon size={18} />
              <span>Decisions recorded ({decisions.length})</span>
            </div>
          }
          subtitle="Every decision taken on this work package, including any that were later revoked"
        >
          <div className="gov-table-container">
            <table className="gov-table">
              <caption className="gov-table-caption">
                Supplier, decision, reason, who decided and when, and the evaluation cited
              </caption>
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col" style={{ width: "130px" }}>
                    Decision
                  </th>
                  <th scope="col">Reason recorded</th>
                  <th scope="col" style={{ width: "200px" }}>
                    Decided by
                  </th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td>{decision.legalName ?? decision.organizationName}</td>
                    <td>
                      <span className={DECISION_BADGE[decision.decision]?.className}>
                        {DECISION_BADGE[decision.decision]?.label}
                      </span>
                      {decision.status === "REVOKED" && (
                        <div style={{ fontSize: "11px", color: "var(--gov-danger)" }}>Revoked</div>
                      )}
                    </td>
                    <td style={{ fontSize: "12px" }}>
                      {decision.reason}
                      {decision.revocationReason !== null && (
                        <div style={{ color: "var(--gov-text-muted)", marginTop: "4px" }}>
                          Revoked: {decision.revocationReason}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: "12px" }}>
                      {decision.decidedByName}
                      <div style={{ color: "var(--gov-text-muted)" }}>
                        {formatMoment(decision.decidedAt)}
                      </div>
                      {decision.rankAtDecision !== null && (
                        <div style={{ color: "var(--gov-text-muted)" }}>
                          Rank {decision.rankAtDecision}, score{" "}
                          {decision.scoreAtDecision?.toFixed(2) ?? "—"} at the time
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GovernmentCard>
      )}

      {!loading && view?.latestRun == null && (view?.responses.length ?? 0) > 0 && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <RobotIcon size={18} />
              <span>No evaluation has been run yet</span>
            </div>
          }
        >
          <p style={{ margin: 0 }}>
            Configure the criteria above, mark the responses you have reviewed as ready for
            evaluation, and run the evaluation. Every run is kept with the criteria it applied, so a
            score you act on stays reproducible afterwards.
          </p>
        </GovernmentCard>
      )}

      {deciding !== undefined && (
        <RecordDecisionModal
          result={deciding.result}
          decision={deciding.decision}
          packageLabel={packageLabel}
          busy={busy}
          onCancel={() => setDeciding(undefined)}
          onConfirm={(reason) => {
            const target = deciding;
            setDeciding(undefined);
            void perform(
              () =>
                recordDecision(packageId, {
                  responseId: target.result.responseId,
                  decision: target.decision,
                  reason,
                  evaluationRunId: view?.latestRun?.id ?? null,
                }),
              target.decision === "SELECTED"
                ? "The selection has been recorded against your account."
                : "The rejection has been recorded against your account.",
            );
          }}
        />
      )}

      {revoking !== undefined && (
        <RevokeDecisionDialog
          decision={revoking}
          busy={busy}
          onCancel={() => setRevoking(undefined)}
          onConfirm={(reason) => {
            const target = revoking;
            setRevoking(undefined);
            void perform(
              () => revokeDecision(packageId, target.id, { reason }),
              "The decision has been revoked. The original record is retained.",
            );
          }}
        />
      )}
    </>
  );
}
