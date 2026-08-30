/**
 * Checks that the seeded supplier registry is actually in the state the
 * catalogue claims.
 *
 *   npx tsx scripts/verifyVendorRegistry.ts
 *
 * Reads the database rather than the catalogue: every assertion below is about
 * what was written, not about what was meant to be written. It fails loudly and
 * names the supplier at fault, so a partial seed run cannot pass unnoticed.
 *
 * Deliberately read-only. It creates nothing, so it is safe to run against a
 * database in the middle of a demonstration.
 */

import { VENDOR_CATALOGUE } from "../src/config/vendors/index.js";
import { closePool, query } from "../src/db/pool.js";
import { listVendorRegistry } from "../src/repositories/vendorProfiles.js";
import { loadFullProfile } from "../src/vendor/profileService.js";

interface RegistryRow {
  code: string;
  organization_name: string;
  profile_id: string;
  user_count: string;
  status: string;
  verification_state: string;
  completion_percentage: number;
  keywords: number;
  capability_length: number;
  semantic_length: number;
  submitted: boolean;
  verified: boolean;
  verified_by_admin: boolean;
  offerings: string;
  experience: string;
  credentials: string;
  documents: string;
  verified_documents: string;
  industries: string[];
  operating_states: string[];
  max_project_value: string | null;
}

const failures: string[] = [];
const lines: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

const rows = await query<RegistryRow>(
  `SELECT o.code,
          o.name AS organization_name,
          p.id AS profile_id,
          (SELECT COUNT(*)::text FROM users u
            WHERE u.organization_id = o.id AND u.role = 'VENDOR' AND u.is_active) AS user_count,
          p.status::text,
          p.verification_state::text,
          p.completion_percentage,
          COALESCE(array_length(p.capability_keywords, 1), 0) AS keywords,
          COALESCE(length(p.capability_document), 0) AS capability_length,
          COALESCE(length(p.semantic_document), 0) AS semantic_length,
          (p.submitted_at IS NOT NULL) AS submitted,
          (p.verified_at IS NOT NULL) AS verified,
          (av.role = 'ADMIN') AS verified_by_admin,
          (SELECT COUNT(*)::text FROM vendor_offerings x WHERE x.vendor_profile_id = p.id) AS offerings,
          (SELECT COUNT(*)::text FROM vendor_experience x WHERE x.vendor_profile_id = p.id) AS experience,
          (SELECT COUNT(*)::text FROM vendor_credentials x WHERE x.vendor_profile_id = p.id) AS credentials,
          (SELECT COUNT(*)::text FROM vendor_documents x WHERE x.vendor_profile_id = p.id) AS documents,
          (SELECT COUNT(*)::text FROM vendor_documents x
            WHERE x.vendor_profile_id = p.id AND x.verification_state = 'VERIFIED') AS verified_documents,
          p.industries,
          p.operating_states,
          p.max_project_value_inr::text AS max_project_value
   FROM vendor_profiles p
   JOIN organizations o ON o.id = p.organization_id
   LEFT JOIN users av ON av.id = p.verified_by
   ORDER BY o.code`,
);

const byCode = new Map(rows.rows.map((row) => [row.code, row]));

lines.push(`Supplier profiles in the registry: ${rows.rows.length}`);
lines.push(`Catalogue suppliers expected:      ${VENDOR_CATALOGUE.length}`);
lines.push("");

for (const vendor of VENDOR_CATALOGUE) {
  const row = byCode.get(vendor.organizationCode);

  if (row === undefined) {
    failures.push(`${vendor.organizationCode}: no profile in the registry`);
    continue;
  }

  check(Number.parseInt(row.user_count, 10) >= 1, `${row.code}: no active VENDOR user account`);
  check(row.completion_percentage === 100, `${row.code}: completion is ${row.completion_percentage}%, not 100%`);
  check(row.status === "VERIFIED", `${row.code}: status is ${row.status}, not VERIFIED`);
  check(row.verification_state === "VERIFIED", `${row.code}: verification is ${row.verification_state}`);
  check(row.submitted, `${row.code}: profile was never submitted`);
  check(row.verified, `${row.code}: no verified_at timestamp`);
  check(row.verified_by_admin, `${row.code}: verification is not attributed to an administrator`);
  check(row.keywords > 0, `${row.code}: no capability keywords`);
  check(row.capability_length > 0, `${row.code}: no capability document`);
  check(row.semantic_length > 0, `${row.code}: no semantic document`);
  check(Number.parseInt(row.offerings, 10) > 0, `${row.code}: no offerings`);
  check(Number.parseInt(row.experience, 10) > 0, `${row.code}: no experience entries`);
  check(Number.parseInt(row.credentials, 10) > 0, `${row.code}: no credentials`);
  check(Number.parseInt(row.documents, 10) > 0, `${row.code}: no compliance documents`);
  check(
    row.documents === row.verified_documents,
    `${row.code}: ${row.documents} document(s) but only ${row.verified_documents} verified`,
  );
  check(row.industries.length > 0, `${row.code}: no industries recorded`);
  check(row.operating_states.length > 0, `${row.code}: no operating states recorded`);
}

// The administrator registry listing is what the supplier registry screen reads.
const registry = await listVendorRegistry();
const verifiedInRegistry = registry.filter((entry) => entry.verificationState === "VERIFIED");

lines.push(`Administrator registry rows:       ${registry.length}`);
lines.push(`  verified:                        ${verifiedInRegistry.length}`);
lines.push(
  `  pending document review:         ${registry.filter((e) => e.pendingDocumentCount > 0).length}`,
);
lines.push("");

for (const vendor of VENDOR_CATALOGUE) {
  const entry = registry.find(
    (candidate) => candidate.organizationName === vendor.organizationName,
  );
  check(entry !== undefined, `${vendor.organizationCode}: absent from the administrator registry`);
  if (entry !== undefined) {
    check(
      entry.verificationState === "VERIFIED",
      `${vendor.organizationCode}: registry shows ${entry.verificationState}`,
    );
    check(
      entry.pendingDocumentCount === 0,
      `${vendor.organizationCode}: ${entry.pendingDocumentCount} document(s) still pending review`,
    );
  }
}

// One full profile load, as the vendor portal and the admin detail page perform
// it, to confirm the whole aggregate resolves rather than only its columns.
const sample = rows.rows[0];
if (sample !== undefined) {
  const full = await loadFullProfile(sample.profile_id);
  check(full.completion.percentage === 100, `${sample.code}: loadFullProfile reports ${full.completion.percentage}%`);
  check(full.completion.readyToSubmit, `${sample.code}: loadFullProfile reports outstanding required fields`);
}

// Matching readiness: the retrieval stage reads capability_keywords, and the
// eligibility gate reads completion_percentage and verification_state.
const matchable = await query<{ count: string }>(
  `SELECT COUNT(*)::text AS count FROM vendor_profiles
   WHERE completion_percentage >= 40
     AND verification_state <> 'REJECTED'
     AND array_length(capability_keywords, 1) > 0`,
);

lines.push(`Suppliers retrievable by matching:  ${matchable.rows[0]?.count ?? "0"}`);

// Sector spread, which is what makes the registry useful for ranking tests.
const sectors = await query<{ industry: string; count: string }>(
  `SELECT industry, COUNT(*)::text AS count
   FROM vendor_profiles p, unnest(p.industries) AS industry
   GROUP BY industry ORDER BY COUNT(*) DESC`,
);

lines.push("");
lines.push("Industry coverage:");
for (const row of sectors.rows) {
  lines.push(`  ${row.industry.padEnd(24)} ${row.count}`);
}

const coverage = await query<{ service_coverage: string; count: string }>(
  `SELECT COALESCE(service_coverage::text, 'not stated') AS service_coverage, COUNT(*)::text AS count
   FROM vendor_profiles GROUP BY 1 ORDER BY 2 DESC`,
);

lines.push("");
lines.push("Declared coverage:");
for (const row of coverage.rows) {
  lines.push(`  ${row.service_coverage.padEnd(24)} ${row.count}`);
}

const values = await query<{ band: string; count: string }>(
  `SELECT CASE
            WHEN max_project_value_inr IS NULL THEN 'not stated'
            WHEN max_project_value_inr < 25000000 THEN 'under 2.5 crore'
            WHEN max_project_value_inr < 100000000 THEN '2.5 to 10 crore'
            WHEN max_project_value_inr < 500000000 THEN '10 to 50 crore'
            ELSE 'above 50 crore'
          END AS band,
          COUNT(*)::text AS count
   FROM vendor_profiles GROUP BY 1 ORDER BY 2 DESC`,
);

lines.push("");
lines.push("Maximum contract value bands:");
for (const row of values.rows) {
  lines.push(`  ${row.band.padEnd(24)} ${row.count}`);
}

const totals = await query<Record<string, string>>(
  `SELECT (SELECT COUNT(*)::text FROM vendor_offerings) AS offerings,
          (SELECT COUNT(*)::text FROM vendor_experience) AS experience,
          (SELECT COUNT(*)::text FROM vendor_credentials) AS credentials,
          (SELECT COUNT(*)::text FROM vendor_documents) AS documents`,
);

const totalRow = totals.rows[0] ?? {};
lines.push("");
lines.push(
  `Portfolio totals: ${totalRow.offerings} offerings, ${totalRow.experience} past projects, ` +
    `${totalRow.credentials} credentials, ${totalRow.documents} documents.`,
);

lines.push("");
lines.push(
  failures.length === 0
    ? "Every catalogue supplier is registered, complete, documented and verified."
    : `${failures.length} problem(s) found:`,
);
for (const failure of failures) lines.push(`  ${failure}`);

process.stdout.write(lines.join("\n") + "\n");
await closePool();
process.exit(failures.length === 0 ? 0 : 1);
