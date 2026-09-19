import { ApiError } from "../../middleware/errors.js";
import { UPLOAD_FOLDERS } from "./types.js";

/**
 * Exactly the shape `storeDocument` generates: a known folder, a generated
 * UUID, and an extension this module chose from the declared MIME type.
 *
 * Keys reach this module from the database, but a database value is still an
 * input — so the key is matched against the grammar rather than merely checked
 * for `..`. Nothing user-supplied appears in a key: the uploader's filename is
 * stored as a column, never used as a path.
 */
const STORAGE_KEY = new RegExp(
  `^(${UPLOAD_FOLDERS.join("|")})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$`,
);

export function assertPermittedStorageKey(storageKey: string): string {
  if (!STORAGE_KEY.test(storageKey)) {
    throw new ApiError(404, "NOT_FOUND", "The document was not found.");
  }

  return storageKey;
}
