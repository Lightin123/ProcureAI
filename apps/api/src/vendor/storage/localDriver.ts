import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../../config/env.js";
import { ApiError } from "../../middleware/errors.js";
import { assertPermittedStorageKey } from "./keys.js";
import type { DocumentStorageDriver } from "./types.js";

/**
 * Files on the local filesystem, outside the database and outside the web root.
 *
 * This is the development driver, and it is also correct in production when
 * `UPLOAD_DIR` names a genuinely persistent, mounted path. It is not correct on
 * a platform with an ephemeral container filesystem, which is why
 * `assertProductionConfig` refuses to start when `UPLOAD_DIR` is unset in
 * production rather than letting uploads disappear at the next deploy.
 */
function uploadRoot(): string {
  const configured = loadConfig().uploadDir;
  if (configured !== undefined) {
    return path.resolve(configured);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../var/uploads");
}

/**
 * Second barrier behind the key grammar: even a key that matched the pattern is
 * resolved and confirmed to land inside the upload root before it is touched.
 */
function resolvePath(storageKey: string): string {
  const root = uploadRoot();
  const resolved = path.resolve(root, assertPermittedStorageKey(storageKey));

  if (!resolved.startsWith(root + path.sep)) {
    throw new ApiError(404, "NOT_FOUND", "The document was not found.");
  }

  return resolved;
}

export const localDriver: DocumentStorageDriver = {
  name: "local",

  async write(storageKey, bytes) {
    const target = resolvePath(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  },

  async read(storageKey) {
    try {
      return await readFile(resolvePath(storageKey));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(404, "NOT_FOUND", "The stored document could not be read.");
    }
  },

  async remove(storageKey) {
    try {
      await unlink(resolvePath(storageKey));
    } catch {
      // Already gone, or never written. Nothing to do.
    }
  },
};
