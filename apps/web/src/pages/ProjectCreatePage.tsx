import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import { createProject } from "../api/projects.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
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
          setFormError("The submitted details are not valid. Correct the fields marked below.");
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError("The project could not be created.");
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
          { label: "Create Procurement Project" },
        ]}
      />

      <PageHeader title="Create Procurement Project" />

      <p className="page-intro">
        Record a new procurement project. Describe the problem in plain language —
        structured requirements are prepared at a later stage.
      </p>

      {formError !== undefined && (
        <div className="notice notice--error" role="alert">
          <p className="notice__title">Project could not be created</p>
          <p className="notice__body">{formError}</p>
        </div>
      )}

      <form className="panel" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <h2 className="panel__heading">Project Particulars</h2>
        <div className="panel__body">
          <div className="form-field">
            <label className="form-field__label" htmlFor="project-title">
              Project title <span className="form-field__required">* required</span>
            </label>
            <p className="form-field__hint" id="project-title-hint">
              A short official name for this procurement, for example “Smart Traffic
              Monitoring for District Roads”.
            </p>
            <input
              id="project-title"
              className={`form-field__input${fieldErrors.title === undefined ? "" : " form-field__input--error"}`}
              type="text"
              value={title}
              maxLength={200}
              aria-describedby="project-title-hint"
              aria-invalid={fieldErrors.title !== undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
            {fieldErrors.title !== undefined && (
              <p className="form-field__error" role="alert">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="project-problem">
              Problem description <span className="form-field__required">* required</span>
            </label>
            <p className="form-field__hint" id="project-problem-hint">
              Describe the problem, its context, and any known constraints such as
              budget, timeline, or compliance obligations.
            </p>
            <textarea
              id="project-problem"
              className={`form-field__input form-field__textarea${fieldErrors.problemDescription === undefined ? "" : " form-field__input--error"}`}
              value={problemDescription}
              rows={10}
              maxLength={10000}
              aria-describedby="project-problem-hint"
              aria-invalid={fieldErrors.problemDescription !== undefined}
              onChange={(event) => setProblemDescription(event.target.value)}
            />
            {fieldErrors.problemDescription !== undefined && (
              <p className="form-field__error" role="alert">
                {fieldErrors.problemDescription}
              </p>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void navigate("/projects")}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting ? "Saving…" : "Create Project"}
          </button>
        </div>
      </form>
    </>
  );
}
