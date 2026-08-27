import React, { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import { createProject } from "../api/projects.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { BuildingIcon, PlusIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";

export function ProjectCreatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(undefined);

    try {
      const project = await createProject({ title, problemDescription });
      await navigate(`/projects/${project.id}`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.details.length > 0) {
          const mapped: Record<string, string> = {};
          for (const detail of error.details) {
            mapped[detail.field] = detail.message;
          }
          setFieldErrors(mapped);
          setFormError("The submitted details contain validation errors. Please review the highlighted fields below.");
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError("The procurement project could not be created.");
      }
      setSubmitting(false);
    }
  }

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Procurement Projects", to: "/projects" },
          { label: "Initiate New Project" },
        ]}
      />

      <PageHeader
        title="Initiate Procurement Project"
        subtitle="Record a new procurement requirement dossier for AI-assisted requirement analysis and vendor discovery."
      />

      {formError !== undefined && (
        <GovernmentAlert type="error" title="Submission Error">
          {formError}
        </GovernmentAlert>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <GovernmentCard
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <BuildingIcon size={20} />
              <span>Procurement Dossier Particulars</span>
            </div>
          }
          subtitle="All fields marked with an asterisk (*) are mandatory for registration"
        >
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="project-title">
              Official Project Title <span className="gov-form-required">*</span>
            </label>
            <p className="gov-form-hint" id="project-title-hint">
              Provide a concise, formal nomenclature (e.g., “AI-Based Traffic Congestion Management System for Urban Municipalities”).
            </p>
            <input
              id="project-title"
              className={`gov-form-control${fieldErrors.title !== undefined ? " gov-form-control--error" : ""}`}
              type="text"
              value={title}
              maxLength={200}
              placeholder="Enter official project title..."
              aria-describedby="project-title-hint"
              aria-invalid={fieldErrors.title !== undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              {fieldErrors.title !== undefined ? (
                <span className="gov-form-error">{fieldErrors.title}</span>
              ) : <span />}
              <span style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                {title.length} / 200 characters
              </span>
            </div>
          </div>

          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="project-problem">
              Comprehensive Problem Statement & Context <span className="gov-form-required">*</span>
            </label>
            <p className="gov-form-hint" id="project-problem-hint">
              Articulate the administrative challenge, operational bottlenecks, technology constraints, budget expectations, timeline requirements, and any regulatory or security mandates.
            </p>
            <textarea
              id="project-problem"
              className={`gov-form-control${fieldErrors.problemDescription !== undefined ? " gov-form-control--error" : ""}`}
              value={problemDescription}
              rows={9}
              maxLength={10000}
              placeholder="Describe the operational challenge in detail..."
              aria-describedby="project-problem-hint"
              aria-invalid={fieldErrors.problemDescription !== undefined}
              onChange={(event) => setProblemDescription(event.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              {fieldErrors.problemDescription !== undefined ? (
                <span className="gov-form-error">{fieldErrors.problemDescription}</span>
              ) : <span />}
              <span style={{ fontSize: "12px", color: "var(--gov-text-muted)" }}>
                {problemDescription.length} / 10,000 characters
              </span>
            </div>
          </div>

          <div className="gov-form-actions">
            <button
              type="button"
              className="gov-btn gov-btn--tertiary"
              onClick={() => void navigate("/projects")}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="gov-btn gov-btn--primary gov-btn--lg"
              disabled={submitting || !title.trim() || !problemDescription.trim()}
            >
              <PlusIcon size={16} />
              {submitting ? "Registering Record…" : "Register Procurement Project"}
            </button>
          </div>
        </GovernmentCard>
      </form>
    </>
  );
}
