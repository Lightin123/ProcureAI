import React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  COMPLIANCE_BADGE,
  DECISION_BADGE,
  fetchResponseEvaluation,
  formatInr,
  generateAiAnalysis,
  type EvaluationResponseView,
} from "../api/workPackageEvaluation.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { CheckCircleIcon, RobotIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectSectionNav } from "../components/ProjectSectionNav.js";
import { formatMoment } from "./WorkPackageResponsesPage.js";

/**
 * One supplier's evaluation, in full.
 *
 * The page is laid out to keep the three layers visibly apart:
 *
 *   - the deterministic score, decomposed criterion by criterion, each showing
 *     what it was calculated from and where that value was read;
 *   - the requirement-by-requirement comparison, with the supplier's own stated
 *     position beside the verdict the comparison reached;
 *   - the AI reading, in its own card, under an advisory heading, generated
 *     only when an official asks for it and never mixed into a number.
 *
 * An official who reads only the first two has read everything that produced
 * the ranking. That is the property the layout exists to preserve.
 */

export function EvaluationResponseDetailPage() {
  const { id, workPackageId, responseId } = useParams<{
    id: string;
    workPackageId: string;
    responseId: string;
  }>();
  const projectId = id ?? "";
  const packageId = workPackageId ?? "";
  const responseKey = responseId ?? "";
  const navigate = useNavigate();

  const [view, setView] = React.useState<EvaluationResponseView>();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const [showHistory, setShowHistory] = React.useState(false);

  React.useEffect(() => {
    document.title = "Response Evaluation · ProcureAI";
  }, []);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        setView(await fetchResponseEvaluation(packageId, responseKey, signal));
      } catch (caught) {
        if (signal?.aborted === true) return;
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "This response's evaluation could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [packageId, responseKey],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  async function generate(): Promise<void> {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    try {
      await generateAiAnalysis(packageId, responseKey);
      await load();
      setNotice(
        "An advisory reading has been generated and recorded. It has not changed any score.",
      );
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "The advisory analysis could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  }

  const result = view?.result ?? null;
  const latestAnalysis = view?.aiAnalyses[0] ?? null;
  const earlierAnalyses = (view?.aiAnalyses ?? []).slice(1);
  const supplier =
    view === undefined ? "" : (view.response.legalName ?? view.response.organizationName);

  const requirementById = new Map(
    (view?.requirements ?? []).map((requirement) => [requirement.id, requirement]),
  );

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/projects" },
          { label: "Procurement Projects", to: "/projects" },
          { label: view?.workPackage.projectTitle ?? "Project", to: `/projects/${projectId}` },
          { label: "Work Packages", to: `/projects/${projectId}/work-packages` },
          {
            label: "Evaluation",
            to: `/projects/${projectId}/work-packages/${packageId}/evaluation`,
          },
          { label: supplier === "" ? "Response" : supplier },
        ]}
      />

      <ProjectSectionNav projectId={projectId} />

      <PageHeader
        title={supplier === "" ? "Response evaluation" : supplier}
        subtitle={
          view === undefined
            ? "The evaluation of one submitted response"
            : `${view.workPackage.packageNumber} — ${view.workPackage.title}`
        }
        action={
          <button
            type="button"
            className="gov-btn gov-btn--secondary"
            onClick={() =>
              void navigate(`/projects/${projectId}/work-packages/${packageId}/evaluation`)
            }
          >
            Back to evaluation
          </button>
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
          <p style={{ margin: 0 }}>Retrieving this response and its evaluation.</p>
        </GovernmentCard>
      )}

      {!loading && view !== undefined && (
        <GovernmentCard title="Submission" subtitle="What was received, and where it stands">
          <dl className="gov-desc-list">
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Status</dt>
              <dd className="gov-desc-val">{view.response.status.replace(/_/g, " ")}</dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Submitted</dt>
              <dd className="gov-desc-val">{formatMoment(view.response.submittedAt)}</dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Submissions</dt>
              <dd className="gov-desc-val">{view.response.submissionCount}</dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Eligibility at supplier matching</dt>
              <dd className="gov-desc-val">
                {view.eligibility === null
                  ? "No supplier matching run recorded"
                  : `${view.eligibility.eligible ? "Eligible" : "Not eligible"} — match score ${view.eligibility.overallScore}/100`}
              </dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Supporting documents</dt>
              <dd className="gov-desc-val">{view.documents.length}</dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Decision recorded</dt>
              <dd className="gov-desc-val">
                {view.decision === null ? (
                  "None"
                ) : (
                  <span className={DECISION_BADGE[view.decision.decision]?.className}>
                    {DECISION_BADGE[view.decision.decision]?.label}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {view.decision !== null && (
            <GovernmentAlert
              type={view.decision.decision === "SELECTED" ? "success" : "info"}
              title={`Recorded by ${view.decision.decidedByName} on ${formatMoment(view.decision.decidedAt)}`}
            >
              {view.decision.reason}
            </GovernmentAlert>
          )}
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Deterministic score                                               */}
      {/* ---------------------------------------------------------------- */}

      {!loading && view !== undefined && result === null && (
        <GovernmentAlert type="info" title="This response has not been evaluated yet">
          Configure the criteria and run the evaluation from the evaluation workspace. Only a
          response the department has marked ready for evaluation is scored.
        </GovernmentAlert>
      )}

      {!loading && result !== null && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircleIcon size={20} />
              <span>Deterministic evaluation</span>
            </div>
          }
          subtitle={
            view?.run === null || view?.run === undefined
              ? undefined
              : `Evaluation of ${formatMoment(view.run.createdAt)}, criteria version ${view.run.criteriaVersion}, scoring version ${view.run.scoringVersion}`
          }
          action={
            <span className="gov-badge gov-badge--operational">
              {result.totalScore.toFixed(2)} / 100
              {result.rankPosition === null ? "" : ` · rank ${result.rankPosition}`}
            </span>
          }
        >
          <GovernmentAlert type="info" title="Every number below is arithmetic">
            Each criterion is calculated from figures this supplier stated in its submission or
            recorded on its capability profile. No AI model produced, adjusted or influenced any of
            them. The basis line under each score names the values it was calculated from.
          </GovernmentAlert>

          {result.structuredSummary.explanation !== undefined && (
            <p className="gov-lead">{result.structuredSummary.explanation}</p>
          )}

          <div className="gov-table-container">
            <table className="gov-table">
              <caption className="gov-table-caption">
                Criterion, score, weight, weighted contribution, and the basis and evidence for each
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "180px" }}>
                    Criterion
                  </th>
                  <th scope="col" style={{ width: "80px" }}>
                    Score
                  </th>
                  <th scope="col" style={{ width: "80px" }}>
                    Weight
                  </th>
                  <th scope="col" style={{ width: "110px" }}>
                    Contribution
                  </th>
                  <th scope="col">Basis and evidence</th>
                </tr>
              </thead>
              <tbody>
                {result.criterionScores.map((score) => (
                  <tr key={score.criterionKey}>
                    <td>
                      {score.label}
                      {score.missing && (
                        <div style={{ fontSize: "11px", color: "var(--gov-danger)" }}>
                          Information missing
                        </div>
                      )}
                    </td>
                    <td>
                      <strong>{score.score}</strong> / 100
                    </td>
                    <td>{score.weight}</td>
                    <td>
                      <strong>{score.weightedContribution.toFixed(2)}</strong>
                    </td>
                    <td style={{ fontSize: "12px" }}>
                      {score.basis}
                      {score.evidence.length > 0 && (
                        <ul className="gov-plain-list" style={{ marginTop: "6px", marginBottom: 0 }}>
                          {score.evidence.map((line) => (
                            <li key={line} style={{ color: "var(--gov-text-muted)" }}>
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Total</th>
                  <td colSpan={2} />
                  <td>
                    <strong>{result.totalScore.toFixed(2)}</strong>
                  </td>
                  <td style={{ fontSize: "12px" }}>
                    The sum of the weighted contributions above, out of 100.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="gov-insight-columns">
            <div>
              <h3 className="gov-form-section__title">Strongest factors</h3>
              <ul className="gov-plain-list" style={{ margin: 0 }}>
                {(result.structuredSummary.strongestFactors ?? []).map((factor) => (
                  <li key={factor.criterionKey} style={{ fontSize: "12px" }}>
                    <strong>
                      {factor.label} — {factor.score}/100, contributing{" "}
                      {factor.weightedContribution.toFixed(2)}
                    </strong>
                    <div style={{ color: "var(--gov-text-muted)" }}>{factor.basis}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="gov-form-section__title">Weakest factors</h3>
              <ul className="gov-plain-list" style={{ margin: 0 }}>
                {(result.structuredSummary.weakestFactors ?? []).map((factor) => (
                  <li key={factor.criterionKey} style={{ fontSize: "12px" }}>
                    <strong>
                      {factor.label} — {factor.score}/100, forgoing{" "}
                      {factor.forgoneContribution.toFixed(2)}
                    </strong>
                    <div style={{ color: "var(--gov-text-muted)" }}>{factor.basis}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Structured comparison against the procurement                     */}
      {/* ---------------------------------------------------------------- */}

      {!loading && result !== null && (
        <GovernmentCard
          title="What this response states"
          subtitle="The structured figures the evaluation compared against the procurement"
        >
          <dl className="gov-desc-list">
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Quoted value</dt>
              <dd className="gov-desc-val gov-desc-val--mono">
                {formatInr(result.structuredSummary.quotedValueInr ?? null)}
              </dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Price validity</dt>
              <dd className="gov-desc-val">
                {result.structuredSummary.priceValidityDays === null ||
                result.structuredSummary.priceValidityDays === undefined
                  ? "Not stated"
                  : `${result.structuredSummary.priceValidityDays} days`}
              </dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Taxes included</dt>
              <dd className="gov-desc-val">
                {result.structuredSummary.taxesIncluded === null ||
                result.structuredSummary.taxesIncluded === undefined
                  ? "Not stated"
                  : result.structuredSummary.taxesIncluded
                    ? "Yes"
                    : "No"}
              </dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Delivery duration</dt>
              <dd className="gov-desc-val">
                {result.structuredSummary.estimatedDurationWeeks === null ||
                result.structuredSummary.estimatedDurationWeeks === undefined
                  ? "Not stated"
                  : `${result.structuredSummary.estimatedDurationWeeks} weeks`}
              </dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Committed team</dt>
              <dd className="gov-desc-val">
                {result.structuredSummary.committedTeamSize ?? "Not stated"}
                {result.structuredSummary.profileTeamSize !== null &&
                  result.structuredSummary.profileTeamSize !== undefined && (
                    <span style={{ color: "var(--gov-text-muted)" }}>
                      {" "}
                      (organisation size {result.structuredSummary.profileTeamSize})
                    </span>
                  )}
              </dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Mandatory certifications evidenced</dt>
              <dd className="gov-desc-val">
                {result.structuredSummary.certificationsEvidenced ?? 0} of{" "}
                {result.structuredSummary.certificationsRequired ?? 0}
              </dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Compliance confirmed by the supplier</dt>
              <dd className="gov-desc-val">
                {result.structuredSummary.complianceConfirmed === true ? "Yes" : "No"}
              </dd>
            </div>
            <div className="gov-desc-item">
              <dt className="gov-desc-term">Public-sector delivery declared</dt>
              <dd className="gov-desc-val">
                {result.structuredSummary.governmentExperience ?? "Not declared"}
              </dd>
            </div>
          </dl>
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Missing information                                               */}
      {/* ---------------------------------------------------------------- */}

      {!loading && result !== null && result.missingInformation.length > 0 && (
        <GovernmentCard
          title={`Information missing from this response (${result.missingInformation.length})`}
          subtitle="Nothing on this list has been treated as satisfied"
        >
          <ul className="gov-plain-list" style={{ margin: 0 }}>
            {result.missingInformation.map((item) => (
              <li key={item.message} style={{ fontSize: "13px" }}>
                <strong>{item.source}:</strong> {item.message}
              </li>
            ))}
          </ul>
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Requirement-by-requirement                                        */}
      {/* ---------------------------------------------------------------- */}

      {!loading && result !== null && result.compliance.length > 0 && (
        <GovernmentCard
          title={`Requirement-by-requirement comparison (${result.compliance.length})`}
          subtitle="What the supplier said, what it amounts to, and where each line was read from"
        >
          <div className="gov-table-container">
            <table className="gov-table">
              <caption className="gov-table-caption">
                Requirement, the supplier's response and evidence, compliance status, source and
                notes
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "240px" }}>
                    Requirement
                  </th>
                  <th scope="col">Supplier's response and evidence</th>
                  <th scope="col" style={{ width: "170px" }}>
                    Compliance
                  </th>
                  <th scope="col" style={{ width: "200px" }}>
                    Source
                  </th>
                  <th scope="col" style={{ width: "220px" }}>
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.compliance.map((finding) => {
                  const badge = COMPLIANCE_BADGE[finding.status];
                  const requirement = requirementById.get(finding.requirementId);

                  return (
                    <tr key={finding.requirementId}>
                      <td style={{ fontSize: "12px" }}>
                        <span className="gov-tag gov-tag--meta">
                          {finding.requirementCategory}
                        </span>{" "}
                        {requirement?.text ?? finding.requirementText}
                      </td>
                      <td style={{ fontSize: "12px" }}>
                        {finding.statedPosition !== null && (
                          <div style={{ color: "var(--gov-text-muted)", marginBottom: "4px" }}>
                            Stated position: {finding.statedPosition.replace(/_/g, " ").toLowerCase()}
                          </div>
                        )}
                        {finding.vendorStatement ?? (
                          <em style={{ color: "var(--gov-text-muted)" }}>No statement given</em>
                        )}
                        {finding.vendorNotes !== null && (
                          <div style={{ color: "var(--gov-text-muted)", marginTop: "4px" }}>
                            Note: {finding.vendorNotes}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td style={{ fontSize: "11px", color: "var(--gov-text-muted)" }}>
                        {finding.evidenceSource}
                      </td>
                      <td style={{ fontSize: "11px" }}>{finding.note ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Calculated strengths and gaps                                     */}
      {/* ---------------------------------------------------------------- */}

      {!loading && result !== null && (result.strengths.length > 0 || result.gaps.length > 0) && (
        <GovernmentCard
          title="Strengths and gaps (calculated)"
          subtitle="Derived from the criterion scores and the requirement comparison, not written by a model"
        >
          <div className="gov-insight-columns">
            <div>
              <h3 className="gov-form-section__title">Strengths</h3>
              <ul className="gov-plain-list" style={{ margin: 0 }}>
                {result.strengths.map((strength) => (
                  <li key={strength} style={{ fontSize: "12px" }}>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="gov-form-section__title">Gaps</h3>
              <ul className="gov-plain-list" style={{ margin: 0 }}>
                {result.gaps.map((gap) => (
                  <li key={gap} style={{ fontSize: "12px" }}>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </GovernmentCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* AI advisory analysis                                              */}
      {/* ---------------------------------------------------------------- */}

      {!loading && view !== undefined && (
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <RobotIcon size={20} />
              <span>AI analysis — advisory only</span>
            </div>
          }
          subtitle="A written reading of this response, generated on request and not part of any score"
          action={
            <button
              type="button"
              className="gov-btn gov-btn--secondary"
              disabled={busy}
              onClick={() => void generate()}
            >
              {latestAnalysis === null ? "Generate analysis" : "Regenerate analysis"}
            </button>
          }
        >
          <GovernmentAlert type="warning" title="What this is, and what it is not">
            This reading is produced by a language model from the text of this response. It is
            advisory. It does not determine eligibility, does not produce or change any score, does
            not rank this supplier against any other, and does not recommend a decision. Check every
            statement against the quoted evidence and the response itself before relying on it.
          </GovernmentAlert>

          {latestAnalysis === null ? (
            <p style={{ margin: 0 }}>
              No analysis has been generated for this response. Generating one records it against
              your account with the model and prompt version that produced it, and leaves every
              score exactly as it is.
            </p>
          ) : (
            <>
              <p className="gov-fine-print">
                Generated by {latestAnalysis.generatedByName} on{" "}
                {formatMoment(latestAnalysis.createdAt)} using {latestAnalysis.provider} /{" "}
                {latestAnalysis.model} ({latestAnalysis.promptVersion}).
              </p>

              <h3 className="gov-form-section__title">Summary</h3>
              <p>{latestAnalysis.summary}</p>

              {latestAnalysis.technicalFit !== null && (
                <>
                  <h3 className="gov-form-section__title">Technical fit</h3>
                  <p>{latestAnalysis.technicalFit}</p>
                </>
              )}

              {latestAnalysis.experienceRelevance !== null && (
                <>
                  <h3 className="gov-form-section__title">Relevance of the experience described</h3>
                  <p>{latestAnalysis.experienceRelevance}</p>
                </>
              )}

              <div className="gov-insight-columns">
                <div>
                  <h3 className="gov-form-section__title">Strengths identified</h3>
                  <ul className="gov-insight-list">
                    {latestAnalysis.strengths.map((insight) => (
                      <li key={insight.title}>
                        <strong>{insight.title}</strong>
                        <p>{insight.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="gov-form-section__title">Weaknesses and gaps identified</h3>
                  <ul className="gov-insight-list">
                    {latestAnalysis.weaknesses.map((insight) => (
                      <li key={insight.title}>
                        <strong>{insight.title}</strong>
                        <p>{insight.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {latestAnalysis.attentionPoints.length > 0 && (
                <>
                  <h3 className="gov-form-section__title">Requires your attention</h3>
                  <ul className="gov-insight-list">
                    {latestAnalysis.attentionPoints.map((insight) => (
                      <li key={insight.title}>
                        <strong>{insight.title}</strong>
                        <p>{insight.detail}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {latestAnalysis.evidence.length > 0 && (
                <>
                  <h3 className="gov-form-section__title">Evidence quoted from the response</h3>
                  <div className="gov-table-container">
                    <table className="gov-table">
                      <caption className="gov-table-caption">
                        The part of the submission each observation was drawn from
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" style={{ width: "220px" }}>
                            Section
                          </th>
                          <th scope="col">Quoted from the response</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestAnalysis.evidence.map((item, index) => (
                          <tr key={`${item.section}-${index}`}>
                            <td style={{ fontSize: "12px" }}>{item.section}</td>
                            <td style={{ fontSize: "12px" }}>“{item.quote}”</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {earlierAnalyses.length > 0 && (
                <>
                  <button
                    type="button"
                    className="gov-link-button"
                    onClick={() => setShowHistory((current) => !current)}
                  >
                    {showHistory ? "Hide" : "Show"} {earlierAnalyses.length} earlier analysis/analyses
                  </button>

                  {showHistory && (
                    <ul className="gov-plain-list" style={{ marginTop: "12px" }}>
                      {earlierAnalyses.map((analysis) => (
                        <li key={analysis.id} style={{ fontSize: "12px" }}>
                          <strong>
                            {formatMoment(analysis.createdAt)} — {analysis.generatedByName} (
                            {analysis.provider} / {analysis.model})
                          </strong>
                          <div style={{ color: "var(--gov-text-muted)" }}>{analysis.summary}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </GovernmentCard>
      )}
    </>
  );
}
