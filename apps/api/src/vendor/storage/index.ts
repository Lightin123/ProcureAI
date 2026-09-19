import { loadConfig } from "../../config/env.js";
import { localDriver } from "./localDriver.js";
import type { DocumentStorageDriver } from "./types.js";

let driver: DocumentStorageDriver | undefined;

/**
 * Resolves the configured driver once per process.
 *
 * Adding an object-storage driver means implementing `DocumentStorageDriver`,
 * widening `StorageDriver` in `config/env.ts`, and adding one case here. No
 * call site in the routes changes: they deal in storage keys, and a key is
 * already an opaque identifier rather than a path.
 */
export function documentStorageDriver(): DocumentStorageDriver {
  if (driver === undefined) {
    const { storageDriver } = loadConfig();

    switch (storageDriver) {
      case "local":
        driver = localDriver;
        break;
    }
  }

  return driver;
}

export type { DocumentStorageDriver, UploadFolder } from "./types.js";
export { UPLOAD_FOLDERS } from "./types.js";
