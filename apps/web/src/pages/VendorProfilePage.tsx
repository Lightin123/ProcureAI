import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import {
  fetchOnboardingSchema,
  fetchProfile,
  type OnboardingField,
  type OnboardingSchema,
  type VendorProfileBundle,
} from "../api/vendor.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { PageHeader } from "../components/PageHeader.js";
import { documentDownloadPath } from "../api/vendor.js";
import {
  CompletionMeter,
  ProfileStatusBadge,
  VerificationBadge,
} from "../components/vendor/VendorStatusBadges.js";
import { getByPath, isAnswered, visibleGroups, type FormValues } from "../vendor/formState.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; schema: OnboardingSchema; bundle: VendorProfileBundle }
  | { kind: "failed"; message: string };

function toFormValues(bundle: VendorProfileBundle): FormValues {
  return bundle.profile as unknown as FormValues;
}

function labelOf(options: readonly { value: string; label: string }[] | undefined, value: string) {
  return options?.find((option) => option.value === value)?.label ?? value;
}

/** Renders a stored answer the way the question asked for it. */
function renderValue(field: OnboardingField, value: unknown): React.ReactNode {
  if (Array.isArray(value)) {
    return (
      <ul className="gov-chip-list">
        {value.map((entry) => (
          <li key={String(entry)} className="gov-chip">
            {labelOf(field.options, String(entry))}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (field.type === "currency" && typeof value === "number") {
    if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} crore`;
    if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} lakh`;
    return `₹${value.toLocaleString("en-IN")}`;
  }

  if (field.type === "select" || field.type === "multiselect") {
    return labelOf(field.options, String(value));
  }

  if (field.type === "url" && typeof value === "string") {
    return (
      <a href={value} target="_blank" rel="noreferrer noopener">
        {value}
      </a>
    );
  }

  return String(value);
}

export function VendorProfilePage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [showDocument, setShowDocument] = useState(false);

  useEffect(() => {
    document.title = "Capability Profile · ProcureAI";
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([fetchOnboardingSchema(controller.signal), fetchProfile(controller.signal)])
      .then(([schema, bundle]) => setState({ kind: "ready", schema, bundle }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "failed",
          message:
            error instanceof ApiRequestError
              ? error.message
              : "Your capability profile could not be loaded.",
        });
      });

    return () => {
      controller.abort();
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <>
        <PageHeader title="Capability Profile" subtitle="Loading…" />
        <GovernmentCard title="Please wait">
          <p>Retrieving your recorded capability profile.</p>
        </GovernmentCard>
      </>
    );
  }

  if (state.kind === "failed") {
    return (
      <>
        <PageHeader title="Capability Profile" subtitle="Not available." />
        <GovernmentAlert type="error" title="Unable to Load Profile" role="alert">
          {state.message}
        </GovernmentAlert>
      </>
    );
  }

  const { schema, bundle } = state;
  const values = toFormValues(bundle);
  const profile = bundle.profile;

  return (
    <>
      <Breadcrumb
        items={[{ label: "Supplier Dashboard", to: "/vendor" }, { label: "Capability Profile" }]}
      />

      <PageHeader
        title={profile.legalName ?? profile.organizationName}
        subtitle={profile.headline ?? "Registered supplier capability profile"}
        action={
          <Link className="gov-btn gov-btn--primary" to="/vendor/onboarding">
            Edit profile
          </Link>
        }
      />

      {profile.verificationNotes !== null && profile.verificationState === "REJECTED" && (
        <GovernmentAlert type="warning" title="Changes Requested" role="alert">
          {profile.verificationNotes}
        </GovernmentAlert>
      )}

      <div className="gov-two-column">
        <div className="gov-two-column__main">
          {schema.steps.map((step) => {
            const groups = visibleGroups(step, values).map((group) => ({
              ...group,
              fields: group.fields.filter((field) =>
                isAnswered(getByPath(values, field.path)),
              ),
            }));
            const answeredGroups = groups.filter((group) => group.fields.length > 0);

            const hasCollections = (step.collections ?? []).length > 0;
            if (answeredGroups.length === 0 && !hasCollections) return null;

            return (
              <GovernmentCard
                key={step.id}
                title={step.title}
                action={
                  <Link
                    className="gov-btn gov-btn--tertiary gov-btn--sm"
                    to={`/vendor/onboarding?step=${step.id}`}
                  >
                    Edit
                  </Link>
                }
              >
                {answeredGroups.length === 0 && (
                  <p className="gov-collection__empty">Nothing recorded in this section yet.</p>
                )}

                {answeredGroups.map((group) => (
                  <section key={group.id} className="gov-profile-section">
                    <h3 className="gov-section-title">{group.title}</h3>
                    <dl className="gov-desc-list">
                      {group.fields.map((field) => (
                        <div key={field.path} className="gov-desc-item">
                          <dt className="gov-desc-term">{field.label}</dt>
                          <dd className="gov-desc-val">
                            {renderValue(field, getByPath(values, field.path))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}

                {(step.collections ?? []).includes("offerings") && (
                  <section className="gov-profile-section">
                    <h3 className="gov-section-title">Products and Services</h3>
                    {bundle.offerings.length === 0 ? (
                      <p className="gov-collection__empty">None recorded.</p>
                    ) : (
                      <ul className="gov-plain-list">
                        {bundle.offerings.map((offering) => (
                          <li key={offering.id}>
                            <strong>{offering.name}</strong>{" "}
                            <span className="gov-tag gov-tag--meta">
                              {labelOf(schema.taxonomy.offeringKinds, offering.kind)}
                            </span>
                            {offering.description !== null && <p>{offering.description}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {(step.collections ?? []).includes("experience") && (
                  <>
                    <section className="gov-profile-section">
                      <h3 className="gov-section-title">Previous Projects</h3>
                      {bundle.experience.length === 0 ? (
                        <p className="gov-collection__empty">None recorded.</p>
                      ) : (
                        <ul className="gov-plain-list">
                          {bundle.experience.map((entry) => (
                            <li key={entry.id}>
                              <strong>{entry.title}</strong>
                              <span className="gov-entry-card__meta">
                                {entry.clientName ?? "Client not named"}
                                {entry.startYear !== null && ` · ${entry.startYear}`}
                              </span>
                              {entry.outcome !== null && <p>Outcome: {entry.outcome}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <section className="gov-profile-section">
                      <h3 className="gov-section-title">Certifications and Recognition</h3>
                      {bundle.credentials.length === 0 ? (
                        <p className="gov-collection__empty">None recorded.</p>
                      ) : (
                        <ul className="gov-plain-list">
                          {bundle.credentials.map((credential) => (
                            <li key={credential.id}>
                              <strong>{credential.name}</strong>
                              {credential.issuingAuthority !== null &&
                                ` — ${credential.issuingAuthority}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                )}

                {(step.collections ?? []).includes("documents") && (
                  <section className="gov-profile-section">
                    <h3 className="gov-section-title">Compliance Documents</h3>
                    {bundle.documents.length === 0 ? (
                      <p className="gov-collection__empty">None uploaded.</p>
                    ) : (
                      <div className="gov-table-container">
                        <table className="gov-table">
                          <thead>
                            <tr>
                              <th scope="col">Document</th>
                              <th scope="col">Status</th>
                              <th scope="col"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {bundle.documents.map((document) => (
                              <tr key={document.id}>
                                <td>
                                  <strong>{document.title}</strong>
                                  <div className="gov-table-mono">
                                    {labelOf(schema.taxonomy.documentTypes, document.documentType)}
                                  </div>
                                </td>
                                <td>
                                  <VerificationBadge state={document.verificationState} />
                                </td>
                                <td>
                                  <a
                                    className="gov-btn gov-btn--tertiary gov-btn--sm"
                                    href={documentDownloadPath(document.id)}
                                  >
                                    Download
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}
              </GovernmentCard>
            );
          })}

          <GovernmentCard
            title="Capability Statement Used for Matching"
            subtitle="The record the platform builds from your answers and matches against published requirements"
            action={
              <button
                type="button"
                className="gov-btn gov-btn--tertiary gov-btn--sm"
                onClick={() => setShowDocument(!showDocument)}
              >
                {showDocument ? "Hide" : "Show"}
              </button>
            }
          >
            <p>
              Both your own descriptions and your structured selections are kept. Descriptions
              carry the meaning that keyword lists cannot; the structured values are what
              deterministic filters use. Nothing here is shown to a department except through an
              opportunity you have registered interest in.
            </p>
            {showDocument && (
              <pre className="gov-capability-document">
                {profile.capabilityDocument ?? "Nothing recorded yet."}
              </pre>
            )}
          </GovernmentCard>
        </div>

        <aside className="gov-two-column__side">
          <GovernmentCard title="Profile Status">
            <CompletionMeter percentage={bundle.completion.percentage} />
            <dl className="gov-desc-list gov-desc-list--stacked">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">State</dt>
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
                <dt className="gov-desc-term">Supplier code</dt>
                <dd className="gov-desc-val gov-desc-val--mono">{profile.organizationCode}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Last updated</dt>
                <dd className="gov-desc-val">
                  {new Date(profile.updatedAt).toLocaleString("en-IN")}
                </dd>
              </div>
            </dl>
          </GovernmentCard>

          <GovernmentCard title="Section Completion">
            <ul className="gov-plain-list">
              {bundle.completion.sections.map((section) => (
                <li key={section.id} className="gov-section-progress">
                  <Link to={`/vendor/onboarding?step=${section.id}`}>{section.title}</Link>
                  <span
                    className={
                      section.complete
                        ? "gov-badge gov-badge--operational"
                        : "gov-badge gov-badge--pending"
                    }
                  >
                    {section.percentage}%
                  </span>
                </li>
              ))}
            </ul>
          </GovernmentCard>
        </aside>
      </div>
    </>
  );
}
