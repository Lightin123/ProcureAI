import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiRequestError } from "../api/client.js";
import type { VendorProfileBundle } from "../api/vendor.js";
import {
  decideVerification,
  fetchRegistryProfile,
  registryDocumentPath,
  reviewDocument,
} from "../api/vendorRegistry.js";
import { Breadcrumb } from "../components/Breadcrumb.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { GovernmentCard } from "../components/GovernmentCard.js";
import { PageHeader } from "../components/PageHeader.js";
import {
  CompletionMeter,
  ProfileStatusBadge,
  VerificationBadge,
} from "../components/vendor/VendorStatusBadges.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; bundle: VendorProfileBundle }
  | { kind: "failed"; message: string };

function formatDate(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleString("en-IN");
}

export function AdminSupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (id === undefined) return;
      try {
        setState({ kind: "ready", bundle: await fetchRegistryProfile(id, signal) });
      } catch (error) {
        if (signal?.aborted === true) return;
        setState({
          kind: "failed",
          message:
            error instanceof ApiRequestError
              ? error.message
              : "The supplier record could not be loaded.",
        });
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  async function decide(verificationState: "PENDING" | "VERIFIED" | "REJECTED") {
    if (id === undefined) return;
    setBusy(true);
    setActionError(undefined);

    try {
      const updated = await decideVerification(id, {
        verificationState,
        notes: notes.trim() === "" ? null : notes.trim(),
      });
      setState({ kind: "ready", bundle: updated });
      setNotes("");
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.details.length > 0
            ? `${error.message} ${error.details.map((detail) => detail.message).join(" ")}`
            : error.message
          : "The verification decision could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideDocument(
    documentId: string,
    verificationState: "PENDING" | "VERIFIED" | "REJECTED",
  ) {
    if (id === undefined) return;
    setActionError(undefined);
    try {
      setState({
        kind: "ready",
        bundle: await reviewDocument(id, documentId, { verificationState, notes: null }),
      });
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.message
          : "The document review could not be recorded.",
      );
    }
  }

  if (state.kind === "loading") {
    return (
      <>
        <PageHeader title="Supplier Record" subtitle="Loading…" />
        <GovernmentCard title="Please wait">
          <p>Retrieving the supplier's capability profile.</p>
        </GovernmentCard>
      </>
    );
  }

  if (state.kind === "failed") {
    return (
      <>
        <PageHeader title="Supplier Record" subtitle="Not available." />
        <GovernmentAlert type="error" title="Unable to Load Supplier" role="alert">
          {state.message}
        </GovernmentAlert>
      </>
    );
  }

  const { bundle } = state;
  const profile = bundle.profile;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Supplier Registry", to: "/admin/suppliers" },
          { label: profile.legalName ?? profile.organizationName },
        ]}
      />

      <PageHeader
        title={profile.legalName ?? profile.organizationName}
        subtitle={profile.headline ?? "Registered supplier"}
      />

      {actionError !== undefined && (
        <GovernmentAlert type="error" title="Action Failed" role="alert">
          {actionError}
        </GovernmentAlert>
      )}

      <div className="gov-two-column">
        <div className="gov-two-column__main">
          <GovernmentCard title="Declared Particulars">
            <dl className="gov-desc-list">
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Registered name</dt>
                <dd className="gov-desc-val">{profile.legalName ?? "—"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Entity type</dt>
                <dd className="gov-desc-val">{profile.organizationType ?? "—"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Established</dt>
                <dd className="gov-desc-val">{profile.yearEstablished ?? "—"}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Registration number</dt>
                <dd className="gov-desc-val gov-desc-val--mono">
                  {profile.registrationNumber ?? "—"}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">GSTIN</dt>
                <dd className="gov-desc-val gov-desc-val--mono">
                  {String(profile.identifiers.gstin ?? "—")}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">PAN</dt>
                <dd className="gov-desc-val gov-desc-val--mono">
                  {String(profile.identifiers.pan ?? "—")}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Udyam</dt>
                <dd className="gov-desc-val gov-desc-val--mono">
                  {String(profile.identifiers.udyam ?? "—")}
                </dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Website</dt>
                <dd className="gov-desc-val">{profile.website ?? "—"}</dd>
              </div>
            </dl>
          </GovernmentCard>

          <GovernmentCard
            title="Compliance Documents"
            subtitle="Verify each document against the particulars declared above"
          >
            {bundle.documents.length === 0 ? (
              <p>No documents have been uploaded by this supplier.</p>
            ) : (
              <div className="gov-table-container">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th scope="col">Document</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                      <th scope="col" style={{ width: "260px" }}>
                        Decision
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <strong>{document.title}</strong>
                          <div className="gov-table-mono">
                            {document.fileName} · {Math.round(document.sizeBytes / 1024)} KB
                          </div>
                          {document.referenceNumber !== null && (
                            <div className="gov-entry-card__meta">
                              Reference: {document.referenceNumber}
                            </div>
                          )}
                        </td>
                        <td>{document.documentType.replace(/_/g, " ").toLowerCase()}</td>
                        <td>
                          <VerificationBadge state={document.verificationState} />
                        </td>
                        <td>
                          <a
                            className="gov-btn gov-btn--tertiary gov-btn--sm"
                            href={registryDocumentPath(profile.id, document.id)}
                          >
                            Download
                          </a>
                          <button
                            type="button"
                            className="gov-btn gov-btn--success gov-btn--sm"
                            onClick={() => void decideDocument(document.id, "VERIFIED")}
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            className="gov-btn gov-btn--danger gov-btn--sm"
                            onClick={() => void decideDocument(document.id, "REJECTED")}
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GovernmentCard>

          <GovernmentCard
            title="Capability Record"
            subtitle="The record the platform matches against published requirements"
          >
            <pre className="gov-capability-document">
              {profile.capabilityDocument ?? "Nothing recorded yet."}
            </pre>
          </GovernmentCard>
        </div>

        <aside className="gov-two-column__side">
          <GovernmentCard title="Verification Decision">
            <CompletionMeter percentage={bundle.completion.percentage} />

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
                <dd className="gov-desc-val">{bundle.offerings.length}</dd>
              </div>
              <div className="gov-desc-item">
                <dt className="gov-desc-term">Recorded projects</dt>
                <dd className="gov-desc-val">{bundle.experience.length}</dd>
              </div>
            </dl>

            {profile.status === "DRAFT" && (
              <GovernmentAlert type="info" title="Not Yet Submitted">
                This supplier has not submitted their profile for verification. A decision can
                still be recorded, but the profile may change before they submit.
              </GovernmentAlert>
            )}

            <div className="gov-form-group gov-form-group--wide">
              <label className="gov-form-label" htmlFor="verification-notes">
                Notes to the supplier
              </label>
              <p className="gov-form-hint">
                Required when requesting changes. The supplier sees this text verbatim.
              </p>
              <textarea
                id="verification-notes"
                className="gov-form-control"
                rows={4}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="gov-form-actions gov-form-actions--stacked">
              <button
                type="button"
                className="gov-btn gov-btn--success"
                disabled={busy}
                onClick={() => void decide("VERIFIED")}
              >
                Verify supplier
              </button>
              <button
                type="button"
                className="gov-btn gov-btn--danger"
                disabled={busy || notes.trim() === ""}
                onClick={() => void decide("REJECTED")}
              >
                Request changes
              </button>
              <button
                type="button"
                className="gov-btn gov-btn--tertiary"
                disabled={busy}
                onClick={() => void decide("PENDING")}
              >
                Return to queue
              </button>
            </div>

            {profile.verificationNotes !== null && (
              <div className="gov-callout-box">
                <span className="gov-callout-box__label">Last decision note</span>
                <p>{profile.verificationNotes}</p>
              </div>
            )}
          </GovernmentCard>
        </aside>
      </div>
    </>
  );
}
