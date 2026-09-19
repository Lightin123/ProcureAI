/**
 * The seam between document handling and where the bytes actually live.
 *
 * Validation — the MIME allowlist, the size ceiling, the magic-byte check and
 * the generated key — stays in `documentStorage.ts` and is driver-independent,
 * so a second driver cannot accidentally accept a file the first one refused.
 * A driver only moves bytes.
 */

export const UPLOAD_FOLDERS = ["vendor-documents", "response-documents"] as const;

export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export interface DocumentStorageDriver {
  /** Reported in start-up logs and in the system status payload. */
  readonly name: string;

  /** Durable once resolved: the caller records the key in the database next. */
  write(storageKey: string, bytes: Buffer): Promise<void>;

  read(storageKey: string): Promise<Buffer>;

  /** Best-effort: a missing object must not fail the row deletion before it. */
  remove(storageKey: string): Promise<void>;
}
