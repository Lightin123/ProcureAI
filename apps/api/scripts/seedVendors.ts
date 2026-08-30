/**
 * Populates the demonstration supplier registry on its own.
 *
 *   npm run seed:vendors
 *
 * `npm run seed` already does this as one of its steps. This entry point exists
 * for the case where only the suppliers need refreshing — after editing the
 * catalogue, say — and re-running the whole seed would also rewrite the
 * procurement projects, their requirements and their work packages.
 *
 * It touches nothing but supplier rows. Projects, work packages, shortlists,
 * invitations, responses and evaluations are never read or written here, so
 * running it against a database in the middle of a demonstration is safe.
 *
 * Idempotent: organisations and accounts are upserted on their code and email,
 * and each supplier's collections, documents and lifecycle notifications are
 * replaced rather than appended.
 */

import { hashPassword } from "../src/auth/password.js";
import { loadConfig } from "../src/config/env.js";
import { VENDOR_CATALOGUE } from "../src/config/vendors/index.js";
import { closePool } from "../src/db/pool.js";
import { resolveAdministratorId, seedCatalogueVendor } from "./vendorSeeding.js";

const MINIMUM_PASSWORD_LENGTH = 12;

function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed demo accounts with NODE_ENV=production. " +
        "Demo credentials are for development only.",
    );
  }
}

/**
 * Unlike `seed.ts` this never generates a password: a supplier-only refresh
 * that silently reset every demo account to a new random password would lock
 * whoever is using the portal out of it mid-session.
 */
function resolvePassword(): string {
  const configured = process.env.SEED_DEMO_PASSWORD;

  if (configured === undefined || configured.trim() === "") {
    throw new Error(
      "SEED_DEMO_PASSWORD is not set. Set it in apps/api/.env before refreshing the " +
        "supplier registry, so existing demo accounts keep the password they already have.",
    );
  }

  if (configured.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(`SEED_DEMO_PASSWORD must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
  }

  return configured;
}

async function run(): Promise<void> {
  loadConfig();
  assertNotProduction();

  const passwordHash = await hashPassword(resolvePassword());
  const administratorId = await resolveAdministratorId();

  let offerings = 0;
  let experience = 0;
  let credentials = 0;
  let documents = 0;

  for (const vendor of VENDOR_CATALOGUE) {
    const outcome = await seedCatalogueVendor(vendor, { passwordHash, administratorId });

    offerings += outcome.offerings;
    experience += outcome.experience;
    credentials += outcome.credentials;
    documents += outcome.documents;

    console.log(
      `supplier      ${vendor.email.padEnd(44)} ` +
        `${String(outcome.completionPercentage).padStart(3)}% VERIFIED  ` +
        `off ${outcome.offerings} exp ${outcome.experience} ` +
        `cred ${outcome.credentials} doc ${outcome.documents} ` +
        `kw ${String(outcome.keywords).padStart(3)}`,
    );
  }

  console.log("");
  console.log(
    `Seeded ${VENDOR_CATALOGUE.length} verified supplier profiles with ` +
      `${offerings} offerings, ${experience} past projects, ${credentials} credentials ` +
      `and ${documents} verified documents.`,
  );
}

run()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error((error as Error).message);
    await closePool();
    process.exit(1);
  });
