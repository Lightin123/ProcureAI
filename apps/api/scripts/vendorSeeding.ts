/**
 * Writing a demonstration supplier into the database the way the portal would.
 *
 * Shared by `seed.ts` and by `seedVendors.ts`, and deliberately not a set of
 * raw INSERTs: every step below goes through the repository or service the
 * running API uses for the same act, so a seeded supplier is not a special
 * case anywhere downstream.
 *
 *   register            -> organizations, users            (upserted on code / email)
 *   onboard             -> updateProfileValues             (validated first)
 *   portfolio           -> createOffering / Experience / Credential
 *   compliance          -> storeDocument + createDocument  (real bytes on disk)
 *   derive              -> refreshDerivedState             (completion, capability, keywords)
 *   submit              -> submitProfileForVerification
 *   administrator       -> recordDocumentReview, recordVerificationDecision
 *   notify              -> createNotification              (as the routes do)
 *
 * Idempotent throughout. Collections, documents and the supplier's own
 * lifecycle notifications are replaced rather than appended, so re-running
 * converges on the same state instead of accumulating. Nothing outside the
 * supplier's own rows is touched: projects, work packages, invitations,
 * responses and evaluations are never read or written here.
 */

import { query } from "../src/db/pool.js";
import {
  createCredential,
  createExperience,
  createOffering,
} from "../src/repositories/vendorPortfolio.js";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  recordDocumentReview,
} from "../src/repositories/vendorDocuments.js";
import { createNotification } from "../src/repositories/vendorNotifications.js";
import {
  createProfile,
  recordVerificationDecision,
  submitProfileForVerification,
  updateProfileValues,
} from "../src/repositories/vendorProfiles.js";
import { ONBOARDING_STEPS } from "../src/vendor/onboardingSchema.js";
import { profilePatchSchema } from "../src/vendor/profileValues.js";
import { refreshDerivedState } from "../src/vendor/profileService.js";
import { removeDocument, storeDocument } from "../src/vendor/documentStorage.js";
import { buildComplianceDocument } from "./demoDocument.js";

import type { CatalogueVendor } from "../src/config/vendors/types.js";

/** Every conditional question the onboarding schema declares, across all steps. */
const DECLARED_DYNAMIC_KEYS = new Set(
  ONBOARDING_STEPS.flatMap((step) =>
    step.groups.flatMap((group) =>
      group.fields
        .filter((field) => field.path.startsWith("dynamicAnswers."))
        .map((field) => field.path.slice("dynamicAnswers.".length)),
    ),
  ),
);

/**
 * jsonb columns are merged key-by-key on write, which is what the portal wants
 * — a step saves only its own fields. A re-seed wants replacement instead, so a
 * key removed from the catalogue does not survive from the previous run.
 */
const JSONB_COLUMNS = [
  "identifiers",
  "eligibility",
  "registered_address",
  "primary_contact",
  "authorised_representative",
  "dynamic_answers",
];

export async function upsertOrganization(input: {
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
 * account is updated in place and every foreign key that already points at it
 * stays valid (D50) — including invitations and responses a demonstration
 * supplier has already been part of.
 */
export async function upsertUser(input: {
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

/**
 * Checks a catalogue entry against the same rules a real submission passes.
 *
 * Runs before anything is written, so a taxonomy typo or an undeclared
 * conditional question fails the seed with a readable message rather than
 * producing a supplier the portal cannot render.
 */
export function validateCatalogueProfile(vendor: CatalogueVendor): void {
  const parsed = profilePatchSchema.safeParse(vendor.profile);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`${vendor.organizationCode}: profile is not valid — ${detail}`);
  }

  const dynamic = vendor.profile.dynamicAnswers;
  if (typeof dynamic === "object" && dynamic !== null) {
    const unknown = Object.keys(dynamic).filter((key) => !DECLARED_DYNAMIC_KEYS.has(key));
    if (unknown.length > 0) {
      throw new Error(
        `${vendor.organizationCode}: dynamicAnswers contains questions the onboarding schema ` +
          `does not declare — ${unknown.join(", ")}`,
      );
    }
  }
}

export interface SeededVendorOutcome {
  organizationCode: string;
  profileId: string;
  userId: string;
  completionPercentage: number;
  offerings: number;
  experience: number;
  credentials: number;
  documents: number;
  keywords: number;
  capabilityDocumentLength: number;
}

/**
 * Writes one supplier and returns what was actually produced.
 *
 * Throws if the resulting profile is not 100% complete: a demonstration
 * registry whose suppliers are quietly 94% complete is a registry that will
 * behave differently from the one the dataset claims to be, and the eligibility
 * gate reads the completion percentage directly.
 */
export async function seedCatalogueVendor(
  vendor: CatalogueVendor,
  context: { passwordHash: string; administratorId: string },
): Promise<SeededVendorOutcome> {
  validateCatalogueProfile(vendor);

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
    passwordHash: context.passwordHash,
  });

  const profile = await createProfile({
    organizationId,
    createdBy: userId,
    legalName: vendor.organizationName,
    primaryContact: {},
  });

  // Replacement rather than merge, so the catalogue is the whole truth about
  // this supplier on every run.
  await query(
    `UPDATE vendor_profiles
     SET ${JSONB_COLUMNS.map((column) => `${column} = '{}'::jsonb`).join(", ")}
     WHERE id = $1`,
    [profile.id],
  );

  await query(`DELETE FROM vendor_offerings WHERE vendor_profile_id = $1`, [profile.id]);
  await query(`DELETE FROM vendor_experience WHERE vendor_profile_id = $1`, [profile.id]);
  await query(`DELETE FROM vendor_credentials WHERE vendor_profile_id = $1`, [profile.id]);

  // Documents carry bytes on disk, so the rows and the files go together.
  for (const existing of await listDocuments(profile.id)) {
    const storageKey = await deleteDocument(profile.id, existing.id);
    if (storageKey !== undefined) await removeDocument(storageKey);
  }

  // Only the supplier's own lifecycle notifications are cleared. Invitation and
  // response notifications belong to procurement data this script does not own.
  await query(
    `DELETE FROM vendor_notifications
     WHERE vendor_profile_id = $1
       AND category IN ('REGISTRATION', 'PROFILE', 'VERIFICATION', 'DOCUMENT')`,
    [profile.id],
  );

  await query(
    `UPDATE vendor_profiles SET status = 'DRAFT', verification_state = 'UNVERIFIED',
       submitted_at = NULL, verified_at = NULL, verified_by = NULL, verification_notes = NULL
     WHERE id = $1`,
    [profile.id],
  );

  await updateProfileValues(profile.id, vendor.profile);

  for (const offering of vendor.offerings) {
    await createOffering(profile.id, offering);
  }

  for (const entry of vendor.experience) {
    await createExperience(profile.id, { ...entry, referenceUrl: null });
  }

  for (const credential of vendor.credentials) {
    await createCredential(profile.id, credential);
  }

  const documentIds: Array<{ id: string; title: string }> = [];

  for (const document of vendor.documents) {
    const bytes = buildComplianceDocument({
      documentType: document.documentType,
      title: document.title,
      organizationName: vendor.organizationName,
      referenceNumber: document.referenceNumber,
      issuedOn: document.issuedOn,
      validUntil: document.validUntil,
      body: document.body,
    });

    const stored = await storeDocument({
      base64: bytes.toString("base64"),
      mimeType: "application/pdf",
    });

    const created = await createDocument(profile.id, {
      documentType: document.documentType,
      title: document.title,
      fileName: `${document.documentType.toLowerCase().replace(/_/g, "-")}-demo.pdf`,
      mimeType: "application/pdf",
      sizeBytes: stored.sizeBytes,
      storageKey: stored.storageKey,
      referenceNumber: document.referenceNumber,
      issuedOn: document.issuedOn,
      validUntil: document.validUntil,
      uploadedBy: userId,
    });

    documentIds.push({ id: created.id, title: created.title });
  }

  // The same derivation the API runs after any profile write: completion, the
  // capability document, the keyword set and the semantic document the
  // embedding is built from.
  const full = await refreshDerivedState(profile.id);

  if (full.completion.percentage !== 100) {
    const missing = full.completion.missingRequired.map((item) => item.path);
    const partial = full.completion.sections
      .filter((section) => section.optionalAnswered < section.optionalTotal)
      .map(
        (section) =>
          `${section.id} (${section.optionalAnswered}/${section.optionalTotal} optional)`,
      );

    throw new Error(
      `${vendor.organizationCode}: profile is ${full.completion.percentage}% complete, not 100%. ` +
        (missing.length > 0 ? `Missing required: ${missing.join(", ")}. ` : "") +
        (partial.length > 0 ? `Incomplete sections: ${partial.join(", ")}.` : ""),
    );
  }

  await createNotification({
    profileId: profile.id,
    category: "REGISTRATION",
    title: "Supplier account created",
    body:
      `${vendor.organizationName} was registered on the ProcureAI supplier portal. ` +
      "Complete your capability profile to be matched against published work packages.",
    linkPath: "/vendor/onboarding",
  });

  await submitProfileForVerification(profile.id);

  await createNotification({
    profileId: profile.id,
    category: "PROFILE",
    title: "Capability profile submitted for verification",
    body:
      "Your capability profile has been submitted. The portal administration will review your " +
      "compliance documents and confirm your verification state.",
    linkPath: "/vendor/profile",
  });

  for (const document of documentIds) {
    await recordDocumentReview({
      documentId: document.id,
      verificationState: "VERIFIED",
      notes: "Checked against the supplier's declared particulars. Demonstration data.",
      reviewedBy: context.administratorId,
    });

    await createNotification({
      profileId: profile.id,
      category: "DOCUMENT",
      title: `Document reviewed: ${document.title}`,
      body: "The document has been verified.",
      linkPath: "/vendor/profile",
    });
  }

  await recordVerificationDecision({
    profileId: profile.id,
    verificationState: "VERIFIED",
    notes: vendor.verificationNotes,
    verifiedBy: context.administratorId,
  });

  await createNotification({
    profileId: profile.id,
    category: "VERIFICATION",
    title: "Capability profile verified",
    body:
      "Your capability profile has been verified. Verified suppliers rank higher in " +
      "opportunity matching and can be shortlisted by departments.",
    linkPath: "/vendor/profile",
  });

  const final = await refreshDerivedState(profile.id);

  return {
    organizationCode: vendor.organizationCode,
    profileId: profile.id,
    userId,
    completionPercentage: final.completion.percentage,
    offerings: final.offerings.length,
    experience: final.experience.length,
    credentials: final.credentials.length,
    documents: final.documents.length,
    keywords: final.profile.capabilityKeywords.length,
    capabilityDocumentLength: (final.profile.capabilityDocument ?? "").length,
  };
}

/** Resolves the administrator whose account records the verification decisions. */
export async function resolveAdministratorId(): Promise<string> {
  const result = await query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1`,
  );

  const id = result.rows[0]?.id;
  if (id === undefined) {
    throw new Error(
      "No administrator account exists. Run the identity seed before seeding suppliers.",
    );
  }

  return id;
}
