import { query } from "../db/pool.js";

export interface VendorOffering {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  categories: string[];
  tags: string[];
  sectors: string[];
  createdAt: string;
}

export interface VendorExperienceEntry {
  id: string;
  title: string;
  clientName: string | null;
  clientType: string | null;
  sector: string | null;
  description: string | null;
  outcome: string | null;
  contractValueInr: number | null;
  startYear: number | null;
  endYear: number | null;
  referenceUrl: string | null;
  createdAt: string;
}

export interface VendorCredential {
  id: string;
  kind: string;
  name: string;
  issuingAuthority: string | null;
  identifier: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  notes: string | null;
  verificationState: string;
  createdAt: string;
}

function isoDate(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------

export async function listOfferings(profileId: string): Promise<VendorOffering[]> {
  const result = await query<{
    id: string;
    kind: string;
    name: string;
    description: string | null;
    categories: string[];
    tags: string[];
    sectors: string[];
    created_at: Date;
  }>(
    `SELECT id, kind, name, description, categories, tags, sectors, created_at
     FROM vendor_offerings WHERE vendor_profile_id = $1 ORDER BY created_at`,
    [profileId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    categories: row.categories,
    tags: row.tags,
    sectors: row.sectors,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createOffering(
  profileId: string,
  input: {
    kind: string;
    name: string;
    description: string | null;
    categories: string[];
    tags: string[];
    sectors: string[];
  },
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO vendor_offerings
       (vendor_profile_id, kind, name, description, categories, tags, sectors)
     VALUES ($1, $2::vendor_offering_kind, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      profileId,
      input.kind,
      input.name,
      input.description,
      input.categories,
      input.tags,
      input.sectors,
    ],
  );

  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error("Failed to record the offering.");
  return id;
}

export async function deleteOffering(profileId: string, id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM vendor_offerings WHERE id = $1 AND vendor_profile_id = $2`,
    [id, profileId],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

export async function listExperience(profileId: string): Promise<VendorExperienceEntry[]> {
  const result = await query<{
    id: string;
    title: string;
    client_name: string | null;
    client_type: string | null;
    sector: string | null;
    description: string | null;
    outcome: string | null;
    contract_value_inr: string | null;
    start_year: number | null;
    end_year: number | null;
    reference_url: string | null;
    created_at: Date;
  }>(
    `SELECT id, title, client_name, client_type, sector, description, outcome,
            contract_value_inr, start_year, end_year, reference_url, created_at
     FROM vendor_experience WHERE vendor_profile_id = $1
     ORDER BY start_year DESC NULLS LAST, created_at DESC`,
    [profileId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    clientName: row.client_name,
    clientType: row.client_type,
    sector: row.sector,
    description: row.description,
    outcome: row.outcome,
    contractValueInr: numeric(row.contract_value_inr),
    startYear: row.start_year,
    endYear: row.end_year,
    referenceUrl: row.reference_url,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createExperience(
  profileId: string,
  input: {
    title: string;
    clientName: string | null;
    clientType: string | null;
    sector: string | null;
    description: string | null;
    outcome: string | null;
    contractValueInr: number | null;
    startYear: number | null;
    endYear: number | null;
    referenceUrl: string | null;
  },
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO vendor_experience
       (vendor_profile_id, title, client_name, client_type, sector, description, outcome,
        contract_value_inr, start_year, end_year, reference_url)
     VALUES ($1, $2, $3, $4::vendor_client_type, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      profileId,
      input.title,
      input.clientName,
      input.clientType,
      input.sector,
      input.description,
      input.outcome,
      input.contractValueInr,
      input.startYear,
      input.endYear,
      input.referenceUrl,
    ],
  );

  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error("Failed to record the project.");
  return id;
}

export async function deleteExperience(profileId: string, id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM vendor_experience WHERE id = $1 AND vendor_profile_id = $2`,
    [id, profileId],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export async function listCredentials(profileId: string): Promise<VendorCredential[]> {
  const result = await query<{
    id: string;
    kind: string;
    name: string;
    issuing_authority: string | null;
    identifier: string | null;
    issued_on: Date | null;
    valid_until: Date | null;
    notes: string | null;
    verification_state: string;
    created_at: Date;
  }>(
    `SELECT id, kind, name, issuing_authority, identifier, issued_on, valid_until, notes,
            verification_state, created_at
     FROM vendor_credentials WHERE vendor_profile_id = $1 ORDER BY created_at`,
    [profileId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    issuingAuthority: row.issuing_authority,
    identifier: row.identifier,
    issuedOn: isoDate(row.issued_on),
    validUntil: isoDate(row.valid_until),
    notes: row.notes,
    verificationState: row.verification_state,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createCredential(
  profileId: string,
  input: {
    kind: string;
    name: string;
    issuingAuthority: string | null;
    identifier: string | null;
    issuedOn: string | null;
    validUntil: string | null;
    notes: string | null;
  },
): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO vendor_credentials
       (vendor_profile_id, kind, name, issuing_authority, identifier, issued_on, valid_until, notes)
     VALUES ($1, $2::vendor_credential_kind, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      profileId,
      input.kind,
      input.name,
      input.issuingAuthority,
      input.identifier,
      input.issuedOn,
      input.validUntil,
      input.notes,
    ],
  );

  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error("Failed to record the credential.");
  return id;
}

export async function deleteCredential(profileId: string, id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM vendor_credentials WHERE id = $1 AND vendor_profile_id = $2`,
    [id, profileId],
  );
  return (result.rowCount ?? 0) > 0;
}
