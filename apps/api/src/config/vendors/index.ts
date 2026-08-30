import { SEEDED_VENDORS } from "../seedVendors.js";
import { mergeValues } from "../../vendor/profileValues.js";
import { AGRICULTURE_VENDORS } from "./agricultureFoodChain.js";
import { CONSTRUCTION_VENDORS } from "./constructionInfrastructure.js";
import { ENERGY_ENVIRONMENT_VENDORS } from "./energyEnvironment.js";
import { EXISTING_VENDOR_UPGRADES } from "./existingVendorUpgrades.js";
import { MANUFACTURING_VENDORS } from "./manufacturingIndustrial.js";
import { SERVICES_VENDORS } from "./servicesDigitalSocial.js";

import type { CatalogueExperience, CatalogueVendor } from "./types.js";

export type { CatalogueVendor } from "./types.js";

/**
 * The fifty demonstration suppliers added for the expanded registry.
 *
 * They span the sectors an Indian government department actually buys from —
 * foundries and pipe extruders, farmer producer companies and cold chain
 * operators, road and water contractors, solar and waste enterprises, medical
 * equipment makers, skilling institutes, laboratories and software firms — and
 * they are not variations of one another. Scale runs from a twelve-person
 * self-help group federation to a company employing over a thousand, coverage
 * from a single district to national, and contract-value bands across four
 * orders of magnitude.
 *
 * That variation is deliberate and is what makes the registry useful for
 * testing work-package matching. Every supplier here is fully registered, fully
 * onboarded and administrator-verified; what differs between them is their
 * actual capability, coverage, credentials and capacity, so a supplier the
 * eligibility gate excludes is excluded on the merits rather than because its
 * profile was left half-finished. Each entry records in `matchingRole` what it
 * is expected to demonstrate.
 */
export const NEW_VENDOR_CATALOGUE: readonly CatalogueVendor[] = [
  ...MANUFACTURING_VENDORS,
  ...AGRICULTURE_VENDORS,
  ...CONSTRUCTION_VENDORS,
  ...ENERGY_ENVIRONMENT_VENDORS,
  ...SERVICES_VENDORS,
];

/**
 * The original demonstration suppliers, completed rather than replaced.
 *
 * `seedVendors.ts` stays the source of their identity, their sector and their
 * capability prose; `existingVendorUpgrades.ts` supplies only what the
 * onboarding schema found missing. Merging the two here means there is one
 * catalogue for the seeder to walk and no supplier that is written or verified
 * differently from any other.
 *
 * A seeded supplier without an upgrade entry would be carried through as-is and
 * would then fail the seeder's 100% completion check, which is the intended
 * behaviour: adding a supplier to `seedVendors.ts` without completing it should
 * fail loudly rather than quietly produce a half-finished profile.
 */
export const UPGRADED_EXISTING_VENDORS: readonly CatalogueVendor[] = SEEDED_VENDORS.map(
  (vendor) => {
    const upgrade = EXISTING_VENDOR_UPGRADES[vendor.organizationCode];

    return {
      organizationCode: vendor.organizationCode,
      organizationName: vendor.organizationName,
      email: vendor.email,
      fullName: vendor.fullName,
      profile:
        upgrade === undefined
          ? vendor.profile
          : mergeValues(vendor.profile, upgrade.profile),
      // The original collections win wherever they exist; an upgrade may only
      // supply them for a seeded supplier that has none of its own.
      offerings:
        vendor.offerings.length > 0
          ? vendor.offerings.map((offering) => ({ ...offering }))
          : (upgrade?.offerings ?? []),
      experience:
        vendor.experience.length > 0
          ? vendor.experience.map((entry) => ({
              ...entry,
              clientType: entry.clientType as CatalogueExperience["clientType"],
            }))
          : (upgrade?.experience ?? []),
      credentials:
        vendor.credentials.length > 0
          ? vendor.credentials.map((credential) => ({
              kind: credential.kind as CatalogueVendor["credentials"][number]["kind"],
              name: credential.name,
              issuingAuthority: credential.issuingAuthority,
              identifier: null,
              issuedOn: null,
              validUntil: null,
              notes: null,
            }))
          : (upgrade?.credentials ?? []),
      documents: upgrade?.documents ?? [],
      verificationNotes:
        upgrade?.verificationNotes ??
        "Registration and tax particulars checked against the declared details.",
      matchingRole: upgrade?.matchingRole ?? "Original demonstration supplier.",
    } satisfies CatalogueVendor;
  },
);

/**
 * Every demonstration supplier the seeder writes, original and new.
 *
 * Ordered with the originals first so a seed run reports them in the sequence a
 * reader of `seedVendors.ts` expects.
 */
export const VENDOR_CATALOGUE: readonly CatalogueVendor[] = [
  ...UPGRADED_EXISTING_VENDORS,
  ...NEW_VENDOR_CATALOGUE,
];
