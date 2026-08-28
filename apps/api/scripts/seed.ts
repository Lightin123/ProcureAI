import { randomBytes } from "node:crypto";

import { hashPassword } from "../src/auth/password.js";
import { loadConfig } from "../src/config/env.js";
import { SEEDED_ORGANIZATIONS, SEEDED_USERS } from "../src/config/seedIdentity.js";
import { SEEDED_OPPORTUNITIES } from "../src/config/seedOpportunities.js";
import { SEEDED_VENDORS } from "../src/config/seedVendors.js";
import { closePool, query } from "../src/db/pool.js";
import { createProfile, updateProfileValues } from "../src/repositories/vendorProfiles.js";
import {
  createCredential,
  createExperience,
  createOffering,
} from "../src/repositories/vendorPortfolio.js";
import { refreshDerivedState } from "../src/vendor/profileService.js";

const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * Demo accounts are a development affordance. Creating them against a
 * production database would install known credentials, so the script refuses
 * rather than trusting the operator to have set the right DATABASE_URL.
 */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed demo accounts with NODE_ENV=production. " +
        "Demo credentials are for development only.",
    );
  }
}

function resolvePassword(): { password: string; generated: boolean } {
  const configured = process.env.SEED_DEMO_PASSWORD;

  if (configured === undefined || configured.trim() === "") {
    return { password: `Demo-${randomBytes(9).toString("base64url")}`, generated: true };
  }

  if (configured.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_DEMO_PASSWORD must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    );
  }

  return { password: configured, generated: false };
}

async function upsertOrganization(input: {
  code: string;
  name: string;
  kind: string;
}): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO organizations (code, name, kind)
     VALUES ($1, $2, $3::organization_kind)
     ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name, kind = EXCLUDED.kind
     RETURNING id`,
    [input.code, input.name, input.kind],
  );

  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error(`Failed to seed organization ${input.code}.`);
  return id;
}

/**
 * `ON CONFLICT (email) DO UPDATE` keeps the existing row and its UUID, so an
 * account is promoted in place and every foreign key that already points at it
 * stays valid (D50).
 */
async function upsertUser(input: {
  email: string;
  fullName: string;
  role: string;
  organizationId: string;
  passwordHash: string;
}): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO users (email, full_name, role, organization_id, password_hash, is_active)
     VALUES ($1, $2, $3::user_role, $4, $5, true)
     ON CONFLICT (email) DO UPDATE
       SET full_name       = EXCLUDED.full_name,
           role            = EXCLUDED.role,
           organization_id = EXCLUDED.organization_id,
           password_hash   = EXCLUDED.password_hash,
           is_active       = true,
           updated_at      = now()
     RETURNING id`,
    [input.email, input.fullName, input.role, input.organizationId, input.passwordHash],
  );

  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error(`Failed to seed user ${input.email}.`);
  return id;
}

function dateInDays(days: number): string {
  const target = new Date(Date.now() + days * 86_400_000);
  return target.toISOString().slice(0, 10);
}

async function seedIdentities(passwordHash: string): Promise<Map<string, string>> {
  const organizationIds = new Map<string, string>();

  for (const organization of SEEDED_ORGANIZATIONS) {
    organizationIds.set(
      organization.code,
      await upsertOrganization({ ...organization, kind: organization.kind }),
    );
    console.log(`organization  ${organization.code.padEnd(22)} ${organization.kind}`);
  }

  for (const user of SEEDED_USERS) {
    const organizationId = organizationIds.get(user.organizationCode);
    if (organizationId === undefined) {
      throw new Error(`Unknown organization ${user.organizationCode} for ${user.email}.`);
    }

    await upsertUser({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizationId,
      passwordHash,
    });
    console.log(`user          ${user.email.padEnd(38)} ${user.role}`);
  }

  return organizationIds;
}

async function seedVendors(passwordHash: string): Promise<void> {
  for (const vendor of SEEDED_VENDORS) {
    const organizationId = await upsertOrganization({
      code: vendor.organizationCode,
      name: vendor.organizationName,
      kind: "VENDOR",
    });

    const userId = await upsertUser({
      email: vendor.email,
      fullName: vendor.fullName,
      role: "VENDOR",
      organizationId,
      passwordHash,
    });

    const profile = await createProfile({
      organizationId,
      createdBy: userId,
      legalName: vendor.organizationName,
      primaryContact: {},
    });

    await updateProfileValues(profile.id, vendor.profile);

    // Collections are replaced wholesale so a re-run does not accumulate
    // duplicates of the same demonstration entries.
    await query(`DELETE FROM vendor_offerings WHERE vendor_profile_id = $1`, [profile.id]);
    await query(`DELETE FROM vendor_experience WHERE vendor_profile_id = $1`, [profile.id]);
    await query(`DELETE FROM vendor_credentials WHERE vendor_profile_id = $1`, [profile.id]);

    for (const offering of vendor.offerings) {
      await createOffering(profile.id, { ...offering, description: offering.description });
    }

    for (const entry of vendor.experience) {
      await createExperience(profile.id, { ...entry, referenceUrl: null });
    }

    for (const credential of vendor.credentials) {
      await createCredential(profile.id, {
        ...credential,
        identifier: null,
        issuedOn: null,
        validUntil: null,
        notes: null,
      });
    }

    // Runs the same derivation the API runs after any profile write, so the
    // completion percentage and capability document a seeded supplier carries
    // are computed exactly as a real one's would be.
    const full = await refreshDerivedState(profile.id);

    await query(
      `UPDATE vendor_profiles
       SET status             = $2::vendor_profile_status,
           verification_state = $3::vendor_verification_state,
           submitted_at       = CASE WHEN $2 = 'DRAFT' THEN NULL ELSE COALESCE(submitted_at, now()) END,
           verified_at        = CASE WHEN $3 = 'VERIFIED' THEN COALESCE(verified_at, now()) ELSE NULL END
       WHERE id = $1`,
      [profile.id, vendor.status, vendor.verificationState],
    );

    console.log(
      `supplier      ${vendor.email.padEnd(38)} ${String(full.completion.percentage).padStart(3)}% ${vendor.verificationState}`,
    );
  }
}

async function seedOpportunities(organizationIds: Map<string, string>): Promise<void> {
  for (const opportunity of SEEDED_OPPORTUNITIES) {
    const organizationId = organizationIds.get(opportunity.organizationCode);
    if (organizationId === undefined) {
      throw new Error(`Unknown organization ${opportunity.organizationCode}.`);
    }

    // Attributed to a real official of the owning department, so the record is
    // consistent with one an official would have created (D50).
    const official = await query<{ id: string }>(
      `SELECT id FROM users
       WHERE organization_id = $1 AND role = 'GOVERNMENT_OFFICIAL'
       ORDER BY created_at LIMIT 1`,
      [organizationId],
    );

    const officialId = official.rows[0]?.id;
    if (officialId === undefined) {
      throw new Error(`No government official seeded for ${opportunity.organizationCode}.`);
    }

    const deadline =
      opportunity.deadlineInDays === null ? null : dateInDays(opportunity.deadlineInDays);

    const inserted = await query<{ id: string }>(
      `INSERT INTO procurement_projects
         (reference_number, organization_id, created_by, title, problem_description, status,
          published_at, published_by, opportunity_summary, response_deadline)
       VALUES ($1, $2::uuid, $3::uuid, $4, $5, 'REQUIREMENTS_CONFIRMED',
               CASE WHEN $6::boolean THEN now() ELSE NULL END,
               CASE WHEN $6::boolean THEN $3::uuid ELSE NULL END, $7, $8::date)
       ON CONFLICT (reference_number) DO UPDATE
         SET title               = EXCLUDED.title,
             problem_description = EXCLUDED.problem_description,
             status              = EXCLUDED.status,
             published_at        = EXCLUDED.published_at,
             published_by        = EXCLUDED.published_by,
             opportunity_summary = EXCLUDED.opportunity_summary,
             response_deadline   = EXCLUDED.response_deadline,
             updated_at          = now()
       RETURNING id`,
      [
        opportunity.referenceNumber,
        organizationId,
        officialId,
        opportunity.title,
        opportunity.problemDescription,
        opportunity.published,
        opportunity.opportunitySummary,
        deadline,
      ],
    );

    const projectId = inserted.rows[0]?.id;
    if (projectId === undefined) {
      throw new Error(`Failed to seed opportunity ${opportunity.referenceNumber}.`);
    }

    await query(`DELETE FROM project_requirements WHERE project_id = $1`, [projectId]);

    for (const requirement of opportunity.requirements) {
      await query(
        `INSERT INTO project_requirements
           (project_id, kind, category, text, source, status, decided_by, decided_at)
         VALUES ($1, $2::requirement_kind, $3::requirement_category, $4,
                 'MANUAL', 'ACCEPTED', $5, now())`,
        [projectId, requirement.kind, requirement.category, requirement.text, officialId],
      );
    }

    const history = await query<{ id: string }>(
      `SELECT id FROM project_stage_history
       WHERE project_id = $1 AND to_status = 'REQUIREMENTS_CONFIRMED'`,
      [projectId],
    );

    if (history.rows.length === 0) {
      await query(
        `INSERT INTO project_stage_history (project_id, from_status, to_status, actor_id, reason)
         VALUES ($1, 'REQUIREMENTS_ANALYSIS', 'REQUIREMENTS_CONFIRMED', $2, $3)`,
        [projectId, officialId, "Requirements confirmed (demonstration data)."],
      );
    }

    console.log(
      `opportunity   ${opportunity.referenceNumber.padEnd(38)} ` +
        `${opportunity.published ? "published" : "internal "} ${opportunity.requirements.length} requirement(s)`,
    );
  }
}

async function run(): Promise<void> {
  // Populates process.env from apps/api/.env before SEED_DEMO_PASSWORD is read.
  loadConfig();
  assertNotProduction();

  const { password, generated } = resolvePassword();
  const passwordHash = await hashPassword(password);

  const organizationIds = await seedIdentities(passwordHash);
  console.log("");

  await seedVendors(passwordHash);
  console.log("");

  await seedOpportunities(organizationIds);
  console.log("");

  console.log(
    `Seeded ${SEEDED_ORGANIZATIONS.length + SEEDED_VENDORS.length} organizations, ` +
      `${SEEDED_USERS.length + SEEDED_VENDORS.length} users, ` +
      `${SEEDED_VENDORS.length} supplier profiles and ` +
      `${SEEDED_OPPORTUNITIES.length} procurement projects.`,
  );
  console.log("All demo accounts share one password; re-run this script to reset it.");

  if (generated) {
    console.log("");
    console.log(`  Generated password: ${password}`);
    console.log("  It is not stored anywhere. Set SEED_DEMO_PASSWORD in apps/api/.env");
    console.log("  to choose your own, then re-run this script.");
  } else {
    console.log("Password taken from SEED_DEMO_PASSWORD.");
  }
}

run()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error((error as Error).message);
    await closePool();
    process.exit(1);
  });
