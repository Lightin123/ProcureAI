import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiError } from "../middleware/errors.js";

/**
 * Compliance documents are stored on disk, outside the database and outside the
 * web root. Files are content-addressed by a generated UUID and never by the
 * name the uploader supplied, so a hostile filename cannot escape the directory
 * or overwrite another vendor's document.
 *
 * Uploads arrive base64-encoded in the JSON body rather than as multipart form
 * data. That keeps the API to one content type and adds no dependency; the
 * cost is roughly a third more bytes on the wire, which is acceptable at a 5 MB
 * per-file ceiling (D59).
 */

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The directories this module will write into and read back from.
 *
 * An allowlist rather than a free-form path: the folder decides where a file
 * lands, and a caller that could name an arbitrary one could name a path
 * outside the upload root. Vendor compliance documents and vendor response
 * attachments are separate because they have different owners and different
 * lifetimes — a response attachment is deleted with its response.
 */
const UPLOAD_FOLDERS = ["vendor-documents", "response-documents"] as const;

export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const ALLOWED_MIME_TYPES: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ALLOWED_UPLOAD_MIME_TYPES = Object.keys(ALLOWED_MIME_TYPES);
export const MAX_UPLOAD_BYTES = MAX_BYTES;

function uploadRoot(): string {
  const configured = process.env.UPLOAD_DIR;
  if (configured !== undefined && configured.trim() !== "") {
    return path.resolve(configured.trim());
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../var/uploads");
}

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
}

/**
 * Decodes and writes the upload. The declared MIME type is checked against the
 * file's own leading bytes, so renaming an executable to `.pdf` and declaring
 * `application/pdf` does not get it stored as a document.
 */
export async function storeDocument(input: {
  base64: string;
  mimeType: string;
  folder?: UploadFolder;
}): Promise<StoredFile> {
  const folder: UploadFolder = input.folder ?? "vendor-documents";
  const extension = ALLOWED_MIME_TYPES[input.mimeType];
  if (extension === undefined) {
    throw new ApiError(
      400,
      "UNSUPPORTED_FILE_TYPE",
      "Documents must be a PDF, JPEG, PNG or WebP file.",
    );
  }

  const payload = input.base64.includes(",")
    ? (input.base64.split(",").pop() ?? "")
    : input.base64;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    throw new ApiError(400, "INVALID_FILE", "The uploaded file could not be decoded.");
  }

  if (bytes.length === 0) {
    throw new ApiError(400, "INVALID_FILE", "The uploaded file is empty.");
  }

  if (bytes.length > MAX_BYTES) {
    throw new ApiError(
      400,
      "FILE_TOO_LARGE",
      `Documents must be ${Math.round(MAX_BYTES / (1024 * 1024))} MB or smaller.`,
    );
  }

  if (!matchesSignature(bytes, input.mimeType)) {
    throw new ApiError(
      400,
      "FILE_TYPE_MISMATCH",
      "The file's contents do not match the declared file type.",
    );
  }

  const directory = path.join(uploadRoot(), folder);
  await mkdir(directory, { recursive: true });

  const storageKey = `${folder}/${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadRoot(), storageKey), bytes);

  return { storageKey, sizeBytes: bytes.length };
}

function matchesSignature(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") {
    return bytes.subarray(0, 4).toString("latin1") === "%PDF";
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8;
  }
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  }
  if (mimeType === "image/webp") {
    return (
      bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
      bytes.subarray(8, 12).toString("latin1") === "WEBP"
    );
  }
  return false;
}

/** Rejects any key that is not one this module generated. */
function resolveStorageKey(storageKey: string): string {
  const root = uploadRoot();
  const resolved = path.resolve(root, storageKey);

  const permitted = UPLOAD_FOLDERS.some((folder) =>
    resolved.startsWith(path.join(root, folder) + path.sep),
  );

  if (!permitted) {
    throw new ApiError(404, "NOT_FOUND", "The document was not found.");
  }

  return resolved;
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(resolveStorageKey(storageKey));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(404, "NOT_FOUND", "The stored document could not be read.");
  }
}

/** Best-effort: a missing file must not fail the row deletion that preceded it. */
export async function removeDocument(storageKey: string): Promise<void> {
  try {
    await unlink(resolveStorageKey(storageKey));
  } catch {
    // Already gone, or never written. Nothing to do.
  }
}
