import { query } from "../db/pool.js";
import { toIsoDay } from "./dates.js";

import type { VerificationState } from "./vendorProfiles.js";

export interface VendorDocument {
  id: string;
  documentType: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  referenceNumber: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  verificationState: VerificationState;
  reviewNotes: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}

interface DocumentRow {
  id: string;
  document_type: string;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  reference_number: string | null;
  issued_on: Date | null;
  valid_until: Date | null;
  verification_state: VerificationState;
  review_notes: string | null;
  reviewed_at: Date | null;
  uploaded_at: Date;
}

const SELECT_DOCUMENT = `
  SELECT id, document_type, title, file_name, mime_type, size_bytes, reference_number,
         issued_on, valid_until, verification_state, review_notes, reviewed_at, uploaded_at
  FROM vendor_documents
`;

const isoDate = toIsoDay;

function toDocument(row: DocumentRow): VendorDocument {
  return {
    id: row.id,
    documentType: row.document_type,
    title: row.title,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    referenceNumber: row.reference_number,
    issuedOn: isoDate(row.issued_on),
    validUntil: isoDate(row.valid_until),
    verificationState: row.verification_state,
    reviewNotes: row.review_notes,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    uploadedAt: row.uploaded_at.toISOString(),
  };
}

export async function listDocuments(profileId: string): Promise<VendorDocument[]> {
  const result = await query<DocumentRow>(
    `${SELECT_DOCUMENT} WHERE vendor_profile_id = $1 ORDER BY uploaded_at DESC`,
    [profileId],
  );
  return result.rows.map(toDocument);
}

export async function createDocument(
  profileId: string,
  input: {
    documentType: string;
    title: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    referenceNumber: string | null;
    issuedOn: string | null;
    validUntil: string | null;
    uploadedBy: string;
  },
): Promise<VendorDocument> {
  const result = await query<DocumentRow>(
    `INSERT INTO vendor_documents
       (vendor_profile_id, document_type, title, file_name, mime_type, size_bytes, storage_key,
        reference_number, issued_on, valid_until, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, document_type, title, file_name, mime_type, size_bytes, reference_number,
               issued_on, valid_until, verification_state, review_notes, reviewed_at, uploaded_at`,
    [
      profileId,
      input.documentType,
      input.title,
      input.fileName,
      input.mimeType,
      input.sizeBytes,
      input.storageKey,
      input.referenceNumber,
      input.issuedOn,
      input.validUntil,
      input.uploadedBy,
    ],
  );

  const row = result.rows[0];
  if (row === undefined) throw new Error("Failed to record the uploaded document.");
  return toDocument(row);
}

/** Returns the storage key so the caller can remove the file from disk. */
export async function deleteDocument(
  profileId: string,
  id: string,
): Promise<string | undefined> {
  const result = await query<{ storage_key: string }>(
    `DELETE FROM vendor_documents WHERE id = $1 AND vendor_profile_id = $2 RETURNING storage_key`,
    [id, profileId],
  );
  return result.rows[0]?.storage_key;
}

export interface DocumentContentRef {
  storageKey: string;
  fileName: string;
  mimeType: string;
}

/**
 * The profile id is part of the predicate rather than checked afterwards, so a
 * document belonging to another organisation is simply not found.
 */
export async function findDocumentContent(
  profileId: string,
  id: string,
): Promise<DocumentContentRef | undefined> {
  const result = await query<{ storage_key: string; file_name: string; mime_type: string }>(
    `SELECT storage_key, file_name, mime_type
     FROM vendor_documents WHERE id = $1 AND vendor_profile_id = $2`,
    [id, profileId],
  );

  const row = result.rows[0];
  return row === undefined
    ? undefined
    : { storageKey: row.storage_key, fileName: row.file_name, mimeType: row.mime_type };
}

export async function recordDocumentReview(input: {
  documentId: string;
  verificationState: VerificationState;
  notes: string | null;
  reviewedBy: string;
}): Promise<{ profileId: string; title: string } | undefined> {
  const result = await query<{ vendor_profile_id: string; title: string }>(
    `UPDATE vendor_documents
     SET verification_state = $2::vendor_verification_state,
         review_notes       = $3,
         reviewed_by        = $4,
         reviewed_at        = now()
     WHERE id = $1
     RETURNING vendor_profile_id, title`,
    [input.documentId, input.verificationState, input.notes, input.reviewedBy],
  );

  const row = result.rows[0];
  return row === undefined ? undefined : { profileId: row.vendor_profile_id, title: row.title };
}

export async function countDocuments(profileId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM vendor_documents WHERE vendor_profile_id = $1`,
    [profileId],
  );
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}
