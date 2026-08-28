import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  fetchOnboardingSchema,
  fetchProfile,
  saveProfileStep,
  submitProfile,
  type OnboardingField,
  type OnboardingSchema,
  type OnboardingStep,
  type VendorProfileBundle,
} from "../api/vendor.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { CheckCircleIcon } from "../components/GovernmentIcons.js";
import { PageHeader } from "../components/PageHeader.js";
import {
  CredentialsEditor,
  DocumentsEditor,
  ExperienceEditor,
  OfferingsEditor,
} from "../components/vendor/CollectionEditors.js";
import { DynamicField } from "../components/vendor/DynamicField.js";
import { CompletionMeter } from "../components/vendor/VendorStatusBadges.js";
import {
  collectStepValues,
  getByPath,
  missingRequiredOnStep,
  normaliseFieldValue,
  setByPath,
  visibleGroups,
  type FormValues,
} from "../vendor/formState.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; schema: OnboardingSchema; bundle: VendorProfileBundle }
  | { kind: "failed"; message: string };

/** The profile as the form addresses it: the same paths the schema declares. */
function toFormValues(bundle: VendorProfileBundle): FormValues {
  const profile = bundle.profile;
  return {
    legalName: profile.legalName,
    organizationType: profile.organizationType,
    yearEstablished: profile.yearEstablished,
    registrationNumber: profile.registrationNumber,
    website: profile.website,
    identifiers: profile.identifiers,
    eligibility: profile.eligibility,
    registeredAddress: profile.registeredAddress,
    operatingStates: profile.operatingStates,
    primaryContact: profile.primaryContact,
    authorisedRepresentative: profile.authorisedRepresentative,
    industries: profile.industries,
    subDomains: profile.subDomains,
    solutionTypes: profile.solutionTypes,
    otherSolutionType: profile.otherSolutionType,
    headline: profile.headline,
    capabilitySummary: profile.capabilitySummary,
    coreCapabilities: profile.coreCapabilities,
    expertiseAreas: profile.expertiseAreas,
    problemDomains: profile.problemDomains,
    differentiators: profile.differentiators,
    valueProposition: profile.valueProposition,
    sectorsServed: profile.sectorsServed,
    targetCustomers: profile.targetCustomers,
    deliveryModels: profile.deliveryModels,
    serviceCoverage: profile.serviceCoverage,
    coverageNotes: profile.coverageNotes,
    teamSize: profile.teamSize,
    domainExpertise: profile.domainExpertise,
    capacityNotes: profile.capacityNotes,
    deliveryCapability: profile.deliveryCapability,
    scalabilityNotes: profile.scalabilityNotes,
    infrastructureNotes: profile.infrastructureNotes,
    governmentScaleReadiness: profile.governmentScaleReadiness,
    typicalProjectValueInr: profile.typicalProjectValueInr,
    minProjectValueInr: profile.minProjectValueInr,
    maxProjectValueInr: profile.maxProjectValueInr,
    governmentExperience: profile.governmentExperience,
    gemRegistered: profile.gemRegistered,
    pastTenderExperience: profile.pastTenderExperience,
    portfolioUrl: profile.portfolioUrl,
    solutionNovelty: profile.solutionNovelty,
    innovationStage: profile.innovationStage,
    problemBeingSolved: profile.problemBeingSolved,
    innovationDescription: profile.innovationDescription,
    deploymentReadiness: profile.deploymentReadiness,
    measurableImpact: profile.measurableImpact,
    hasIntellectualProperty: profile.hasIntellectualProperty,
    intellectualPropertyDetails: profile.intellectualPropertyDetails,
    dynamicAnswers: profile.dynamicAnswers,
  };
}

function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return "Your answers could not be saved. Check that the portal service is running.";
}

export function VendorOnboardingPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [values, setValues] = useState<FormValues>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showRequired, setShowRequired] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Capability Profile Onboarding · ProcureAI";
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetchOnboardingSchema(controller.signal),
      fetchProfile(controller.signal),
    ])
      .then(([schema, bundle]) => {
        setState({ kind: "ready", schema, bundle });
        setValues(toFormValues(bundle));
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "failed", message: describeError(caught) });
      });

    return () => {
      controller.abort();
    };
  }, []);

  const schema = state.kind === "ready" ? state.schema : undefined;
  const bundle = state.kind === "ready" ? state.bundle : undefined;

  const requestedStep = searchParams.get("step");
  const currentStep: OnboardingStep | undefined = useMemo(() => {
    if (schema === undefined) return undefined;
    return (
      schema.steps.find((step) => step.id === requestedStep) ??
      // Resume where the vendor left off: the first step with unanswered
      // mandatory fields, falling back to the first step.
      schema.steps.find((step) => step.id === bundle?.completion.nextStepId) ??
      schema.steps[0]
    );
  }, [schema, requestedStep, bundle?.completion.nextStepId]);

  const goToStep = useCallback(
    (stepId: string) => {
      setSearchParams({ step: stepId });
      setShowRequired(false);
      setFieldErrors({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setSearchParams],
  );

  const save = useCallback(
    async (step: OnboardingStep, next: FormValues): Promise<VendorProfileBundle | null> => {
      setSaving(true);
      setError(undefined);
      setFieldErrors({});

      try {
        const updated = await saveProfileStep(step.id, collectStepValues(step, next));
        setState((current) =>
          current.kind === "ready" ? { ...current, bundle: updated } : current,
        );
        setValues(toFormValues(updated));
        setDirty(false);
        setSavedAt(new Date());
        // Returned directly rather than left for the caller to read back from
        // `bundle` in outer scope: React state from `setState` above is not
        // visible until the next render, so a caller reading closed-over state
        // right after `await save(...)` would still see the pre-save value.
        return updated;
      } catch (caught) {
        if (caught instanceof ApiRequestError && caught.details.length > 0) {
          const mapped: Record<string, string> = {};
          for (const detail of caught.details) {
            // The API reports `values.<path>`; the form keys on `<path>`.
            mapped[detail.field.replace(/^values\./, "")] = detail.message;
          }
          setFieldErrors(mapped);
        }
        setError(describeError(caught));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /**
   * Every way of leaving the currently displayed step — the sidebar, the
   * review screen's "Edit" links, the Back button — routes through here.
   * `goToStep` alone only changes the URL; it does not persist whatever is
   * on screen, so a direct click from the sidebar while a field was mid-edit
   * silently dropped the edit once the "Save and continue" button (the only
   * path that saved first) was bypassed. Every exit now saves the step being
   * left before the destination changes, matching what "Save and continue"
   * already did.
   */
  async function navigateToStep(stepId: string): Promise<void> {
    if (dirty && currentStep !== undefined && (await save(currentStep, values)) === null) {
      // Save failed — the error is already shown; stay on this step rather
      // than navigate away from unsaved, unsent changes.
      return;
    }
    goToStep(stepId);
  }

  if (state.kind === "loading") {
    return (
      <>
        <PageHeader title="Capability Profile" subtitle="Loading your onboarding progress…" />
        <GovernmentCard title="Please wait">
          <p>Retrieving the onboarding questionnaire and your saved answers.</p>
        </GovernmentCard>
      </>
    );
  }

  if (state.kind === "failed") {
    return (
      <>
        <PageHeader title="Capability Profile" subtitle="Onboarding could not be loaded." />
        <GovernmentAlert type="error" title="Unable to Load Onboarding" role="alert">
          {state.message}
        </GovernmentAlert>
      </>
    );
  }

  if (schema === undefined || bundle === undefined || currentStep === undefined) {
    return null;
  }

  const stepIndex = schema.steps.findIndex((step) => step.id === currentStep.id);
  const groups = visibleGroups(currentStep, values);
  const missing = missingRequiredOnStep(currentStep, values);
  const sectionProgress = bundle.completion.sections.find(
    (section) => section.id === currentStep.id,
  );
  // Collections (offerings, experience) can be required without any form
  // field to represent them, so `missingRequiredOnStep` above never sees them.
  // The server already knows: it's the same list Review & Submit reads.
  const missingCollections = bundle.completion.missingRequired.filter(
    (item) => item.stepId === currentStep.id && item.path.startsWith("collection:"),
  );

  const subDomainSuggestions = schema.taxonomy.industries
    .filter((industry) =>
      (Array.isArray(values.industries) ? (values.industries as string[]) : []).includes(
        industry.value,
      ),
    )
    .flatMap((industry) => industry.subDomains);

  function updateField(field: OnboardingField, raw: unknown) {
    const normalised = normaliseFieldValue(field, raw);
    setValues((current) => setByPath(current, field.path, normalised));
    setDirty(true);
    setFieldErrors((current) => {
      if (!(field.path in current)) return current;
      const next = { ...current };
      delete next[field.path];
      return next;
    });
  }

  async function handleSaveAndContinue() {
    if (currentStep === undefined || schema === undefined || bundle === undefined) return;

    if (missing.length > 0) {
      setShowRequired(true);
      return;
    }

    let latestBundle = bundle;
    if (dirty) {
      const saved = await save(currentStep, values);
      if (saved === null) return;
      latestBundle = saved;
    }

    // Field-level requirements are satisfied, but a step can also require at
    // least one entry in a collection (offerings, experience) that this form
    // has no field for — the server is authoritative for that. Checked against
    // the just-saved bundle rather than the `bundle` in outer scope, which
    // still reflects the render before this save.
    const stepComplete = latestBundle.completion.sections.find(
      (section) => section.id === currentStep.id,
    )?.complete;

    if (stepComplete === false) {
      setShowRequired(true);
      return;
    }

    const next = schema.steps[stepIndex + 1];
    if (next === undefined) {
      goToStep("review");
      return;
    }
    goToStep(next.id);
  }

  async function handleSaveDraft() {
    if (currentStep === undefined) return;
    await save(currentStep, values);
  }

  async function handleSubmitProfile() {
    setSubmitError(undefined);
    if (currentStep !== undefined && dirty && (await save(currentStep, values)) === null) return;

    try {
      const updated = await submitProfile();
      setState((current) => (current.kind === "ready" ? { ...current, bundle: updated } : current));
      await navigate("/vendor");
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setSubmitError(
          caught.details.length > 0
            ? `${caught.message} Outstanding: ${caught.details.map((detail) => detail.message).join("; ")}`
            : caught.message,
        );
      } else {
        setSubmitError("The profile could not be submitted.");
      }
    }
  }

  const isReview = requestedStep === "review";

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Supplier Dashboard", to: "/vendor" },
          { label: "Capability Profile Onboarding" },
        ]}
      />

      <PageHeader
        title="Capability Profile Onboarding"
        subtitle="Answer what applies to your organisation. Your progress is saved as you go, and you can return at any time."
      />

      <div className="gov-onboarding">
        <aside className="gov-onboarding__sidebar">
          <div className="gov-onboarding__progress">
            <CompletionMeter percentage={bundle.completion.percentage} />
            <p className="gov-onboarding__progress-note">
              {bundle.completion.readyToSubmit
                ? "Every mandatory field is answered. You can submit for verification."
                : `${bundle.completion.missingRequired.length} mandatory field(s) outstanding.`}
            </p>
          </div>

          <nav aria-label="Onboarding sections">
            <ol className="gov-stepper">
              {schema.steps.map((step, index) => {
                const progress = bundle.completion.sections.find(
                  (section) => section.id === step.id,
                );
                const active = step.id === currentStep.id && !isReview;

                return (
                  <li key={step.id} className="gov-stepper__item">
                    <button
                      type="button"
                      className={`gov-stepper__button${active ? " gov-stepper__button--active" : ""}${
                        progress?.complete === true ? " gov-stepper__button--complete" : ""
                      }`}
                      onClick={() => void navigateToStep(step.id)}
                      aria-current={active ? "step" : undefined}
                    >
                      <span className="gov-stepper__index" aria-hidden="true">
                        {progress?.complete === true ? <CheckCircleIcon size={14} /> : index + 1}
                      </span>
                      <span className="gov-stepper__body">
                        <span className="gov-stepper__title">{step.shortTitle}</span>
                        <span className="gov-stepper__meta">
                          {progress === undefined ? "—" : `${progress.percentage}% complete`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}

              <li className="gov-stepper__item">
                <button
                  type="button"
                  className={`gov-stepper__button${isReview ? " gov-stepper__button--active" : ""}`}
                  onClick={() => void navigateToStep("review")}
                  aria-current={isReview ? "step" : undefined}
                >
                  <span className="gov-stepper__index" aria-hidden="true">
                    {schema.steps.length + 1}
                  </span>
                  <span className="gov-stepper__body">
                    <span className="gov-stepper__title">Review &amp; Submit</span>
                    <span className="gov-stepper__meta">Final check</span>
                  </span>
                </button>
              </li>
            </ol>
          </nav>
        </aside>

        <div className="gov-onboarding__content">
          {error !== undefined && (
            <GovernmentAlert type="error" title="Could Not Save" role="alert">
              {error}
            </GovernmentAlert>
          )}

          {isReview ? (
            <ReviewStep
              bundle={bundle}
              onGoToStep={(stepId) => void navigateToStep(stepId)}
              onSubmit={() => void handleSubmitProfile()}
              submitError={submitError}
            />
          ) : (
            <>
              <GovernmentCard
                title={currentStep.title}
                subtitle={currentStep.description}
                action={
                  sectionProgress !== undefined && (
                    <span className="gov-tag gov-tag--meta">
                      Step {stepIndex + 1} of {schema.steps.length}
                    </span>
                  )
                }
              >
                {showRequired && (missing.length > 0 || missingCollections.length > 0) && (
                  <GovernmentAlert type="warning" title="Mandatory Fields Outstanding" role="alert">
                    <ul className="gov-plain-list">
                      {missing.map((field) => (
                        <li key={field.path}>{field.label}</li>
                      ))}
                      {missingCollections.map((item) => (
                        <li key={item.path}>{item.label}</li>
                      ))}
                    </ul>
                  </GovernmentAlert>
                )}

                {groups.length === 0 && (currentStep.collections ?? []).length === 0 && (
                  <p>
                    No further questions apply to this step given your answers so far. Continue to
                    the next section.
                  </p>
                )}

                {groups.map((group) => (
                  <section key={group.id} className="gov-form-section">
                    <h3 className="gov-form-section__title">{group.title}</h3>
                    {group.description !== undefined && (
                      <p className="gov-form-section__description">{group.description}</p>
                    )}
                    <div className="gov-form-grid">
                      {group.fields.map((field) => (
                        <DynamicField
                          key={field.path}
                          field={field}
                          value={getByPath(values, field.path)}
                          error={fieldErrors[field.path]}
                          states={schema.taxonomy.states}
                          subDomainSuggestions={subDomainSuggestions}
                          onChange={(next) => updateField(field, next)}
                        />
                      ))}
                    </div>
                  </section>
                ))}

                <div className="gov-form-actions gov-form-actions--split">
                  <div className="gov-form-actions__status">
                    {saving && <span>Saving…</span>}
                    {!saving && dirty && <span>Unsaved changes on this step.</span>}
                    {!saving && !dirty && savedAt !== undefined && (
                      <span>Saved at {savedAt.toLocaleTimeString("en-IN")}.</span>
                    )}
                  </div>
                  <div className="gov-form-actions__buttons">
                    {stepIndex > 0 && (
                      <button
                        type="button"
                        className="gov-btn gov-btn--tertiary"
                        onClick={() => {
                          const previous = schema.steps[stepIndex - 1];
                          if (previous !== undefined) void navigateToStep(previous.id);
                        }}
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="button"
                      className="gov-btn gov-btn--secondary"
                      disabled={saving || !dirty}
                      onClick={() => void handleSaveDraft()}
                    >
                      Save and continue later
                    </button>
                    <button
                      type="button"
                      className="gov-btn gov-btn--primary"
                      disabled={saving}
                      onClick={() => void handleSaveAndContinue()}
                    >
                      Save and continue
                    </button>
                  </div>
                </div>
              </GovernmentCard>

              {(currentStep.collections ?? []).includes("offerings") && (
                <GovernmentCard title="Products and Services">
                  <OfferingsEditor
                    bundle={bundle}
                    schema={schema}
                    onChange={(updated) => {
                      setState((current) =>
                        current.kind === "ready" ? { ...current, bundle: updated } : current,
                      );
                      if (!dirty) setValues(toFormValues(updated));
                    }}
                  />
                </GovernmentCard>
              )}

              {(currentStep.collections ?? []).includes("experience") && (
                <>
                  <GovernmentCard title="Previous Projects">
                    <ExperienceEditor
                      bundle={bundle}
                      schema={schema}
                      onChange={(updated) => {
                        setState((current) =>
                          current.kind === "ready" ? { ...current, bundle: updated } : current,
                        );
                        if (!dirty) setValues(toFormValues(updated));
                      }}
                    />
                  </GovernmentCard>
                  <GovernmentCard title="Certifications and Recognition">
                    <CredentialsEditor
                      bundle={bundle}
                      schema={schema}
                      onChange={(updated) => {
                        setState((current) =>
                          current.kind === "ready" ? { ...current, bundle: updated } : current,
                        );
                        if (!dirty) setValues(toFormValues(updated));
                      }}
                    />
                  </GovernmentCard>
                </>
              )}

              {(currentStep.collections ?? []).includes("documents") && (
                <GovernmentCard title="Compliance Documents">
                  <DocumentsEditor
                    bundle={bundle}
                    schema={schema}
                    onChange={(updated) => {
                      setState((current) =>
                        current.kind === "ready" ? { ...current, bundle: updated } : current,
                      );
                      if (!dirty) setValues(toFormValues(updated));
                    }}
                  />
                </GovernmentCard>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ReviewStep({
  bundle,
  onGoToStep,
  onSubmit,
  submitError,
}: {
  bundle: VendorProfileBundle;
  onGoToStep: (stepId: string) => void;
  onSubmit: () => void;
  submitError: string | undefined;
}) {
  const alreadySubmitted = bundle.profile.status !== "DRAFT";

  return (
    <>
      <GovernmentCard
        title="Review and Submit"
        subtitle="Check each section, then submit your profile for verification by the portal administration."
      >
        {submitError !== undefined && (
          <GovernmentAlert type="error" title="Submission Refused" role="alert">
            {submitError}
          </GovernmentAlert>
        )}

        {alreadySubmitted && (
          <GovernmentAlert type="info" title="Already Submitted">
            Your profile has been submitted. You may continue to edit it; verification applies to
            the version held at the time of the decision.
          </GovernmentAlert>
        )}

        <div className="gov-table-container">
          <table className="gov-table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Mandatory answered</th>
                <th scope="col">Optional answered</th>
                <th scope="col">Completion</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {bundle.completion.sections.map((section) => (
                <tr key={section.id}>
                  <td>
                    <strong>{section.title}</strong>
                  </td>
                  <td>
                    {section.requiredAnswered} / {section.requiredTotal}
                  </td>
                  <td>
                    {section.optionalAnswered} / {section.optionalTotal}
                  </td>
                  <td>
                    <span
                      className={
                        section.complete
                          ? "gov-badge gov-badge--operational"
                          : "gov-badge gov-badge--pending"
                      }
                    >
                      {section.percentage}%
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="gov-btn gov-btn--tertiary gov-btn--sm"
                      onClick={() => onGoToStep(section.id)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {bundle.completion.missingRequired.length > 0 && (
          <GovernmentAlert type="warning" title="Outstanding Mandatory Fields">
            <ul className="gov-plain-list">
              {bundle.completion.missingRequired.map((missing) => (
                <li key={`${missing.stepId}-${missing.path}`}>
                  {missing.label}{" "}
                  <button
                    type="button"
                    className="gov-link-button"
                    onClick={() => onGoToStep(missing.stepId)}
                  >
                    Go to section
                  </button>
                </li>
              ))}
            </ul>
          </GovernmentAlert>
        )}

        <div className="gov-form-actions">
          <button
            type="button"
            className="gov-btn gov-btn--primary gov-btn--lg"
            disabled={!bundle.completion.readyToSubmit}
            onClick={onSubmit}
          >
            {alreadySubmitted ? "Resubmit for verification" : "Submit for verification"}
          </button>
        </div>
      </GovernmentCard>

      <GovernmentCard
        title="How your profile is used"
        subtitle="What the platform does with the information you have provided"
      >
        <p>
          The platform builds a structured capability record and a plain-language capability
          statement from your answers. Published procurement requirements are matched against
          both, and the reasoning behind every match is shown to you and available to the
          department reviewing it.
        </p>
        <p>
          Matching narrows a list for a government official to consider. It does not decide
          eligibility, rank you against other suppliers, or award anything — an official does
          that, and every decision is recorded against them.
        </p>
      </GovernmentCard>
    </>
  );
}
