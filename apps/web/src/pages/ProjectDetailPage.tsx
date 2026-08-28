import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getProject, type ProcurementProject } from "../api/projects.js";
import { useHasPermission } from "../auth/AuthContext.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import {
  FileTextIcon,
  BuildingIcon,
  UserIcon,
  CalendarIcon,
  RobotIcon,
  ChevronRightIcon,
} from "../components/GovernmentIcons.js";
import { OpportunityPublicationPanel } from "../components/OpportunityPublicationPanel.js";
import { PageHeader } from "../components/PageHeader.js";
import { ProjectSectionNav } from "../components/ProjectSectionNav.js";
import { ProjectStatusBadge } from "../components/ProjectStatusBadge.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; project: ProcurementProject }
  | { kind: "failed"; message: string };

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const hasPermission = useHasPermission();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(
    async (projectId: string, signal?: AbortSignal) => {
      setState({ kind: "loading" });
      try {
        const project = await getProject(projectId, signal);
        setState({ kind: "loaded", project });
      } catch (error) {
        if (signal?.aborted === true) return;
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : "The project could not be loaded.",
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (id === undefined) return;
    const controller = new AbortController();
    void load(id, controller.signal);
    return () => {
      controller.abort();
    };
  }, [id, load]);

  const title = state.kind === "loaded" ? state.project.title : "Procurement Project Record";

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Procurement Projects", to: "/projects" },
          { label: state.kind === "loaded" ? state.project.referenceNumber : "Project Particulars" },
        ]}
      />

      <PageHeader
        title={title}
        subtitle="Official Public Procurement Dossier · Ministry of Commerce & Industry"
        action={
          state.kind === "loaded" ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <ProjectStatusBadge status={state.project.status} />
              <Link
                to={`/projects/${state.project.id}/requirements`}
                className="gov-btn gov-btn--primary"
              >
                <RobotIcon size={16} />
                Open AI Requirements
              </Link>
            </div>
          ) : undefined
        }
      />

      {id !== undefined && <ProjectSectionNav projectId={id} />}

      {state.kind === "loading" && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--gov-text-secondary)" }}>
          Loading official project record from procurement database…
        </div>
      )}

      {state.kind === "failed" && (
        <GovernmentAlert type="error" title="Project record unavailable">
          {state.message}
        </GovernmentAlert>
      )}

      {state.kind === "loaded" && (
        <>
          {/* Official Project Information Card */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <BuildingIcon size={20} />
                <span>Administrative Particulars & Department Details</span>
              </div>
            }
          >
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Official Reference Number</dt>
                <dd className="gov-desc-val gov-desc-val--mono">
                  {state.project.referenceNumber}
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Current Workflow Stage</dt>
                <dd className="gov-desc-val">
                  <ProjectStatusBadge status={state.project.status} />
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Nodal Department / Ministry</dt>
                <dd className="gov-desc-val">
                  {state.project.organizationName ?? "Department of Commerce / Public Procurement"}
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Procuring Official</dt>
                <dd className="gov-desc-val">
                  {state.project.createdByName ?? "Registered Government Officer"}
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Record Created On</dt>
                <dd className="gov-desc-val">
                  {formatDateTime(state.project.createdAt)}
                </dd>
              </div>

              <div className="gov-desc-item">
                <dt className="gov-desc-term">Supplier Visibility</dt>
                <dd className="gov-desc-val">
                  {state.project.publishedAt === null
                    ? "Not published to suppliers"
                    : `Published · ${state.project.interestCount} supplier(s) interested`}
                </dd>
              </div>
            </dl>
          </GovernmentCard>

          {/* Problem Statement & Description */}
          <GovernmentCard
            title={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FileTextIcon size={20} />
                <span>Problem Statement & Requirement Scope</span>
              </div>
            }
          >
            <div
              style={{
                fontSize: "15px",
                lineHeight: "1.7",
                color: "var(--gov-text-primary)",
                backgroundColor: "var(--gov-bg-alt)",
                padding: "18px 20px",
                borderRadius: "var(--gov-radius)",
                border: "1px solid var(--gov-border-light)",
                whiteSpace: "pre-wrap",
              }}
            >
              {state.project.problemDescription}
            </div>
          </GovernmentCard>

          <OpportunityPublicationPanel
            project={state.project}
            onChange={(project) => setState({ kind: "loaded", project })}
          />

          {/* Next Steps Callout — an action prompt, so only for users who may act */}
          {hasPermission("requirements:analyze") && (
          <GovernmentAlert
            type="info"
            title="Next Step: AI Requirement Extraction & Structured Review"
          >
            <p style={{ margin: "0 0 10px" }}>
              To structure this problem into formal functional, technical, timeline, and compliance
              specifications, navigate to the <strong>Requirements & AI Analysis</strong> section.
            </p>
            <Link
              to={`/projects/${state.project.id}/requirements`}
              className="gov-btn gov-btn--primary gov-btn--sm"
              style={{ display: "inline-flex" }}
            >
              Proceed to Requirements Analysis
              <ChevronRightIcon size={14} />
            </Link>
          </GovernmentAlert>
          )}
        </>
      )}
    </>
  );
}
