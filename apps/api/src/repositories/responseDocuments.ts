/**
 * Supporting documents attached to a vendor response.
 *
 * The bytes are not here: they go through `vendor/documentStorage.ts`, the one
 * module that decodes an upload, enforces the size ceiling, checks the declared
 * MIME type against the file's own leading bytes and writes it under a
 * generated key. This file stores what the department reads about the file and
 * the key it can be fetched back by.
 *
 * Both sides read these rows and neither reads them by id alone. The vendor
 * resolves a document through its own response; the department resolves it
 * through its own organization. There is no lookup that takes a document id
 * without one of those.
 */

import { query } from "../db/pool.js";

export interface ResponseDocument {
  id: string;
  responseId: string;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface DocumentRow {
  id: string;
  response_id: string;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: Date;
}

function toDocument(row: DocumentRow): ResponseDocument {
  return {
    id: row.id,
    responseId: row.response_id,
    title: row.title,
    description: row.description,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at.toISOString(),
  };
}

export async function listResponseDocuments(responseId: string): Promise<ResponseDocument[]> {
  const result = await query<DocumentRow>(
    `SELECT id, response_id, title, description, file_name, mime_type, size_bytes, uploaded_at
     FROM work_package_response_documents
     WHERE response_id = $1
     ORDER BY uploaded_at DESC`,
    [responseId],
  );

  return result.rows.map(toDocument);
}

export async function countResponseDocuments(responseId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM work_package_response_documents WHERE response_id = $1`,
    [responseId],
  );

  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

/**
 * Attaches a document, but only to a response that is this supplier's and still
 * editable. Both conditions are in the INSERT's own SELECT, so a supplier
 * cannot attach a file to another supplier's response or to one it has already
 * submitted.
 */
export async function createResponseDocument(input: {
  responseId: string;
  vendorProfileId: string;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedBy: string;
}): Promise<ResponseDocument | undefined> {
  const result = await query<DocumentRow>(
    `INSERT INTO work_package_response_documents
       (response_id, title, description, file_name, mime_type, size_bytes, storage_key,
        uploaded_by)
     SELECT r.id, $3, $4, $5, $6, $7, $8, $9
     FROM work_package_responses r
     WHERE r.id = $1 AND r.vendor_profile_id = $2
       AND r.status IN ('DRAFT', 'CLARIFICATION_REQUESTED')
     RETURNING id, response_id, title, description, file_name, mime_type, size_bytes, uploaded_at`,
    [
      input.responseId,
      input.vendorProfileId,
      input.title,
      input.description,
      input.fileName,
      input.mimeType,
      input.sizeBytes,
      input.storageKey,
      input.uploadedBy,
    ],
  );

  const row = result.rows[0];
  return row === undefined ? undefined : toDocument(row);
}

/**
 * Removes a document from a still-editable response and returns its storage key
 * so the caller can delete the file. A document on a submitted response is not
 * removable: the department has already seen it.
 */
export async function deleteResponseDocument(input: {
  documentId: string;
  responseId: string;
  vendorProfileId: string;
}): Promise<string | undefined> {
  const result = await query<{ storage_key: string }>(
    `DELETE FROM work_package_response_documents d
     USING work_package_responses r
     WHERE d.id = $1 AND d.response_id = $2 AND r.id = d.response_id
       AND r.vendor_profile_id = $3
       AND r.status IN ('DRAFT', 'CLARIFICATION_REQUESTED')
     RETURNING d.storage_key`,
    [input.documentId, input.responseId, input.vendorProfileId],
  );

  return result.rows[0]?.storage_key;
}

export interface ResponseDocumentContent {
  storageKey: string;
  fileName: string;
  mimeType: string;
}

/** The supplier's own download: resolved through its own profile. */
export async function findVendorDocumentContent(input: {
  documentId: string;
  vendorProfileId: string;
}): Promise<ResponseDocumentContent | undefined> {
  const result = await query<{ storage_key: string; file_name: string; mime_type: string }>(
    `SELECT d.storage_key, d.file_name, d.mime_type
     FROM work_package_response_documents d
     JOIN work_package_responses r ON r.id = d.response_id
     WHERE d.id = $1 AND r.vendor_profile_id = $2`,
    [input.documentId, input.vendorProfileId],
  );

  const row = result.rows[0];
  return row === undefined
    ? undefined
    : { storageKey: row.storage_key, fileName: row.file_name, mimeType: row.mime_type };
}

/**
 * The department's download: resolved through its own organization, and only
 * for a response that has actually been submitted. A draft the supplier is
 * still writing is not something the department may open, and a document
 * attached to one is part of that draft.
 */
export async function findGovernmentDocumentContent(input: {
  documentId: string;
  organizationId: string;
}): Promise<ResponseDocumentContent | undefined> {
  const result = await query<{ storage_key: string; file_name: string; mime_type: string }>(
    `SELECT d.storage_key, d.file_name, d.mime_type
     FROM work_package_response_documents d
     JOIN work_package_responses r ON r.id = d.response_id
     WHERE d.id = $1 AND r.organization_id = $2 AND r.status <> 'DRAFT'`,
    [input.documentId, input.organizationId],
  );

  const row = result.rows[0];
  return row === undefined
    ? undefined
    : { storageKey: row.storage_key, fileName: row.file_name, mimeType: row.mime_type };
}
