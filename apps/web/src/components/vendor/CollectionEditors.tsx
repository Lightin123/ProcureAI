import React, { useRef, useState } from "react";

import { ApiRequestError } from "../../api/client.js";
import {
  addCredential,
  addExperience,
  addOffering,
  documentDownloadPath,
  fetchProfile,
  removeCredential,
  removeDocument,
  removeExperience,
  removeOffering,
  uploadDocument,
  type OnboardingSchema,
  type VendorProfileBundle,
} from "../../api/vendor.js";
import { GovernmentAlert } from "../GovernmentAlert.js";
import { TagInput } from "./TagInput.js";
import { VerificationBadge } from "./VendorStatusBadges.js";

export interface CollectionEditorProps {
  bundle: VendorProfileBundle;
  schema: OnboardingSchema;
  onChange: (bundle: VendorProfileBundle) => void;
}

function labelOf(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatInr(value: number | null): string {
  if (value === null) return "—";
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} crore`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} lakh`;
  return `₹${value.toLocaleString("en-IN")}`;
}

function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.details.length > 0
      ? `${error.message} ${error.details.map((detail) => detail.message).join(" ")}`
      : error.message;
  }
  return "The entry could not be saved.";
}

/** Shared shell: heading, error slot, list, and an add form that folds away. */
function CollectionShell({
  title,
  description,
  addLabel,
  error,
  children,
  form,
  open,
  setOpen,
}: {
  title: string;
  description: string;
  addLabel: string;
  error: string | undefined;
  children: React.ReactNode;
  form: React.ReactNode;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <div className="gov-collection">
      <div className="gov-collection__header">
        <div>
          <h3 className="gov-collection__title">{title}</h3>
          <p className="gov-collection__description">{description}</p>
        </div>
        <button
          type="button"
          className="gov-btn gov-btn--secondary gov-btn--sm"
          onClick={() => setOpen(!open)}
        >
          {open ? "Cancel" : addLabel}
        </button>
      </div>

      {error !== undefined && (
        <GovernmentAlert type="error" title="Could Not Save" role="alert">
          {error}
        </GovernmentAlert>
      )}

      {open && <div className="gov-collection__form">{form}</div>}

      <div className="gov-collection__list">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Products, services and capabilities
// ---------------------------------------------------------------------------

export function OfferingsEditor({ bundle, schema, onChange }: CollectionEditorProps) {
  const [open, setOpen] = useState(bundle.offerings.length === 0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState("PRODUCT");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      onChange(
        await addOffering({
          kind,
          name: name.trim(),
          description: description.trim() === "" ? null : description.trim(),
          categories,
          tags,
          sectors,
        }),
      );
      setName("");
      setDescription("");
      setCategories([]);
      setTags([]);
      setSectors([]);
      setOpen(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(undefined);
    try {
      onChange(await removeOffering(id));
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  return (
    <CollectionShell
      title={schema.collections.offerings.title}
      description={schema.collections.offerings.description}
      addLabel="Add product or service"
      error={error}
      open={open}
      setOpen={setOpen}
      form={
        <>
          <div className="gov-form-grid">
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="offering-kind">
                Type
              </label>
              <select
                id="offering-kind"
                className="gov-form-control"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {schema.taxonomy.offeringKinds.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="offering-name">
                Name<span className="gov-form-required">*</span>
              </label>
              <input
                id="offering-name"
                className="gov-form-control"
                type="text"
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </div>

          <div className="gov-form-group gov-form-group--wide">
            <label className="gov-form-label" htmlFor="offering-description">
              Description
            </label>
            <p className="gov-form-hint">
              Describe it as you would to a buyer who has not heard of your organisation.
            </p>
            <textarea
              id="offering-description"
              className="gov-form-control"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="gov-form-group gov-form-group--wide">
            <label className="gov-form-label" htmlFor="offering-categories">
              Categories
            </label>
            <TagInput id="offering-categories" value={categories} onChange={setCategories} />
          </div>

          <div className="gov-form-group gov-form-group--wide">
            <label className="gov-form-label" htmlFor="offering-sectors">
              Sectors it serves
            </label>
            <TagInput id="offering-sectors" value={sectors} onChange={setSectors} />
          </div>

          <div className="gov-form-group gov-form-group--wide">
            <label className="gov-form-label" htmlFor="offering-tags">
              Keywords
            </label>
            <TagInput
              id="offering-tags"
              value={tags}
              onChange={setTags}
              placeholder="Words a buyer might search for"
            />
          </div>

          <div className="gov-form-actions">
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || name.trim().length < 2}
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : "Save entry"}
            </button>
          </div>
        </>
      }
    >
      {bundle.offerings.length === 0 ? (
        <p className="gov-collection__empty">
          Nothing recorded yet. Matching currently sees only your capability statement.
        </p>
      ) : (
        bundle.offerings.map((offering) => (
          <article key={offering.id} className="gov-entry-card">
            <div className="gov-entry-card__head">
              <div>
                <span className="gov-tag gov-tag--meta">
                  {labelOf(schema.taxonomy.offeringKinds, offering.kind)}
                </span>
                <h4 className="gov-entry-card__title">{offering.name}</h4>
              </div>
              <button
                type="button"
                className="gov-btn gov-btn--tertiary gov-btn--sm"
                onClick={() => void remove(offering.id)}
              >
                Remove
              </button>
            </div>
            {offering.description !== null && (
              <p className="gov-entry-card__body">{offering.description}</p>
            )}
            {[...offering.categories, ...offering.sectors, ...offering.tags].length > 0 && (
              <ul className="gov-chip-list">
                {[...offering.categories, ...offering.sectors, ...offering.tags].map((entry) => (
                  <li key={entry} className="gov-chip">
                    {entry}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))
      )}
    </CollectionShell>
  );
}

// ---------------------------------------------------------------------------
// Previous projects
// ---------------------------------------------------------------------------

export function ExperienceEditor({ bundle, schema, onChange }: CollectionEditorProps) {
  const [open, setOpen] = useState(bundle.experience.length === 0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientType, setClientType] = useState("");
  const [sector, setSector] = useState("");
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");

  function numberOrNull(raw: string): number | null {
    if (raw.trim() === "") return null;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      onChange(
        await addExperience({
          title: title.trim(),
          clientName: clientName.trim() === "" ? null : clientName.trim(),
          clientType: clientType === "" ? null : clientType,
          sector: sector.trim() === "" ? null : sector.trim(),
          description: description.trim() === "" ? null : description.trim(),
          outcome: outcome.trim() === "" ? null : outcome.trim(),
          contractValueInr: numberOrNull(contractValue),
          startYear: numberOrNull(startYear),
          endYear: numberOrNull(endYear),
          referenceUrl: null,
        }),
      );
      setTitle("");
      setClientName("");
      setClientType("");
      setSector("");
      setDescription("");
      setOutcome("");
      setContractValue("");
      setStartYear("");
      setEndYear("");
      setOpen(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(undefined);
    try {
      onChange(await removeExperience(id));
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  return (
    <CollectionShell
      title={schema.collections.experience.title}
      description={schema.collections.experience.description}
      addLabel="Add a project"
      error={error}
      open={open}
      setOpen={setOpen}
      form={
        <>
          <div className="gov-form-group gov-form-group--wide">
            <label className="gov-form-label" htmlFor="experience-title">
              Project title<span className="gov-form-required">*</span>
            </label>
            <input
              id="experience-title"
              className="gov-form-control"
              type="text"
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="gov-form-grid">
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="experience-client">
                Client
              </label>
              <input
                id="experience-client"
                className="gov-form-control"
                type="text"
                maxLength={200}
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
              />
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="experience-client-type">
                Client type
              </label>
              <select
                id="experience-client-type"
                className="gov-form-control"
                value={clientType}
                onChange={(event) => setClientType(event.target.value)}
              >
                <option value="">Select…</option>
                {schema.taxonomy.clientTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="experience-sector">
                Sector
              </label>
              <input
                id="experience-sector"
                className="gov-form-control"
                type="text"
                maxLength={150}
                value={sector}
                onChange={(event) => setSector(event.target.value)}
              />
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="experience-value">
                Contract value (₹)
              </label>
              <input
                id="experience-value"
                className="gov-form-control"
                type="number"
                min={0}
                value={contractValue}
                onChange={(event) => setContractValue(event.target.value)}
              />
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="experience-start">
                Start year
              </label>
              <input
                id="experience-start"
                className="gov-form-control"
                type="number"
                min={1900}
                max={2100}
                value={startYear}
                onChange={(event) => setStartYear(event.target.value)}
              />
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="experience-end">
                End year
              </label>
              <input
                id="experience-end"
                className="gov-form-control"
                type="number"
                min={1900}
                max={2100}
                value={endYear}
                onChange={(event) => setEndYear(event.target.value)}
              />
            </div>
          </div>

          <div className="gov-form-group gov-form-group--wide">
            <label className="gov-form-label" htmlFor="experience-description">
              What was delivered
            </label>
            <textarea
              id="experience-description"
              className="gov-form-control"
              rows={3}
              maxLength={3000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="gov-form-group gov-form-group--wide">
            <label className="gov-form-label" htmlFor="experience-outcome">
              Outcome achieved
            </label>
            <p className="gov-form-hint">Numbers where you have them.</p>
            <textarea
              id="experience-outcome"
              className="gov-form-control"
              rows={2}
              maxLength={2000}
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />
          </div>

          <div className="gov-form-actions">
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || title.trim().length < 3}
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : "Save project"}
            </button>
          </div>
        </>
      }
    >
      {bundle.experience.length === 0 ? (
        <p className="gov-collection__empty">
          No previous projects recorded. Private-sector and pilot work both count.
        </p>
      ) : (
        bundle.experience.map((entry) => (
          <article key={entry.id} className="gov-entry-card">
            <div className="gov-entry-card__head">
              <div>
                <h4 className="gov-entry-card__title">{entry.title}</h4>
                <p className="gov-entry-card__meta">
                  {entry.clientName ?? "Client not named"}
                  {entry.clientType !== null &&
                    ` · ${labelOf(schema.taxonomy.clientTypes, entry.clientType)}`}
                  {entry.startYear !== null &&
                    ` · ${entry.startYear}${entry.endYear === null ? " onwards" : `–${entry.endYear}`}`}
                  {entry.contractValueInr !== null && ` · ${formatInr(entry.contractValueInr)}`}
                </p>
              </div>
              <button
                type="button"
                className="gov-btn gov-btn--tertiary gov-btn--sm"
                onClick={() => void remove(entry.id)}
              >
                Remove
              </button>
            </div>
            {entry.description !== null && (
              <p className="gov-entry-card__body">{entry.description}</p>
            )}
            {entry.outcome !== null && (
              <p className="gov-entry-card__outcome">
                <strong>Outcome:</strong> {entry.outcome}
              </p>
            )}
          </article>
        ))
      )}
    </CollectionShell>
  );
}

// ---------------------------------------------------------------------------
// Certifications, standards, awards and IP
// ---------------------------------------------------------------------------

export function CredentialsEditor({ bundle, schema, onChange }: CollectionEditorProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState("CERTIFICATION");
  const [name, setName] = useState("");
  const [authority, setAuthority] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [validUntil, setValidUntil] = useState("");

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      onChange(
        await addCredential({
          kind,
          name: name.trim(),
          issuingAuthority: authority.trim() === "" ? null : authority.trim(),
          identifier: identifier.trim() === "" ? null : identifier.trim(),
          issuedOn: null,
          validUntil: validUntil === "" ? null : validUntil,
          notes: null,
        }),
      );
      setName("");
      setAuthority("");
      setIdentifier("");
      setValidUntil("");
      setOpen(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(undefined);
    try {
      onChange(await removeCredential(id));
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  return (
    <CollectionShell
      title={schema.collections.credentials.title}
      description={schema.collections.credentials.description}
      addLabel="Add a credential"
      error={error}
      open={open}
      setOpen={setOpen}
      form={
        <>
          <div className="gov-form-grid">
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="credential-kind">
                Type
              </label>
              <select
                id="credential-kind"
                className="gov-form-control"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {schema.taxonomy.credentialKinds.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="credential-name">
                Name<span className="gov-form-required">*</span>
              </label>
              <input
                id="credential-name"
                className="gov-form-control"
                type="text"
                maxLength={200}
                placeholder="e.g. ISO 9001:2015"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="credential-authority">
                Issuing authority
              </label>
              <input
                id="credential-authority"
                className="gov-form-control"
                type="text"
                maxLength={200}
                value={authority}
                onChange={(event) => setAuthority(event.target.value)}
              />
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="credential-identifier">
                Certificate or registration number
              </label>
              <input
                id="credential-identifier"
                className="gov-form-control"
                type="text"
                maxLength={120}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </div>
            <div className="gov-form-group">
              <label className="gov-form-label" htmlFor="credential-valid">
                Valid until
              </label>
              <input
                id="credential-valid"
                className="gov-form-control"
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </div>
          </div>

          <div className="gov-form-actions">
            <button
              type="button"
              className="gov-btn gov-btn--primary"
              disabled={busy || name.trim().length < 2}
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : "Save credential"}
            </button>
          </div>
        </>
      }
    >
      {bundle.credentials.length === 0 ? (
        <p className="gov-collection__empty">
          No credentials recorded. Many tenders state a mandatory standard as an eligibility
          condition.
        </p>
      ) : (
        <div className="gov-table-container">
          <table className="gov-table">
            <thead>
              <tr>
                <th scope="col">Credential</th>
                <th scope="col">Type</th>
                <th scope="col">Issued by</th>
                <th scope="col">Valid until</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {bundle.credentials.map((credential) => (
                <tr key={credential.id}>
                  <td>
                    <strong>{credential.name}</strong>
                    {credential.identifier !== null && (
                      <div className="gov-table-mono">{credential.identifier}</div>
                    )}
                  </td>
                  <td>{labelOf(schema.taxonomy.credentialKinds, credential.kind)}</td>
                  <td>{credential.issuingAuthority ?? "—"}</td>
                  <td>{credential.validUntil ?? "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="gov-btn gov-btn--tertiary gov-btn--sm"
                      onClick={() => void remove(credential.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollectionShell>
  );
}

// ---------------------------------------------------------------------------
// Compliance documents
// ---------------------------------------------------------------------------

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;

  // Chunked because a single spread of a multi-megabyte array overflows the
  // call stack in every browser.
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }

  return btoa(binary);
}

export function DocumentsEditor({ bundle, schema, onChange }: CollectionEditorProps) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState("BUSINESS_REGISTRATION");
  const [title, setTitle] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [file, setFile] = useState<File | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const maxMb = Math.round(schema.upload.maxBytes / (1024 * 1024));

  async function submit() {
    if (file === undefined) return;

    setBusy(true);
    setError(undefined);

    try {
      if (file.size > schema.upload.maxBytes) {
        throw new ApiRequestError("FILE_TOO_LARGE", `Documents must be ${maxMb} MB or smaller.`);
      }

      await uploadDocument({
        documentType,
        title: title.trim() === "" ? file.name : title.trim(),
        fileName: file.name,
        mimeType: file.type,
        content: await fileToBase64(file),
        referenceNumber: referenceNumber.trim() === "" ? null : referenceNumber.trim(),
        issuedOn: null,
        validUntil: validUntil === "" ? null : validUntil,
      });

      setTitle("");
      setReferenceNumber("");
      setValidUntil("");
      setFile(undefined);
      if (fileInput.current !== null) fileInput.current.value = "";

      // The upload endpoint answers with the document alone; the bundle is
      // reloaded so completion and the capability document stay in step.
      onChange(await fetchProfile());
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(undefined);
    try {
      await removeDocument(id);
      onChange(await fetchProfile());
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  return (
    <div className="gov-collection">
      <div className="gov-collection__header">
        <div>
          <h3 className="gov-collection__title">{schema.collections.documents.title}</h3>
          <p className="gov-collection__description">{schema.collections.documents.description}</p>
        </div>
      </div>

      {error !== undefined && (
        <GovernmentAlert type="error" title="Upload Failed" role="alert">
          {error}
        </GovernmentAlert>
      )}

      <div className="gov-collection__form">
        <div className="gov-form-grid">
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="document-type">
              Document type
            </label>
            <select
              id="document-type"
              className="gov-form-control"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            >
              {schema.taxonomy.documentTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="document-title">
              Title
            </label>
            <input
              id="document-title"
              className="gov-form-control"
              type="text"
              maxLength={200}
              placeholder="Defaults to the file name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="document-reference">
              Reference number
            </label>
            <input
              id="document-reference"
              className="gov-form-control"
              type="text"
              maxLength={120}
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
            />
          </div>
          <div className="gov-form-group">
            <label className="gov-form-label" htmlFor="document-valid">
              Valid until
            </label>
            <input
              id="document-valid"
              className="gov-form-control"
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </div>
        </div>

        <div className="gov-form-group gov-form-group--wide">
          <label className="gov-form-label" htmlFor="document-file">
            File<span className="gov-form-required">*</span>
          </label>
          <p className="gov-form-hint">
            PDF, JPEG, PNG or WebP, up to {maxMb} MB. Documents are visible only to your
            organisation and to the portal administration.
          </p>
          <input
            id="document-file"
            ref={fileInput}
            className="gov-form-control"
            type="file"
            accept={schema.upload.acceptedTypes.join(",")}
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </div>

        <div className="gov-form-actions">
          <button
            type="button"
            className="gov-btn gov-btn--primary"
            disabled={busy || file === undefined}
            onClick={() => void submit()}
          >
            {busy ? "Uploading…" : "Upload document"}
          </button>
        </div>
      </div>

      <div className="gov-collection__list">
        {bundle.documents.length === 0 ? (
          <p className="gov-collection__empty">
            No documents uploaded. Your profile remains unverified until supporting documents are
            reviewed.
          </p>
        ) : (
          <div className="gov-table-container">
            <table className="gov-table">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Type</th>
                  <th scope="col">Uploaded</th>
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
                        {document.fileName} · {Math.round(document.sizeBytes / 1024)} KB
                      </div>
                      {document.reviewNotes !== null && (
                        <div className="gov-entry-card__meta">{document.reviewNotes}</div>
                      )}
                    </td>
                    <td>{labelOf(schema.taxonomy.documentTypes, document.documentType)}</td>
                    <td>{new Date(document.uploadedAt).toLocaleDateString("en-IN")}</td>
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
                      <button
                        type="button"
                        className="gov-btn gov-btn--tertiary gov-btn--sm"
                        onClick={() => void remove(document.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
