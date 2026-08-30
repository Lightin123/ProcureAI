import { randomBytes } from "node:crypto";

import { hashPassword } from "../src/auth/password.js";
import { loadConfig } from "../src/config/env.js";
import { SEEDED_ORGANIZATIONS, SEEDED_USERS } from "../src/config/seedIdentity.js";
import { SEEDED_OPPORTUNITIES } from "../src/config/seedOpportunities.js";
import { VENDOR_CATALOGUE } from "../src/config/vendors/index.js";
import { SEEDED_DECOMPOSED_PROJECTS } from "../src/config/seedWorkPackages.js";
import { closePool, query } from "../src/db/pool.js";
import {
  resolveAdministratorId,
  seedCatalogueVendor,
  upsertOrganization,
  upsertUser,
} from "./vendorSeeding.js";

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

/**
 * Writes every demonstration supplier through the shared catalogue routine.
 *
 * The original eight and the fifty added for the expanded registry go through
 * the same code, so no supplier is onboarded, documented or verified
 * differently from any other. Each one is validated against the API's own patch
 * schema before it is written and checked for 100% completion afterwards, so a
 * catalogue entry that would produce a half-finished profile fails the seed
 * rather than landing in the registry.
 */
async function seedVendorCatalogue(passwordHash: string): Promise<void> {
  const administratorId = await resolveAdministratorId();

  for (const vendor of VENDOR_CATALOGUE) {
    const outcome = await seedCatalogueVendor(vendor, { passwordHash, administratorId });

    console.log(
      `supplier      ${vendor.email.padEnd(44)} ` +
        `${String(outcome.completionPercentage).padStart(3)}% VERIFIED  ` +
        `off ${outcome.offerings} exp ${outcome.experience} ` +
        `cred ${outcome.credentials} doc ${outcome.documents} ` +
        `kw ${String(outcome.keywords).padStart(3)}`,
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

/**
 * A confirmed, decomposed project so work-package vendor matching has something
 * to run against on a fresh database.
 *
 * Idempotent in the same way the other seeders are: the project is upserted on
 * its reference number, and its requirements and work packages are replaced
 * wholesale so a re-run cannot accumulate duplicates. Deleting the packages
 * cascades to their match runs and results, which is correct — a stored ranking
 * describes a package that no longer exists.
 */
async function seedWorkPackages(organizationIds: Map<string, string>): Promise<void> {
  for (const project of SEEDED_DECOMPOSED_PROJECTS) {
    const organizationId = organizationIds.get(project.organizationCode);
    if (organizationId === undefined) {
      throw new Error(`Unknown organization ${project.organizationCode}.`);
    }

    const official = await query<{ id: string }>(
      `SELECT id FROM users
       WHERE organization_id = $1 AND role = 'GOVERNMENT_OFFICIAL'
       ORDER BY created_at LIMIT 1`,
      [organizationId],
    );

    const officialId = official.rows[0]?.id;
    if (officialId === undefined) {
      throw new Error(`No government official seeded for ${project.organizationCode}.`);
    }

    const inserted = await query<{ id: string }>(
      `INSERT INTO procurement_projects
         (reference_number, organization_id, created_by, title, problem_description, status)
       VALUES ($1, $2::uuid, $3::uuid, $4, $5, 'WORK_PACKAGES_CONFIRMED')
       ON CONFLICT (reference_number) DO UPDATE
         SET title               = EXCLUDED.title,
             problem_description = EXCLUDED.problem_description,
             status              = EXCLUDED.status,
             updated_at          = now()
       RETURNING id`,
      [
        project.referenceNumber,
        organizationId,
        officialId,
        project.title,
        project.problemDescription,
      ],
    );

    const projectId = inserted.rows[0]?.id;
    if (projectId === undefined) {
      throw new Error(`Failed to seed project ${project.referenceNumber}.`);
    }

    await query(`DELETE FROM work_packages WHERE project_id = $1`, [projectId]);
    await query(`DELETE FROM project_requirements WHERE project_id = $1`, [projectId]);

    let confirmedCount = 0;

    for (const workPackage of project.workPackages) {
      const packageRow = await query<{ id: string }>(
        `INSERT INTO work_packages
           (project_id, package_number, title, description, scope, complexity, priority,
            estimated_category, deliverables, status, source, display_order, decided_by, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6::work_package_complexity, $7::work_package_priority,
                 $8, $9::text[], $10::work_package_status, 'MANUAL', $11, $12,
                 CASE WHEN $10 = 'CONFIRMED' THEN now() ELSE NULL END)
         RETURNING id`,
        [
          projectId,
          workPackage.packageNumber,
          workPackage.title,
          workPackage.description,
          workPackage.scope,
          workPackage.complexity,
          workPackage.priority,
          workPackage.estimatedCategory,
          workPackage.deliverables,
          workPackage.status,
          workPackage.displayOrder,
          officialId,
        ],
      );

      const workPackageId = packageRow.rows[0]?.id;
      if (workPackageId === undefined) {
        throw new Error(`Failed to seed ${workPackage.packageNumber}.`);
      }

      // Requirements belong to the project and are linked to the package
      // through the junction, exactly as the decomposition flow creates them.
      for (const requirement of workPackage.requirements) {
        const requirementRow = await query<{ id: string }>(
          `INSERT INTO project_requirements
             (project_id, kind, category, text, source, status, decided_by, decided_at)
           VALUES ($1, $2::requirement_kind, $3::requirement_category, $4,
                   'MANUAL', 'ACCEPTED', $5, now())
           RETURNING id`,
          [projectId, requirement.kind, requirement.category, requirement.text, officialId],
        );

        const requirementId = requirementRow.rows[0]?.id;
        if (requirementId === undefined) continue;

        await query(
          `INSERT INTO work_package_requirements (work_package_id, requirement_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [workPackageId, requirementId],
        );
      }

      if (workPackage.status === "CONFIRMED") confirmedCount += 1;
    }

    const history = await query<{ id: string }>(
      `SELECT id FROM project_stage_history
       WHERE project_id = $1 AND to_status = 'WORK_PACKAGES_CONFIRMED'`,
      [projectId],
    );

    if (history.rows.length === 0) {
      await query(
        `INSERT INTO project_stage_history (project_id, from_status, to_status, actor_id, reason)
         VALUES ($1, 'WORK_PACKAGES_UNDER_REVIEW', 'WORK_PACKAGES_CONFIRMED', $2, $3)`,
        [projectId, officialId, "Work packages confirmed (demonstration data)."],
      );
    }

    console.log(
      `project       ${project.referenceNumber.padEnd(38)} ` +
        `${project.workPackages.length} work package(s), ${confirmedCount} confirmed`,
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

  await seedVendorCatalogue(passwordHash);
  console.log("");

  await seedOpportunities(organizationIds);
  console.log("");

  await seedWorkPackages(organizationIds);
  console.log("");

  console.log(
    `Seeded ${SEEDED_ORGANIZATIONS.length + VENDOR_CATALOGUE.length} organizations, ` +
      `${SEEDED_USERS.length + VENDOR_CATALOGUE.length} users, ` +
      `${VENDOR_CATALOGUE.length} verified supplier profiles and ` +
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
