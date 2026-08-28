import type { AuthenticatedUser } from "../auth/currentUser.js";
import { ApiError } from "../middleware/errors.js";
import { listDocuments, type VendorDocument } from "../repositories/vendorDocuments.js";
import {
  listCredentials,
  listExperience,
  listOfferings,
  type VendorCredential,
  type VendorExperienceEntry,
  type VendorOffering,
} from "../repositories/vendorPortfolio.js";
import {
  createProfile,
  findProfileByOrganization,
  findProfileById,
  updateDerivedProfileState,
  type VendorProfile,
} from "../repositories/vendorProfiles.js";
import { buildCapabilityDocument } from "./capabilityDocument.js";
import {
  completedSectionIds,
  evaluateCompletion,
  type CollectionCounts,
  type CompletionResult,
} from "./completion.js";
import { toProfileValues } from "./profileValues.js";

export interface FullVendorProfile {
  profile: VendorProfile;
  offerings: VendorOffering[];
  experience: VendorExperienceEntry[];
  credentials: VendorCredential[];
  documents: VendorDocument[];
  completion: CompletionResult;
}

/**
 * Resolves the capability profile for the signed-in vendor representative.
 *
 * A profile is created on first access when one is missing. Accounts created
 * before this milestone — and the seeded demo vendor — therefore land in a
 * working draft rather than an error page, and registration and this path
 * converge on the same state.
 */
export async function loadProfileForUser(user: AuthenticatedUser): Promise<VendorProfile> {
  if (user.organizationKind !== "VENDOR") {
    // Only reachable if the permission table and the organization model ever
    // disagree. Failing here keeps a government user from creating a vendor
    // profile against their own department.
    throw new ApiError(
      403,
      "NOT_A_SUPPLIER_ACCOUNT",
      "This account is not registered against a supplier organisation.",
    );
  }

  const existing = await findProfileByOrganization(user.organizationId);
  if (existing !== undefined) {
    return existing;
  }

  return createProfile({
    organizationId: user.organizationId,
    createdBy: user.id,
    legalName: user.organizationName,
    primaryContact: { name: user.fullName, email: user.email },
  });
}

export async function collectionCounts(profileId: string): Promise<CollectionCounts> {
  const [offerings, experience, credentials, documents] = await Promise.all([
    listOfferings(profileId),
    listExperience(profileId),
    listCredentials(profileId),
    listDocuments(profileId),
  ]);

  return {
    offerings: offerings.length,
    experience: experience.length,
    credentials: credentials.length,
    documents: documents.length,
  };
}

export async function loadFullProfile(profileId: string): Promise<FullVendorProfile> {
  const profile = await findProfileById(profileId);
  if (profile === undefined) {
    throw new ApiError(404, "NOT_FOUND", "The capability profile was not found.");
  }

  const [offerings, experience, credentials, documents] = await Promise.all([
    listOfferings(profileId),
    listExperience(profileId),
    listCredentials(profileId),
    listDocuments(profileId),
  ]);

  const completion = evaluateCompletion(toProfileValues(profile), {
    offerings: offerings.length,
    experience: experience.length,
    credentials: credentials.length,
    documents: documents.length,
  });

  return { profile, offerings, experience, credentials, documents, completion };
}

/**
 * Recomputes everything derived from the profile and writes it back: the
 * completion percentage, which sections are complete, and the capability
 * document and keywords the matching reads.
 *
 * Called after every write — including adding a single product — so the
 * AI-facing representation can never lag behind what the vendor has entered.
 */
export async function refreshDerivedState(
  profileId: string,
  lastSection?: string,
): Promise<FullVendorProfile> {
  const full = await loadFullProfile(profileId);
  const values = toProfileValues(full.profile);

  const capability = buildCapabilityDocument(values, {
    offerings: full.offerings,
    experience: full.experience,
    credentials: full.credentials,
  });

  await updateDerivedProfileState(profileId, {
    completionPercentage: full.completion.percentage,
    completedSections: completedSectionIds(full.completion),
    capabilityDocument: capability.document,
    capabilityKeywords: capability.keywords,
    lastSection,
  });

  return loadFullProfile(profileId);
}
