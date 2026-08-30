/**
 * Offline check of the demonstration supplier catalogue.
 *
 * Runs the real validation and the real completion computation over every
 * catalogue entry without touching the database, so a gap in the data is found
 * in a second rather than halfway through a seed run against a hosted server.
 *
 *   npx tsx scripts/checkVendorCatalogue.ts
 *
 * Reports, per supplier, the completion percentage the onboarding logic would
 * assign and exactly which fields are still unanswered. Exits non-zero if any
 * supplier falls short of 100%, if two suppliers share an organisation code or
 * an email address, or if a profile fails the API's own patch schema.
 */

import { VENDOR_CATALOGUE } from "../src/config/vendors/index.js";
import { evaluateCompletion, visibleFields } from "../src/vendor/completion.js";
import { ONBOARDING_STEPS } from "../src/vendor/onboardingSchema.js";
import { validateCatalogueProfile } from "./vendorSeeding.js";

import type { ProfileValues } from "../src/vendor/completion.js";

const lines: string[] = [];
let failures = 0;

const codes = new Set<string>();
const emails = new Set<string>();

for (const vendor of VENDOR_CATALOGUE) {
  if (codes.has(vendor.organizationCode)) {
    lines.push(`DUPLICATE CODE  ${vendor.organizationCode}`);
    failures += 1;
  }
  if (emails.has(vendor.email)) {
    lines.push(`DUPLICATE EMAIL ${vendor.email}`);
    failures += 1;
  }
  codes.add(vendor.organizationCode);
  emails.add(vendor.email);

  try {
    validateCatalogueProfile(vendor);
  } catch (error) {
    lines.push(`INVALID ${(error as Error).message}`);
    failures += 1;
    continue;
  }

  const values = vendor.profile as ProfileValues;

  const completion = evaluateCompletion(values, {
    offerings: vendor.offerings.length,
    experience: vendor.experience.length,
    credentials: vendor.credentials.length,
    documents: vendor.documents.length,
  });

  if (completion.percentage === 100) {
    lines.push(
      `ok   ${vendor.organizationCode.padEnd(26)} 100%  ` +
        `off ${vendor.offerings.length} exp ${vendor.experience.length} ` +
        `cred ${vendor.credentials.length} doc ${vendor.documents.length}`,
    );
    continue;
  }

  failures += 1;
  lines.push(`FAIL ${vendor.organizationCode.padEnd(26)} ${completion.percentage}%`);

  for (const missing of completion.missingRequired) {
    lines.push(`       required unanswered: ${missing.path}`);
  }

  // Optional fields are what usually keeps a profile off 100%, and the
  // completion result does not name them, so they are recomputed here.
  for (const step of ONBOARDING_STEPS) {
    const unanswered = visibleFields(values, step).filter((field) => {
      if (field.required === true) return false;
      const value = field.path
        .split(".")
        .reduce<unknown>(
          (current, segment) =>
            typeof current === "object" && current !== null
              ? (current as Record<string, unknown>)[segment]
              : undefined,
          values,
        );
      if (value === undefined || value === null) return true;
      if (typeof value === "string") return value.trim() === "";
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === "object") return Object.keys(value).length === 0;
      return false;
    });

    for (const field of unanswered) {
      lines.push(`       optional unanswered: ${field.path}`);
    }
  }

  const counts: Record<string, number> = {
    offerings: vendor.offerings.length,
    experience: vendor.experience.length,
    credentials: vendor.credentials.length,
    documents: vendor.documents.length,
  };
  for (const [collection, count] of Object.entries(counts)) {
    if (count === 0) lines.push(`       empty collection: ${collection}`);
  }
}

lines.push("");
lines.push(
  failures === 0
    ? `All ${VENDOR_CATALOGUE.length} catalogue suppliers reach 100% completion.`
    : `${failures} catalogue supplier(s) need attention.`,
);

process.stdout.write(lines.join("\n") + "\n");
process.exit(failures === 0 ? 0 : 1);
