/**
 * The deterministic eligibility gate.
 *
 * This runs before ranking and is not a score. A supplier who cannot satisfy a
 * mandatory requirement is excluded and stays excluded — it is never expressed
 * as a lower position in the list, because a procurement officer reading a
 * ranking is entitled to assume everything in it could lawfully be engaged
 * (see ../../docs/ai/evaluation-and-ranking.md).
 *
 * Every check states the requirement it enforces and where that requirement was
 * written. A dimension with no stated requirement produces no check at all: an
 * absent constraint is not a satisfied one, and reporting it as passed would
 * read as assurance the data cannot support.
 */

import type { CandidateVendor } from "./candidate.js";
import type { NormalizedWorkPackage } from "./normalization.js";
import { credentialSatisfies, formatInr } from "./requirementSignals.js";

/** Bumped when the checks themselves change (provenance). */
export const ELIGIBILITY_VERSION = 1;

export type EligibilityCheckCode =
  | "PROFILE_ASSESSABLE"
  | "VERIFICATION_NOT_REJECTED"
  | "MANDATORY_CERTIFICATION"
  | "CREDENTIAL_VALIDITY"
  | "DELIVERY_REGION"
  | "CONTRACT_VALUE_CEILING";

export interface EligibilityCheck {
  code: EligibilityCheckCode;
  label: string;
  /** What the work package requires. Quoted from the source where there is one. */
  requirement: string;
  /** What the supplier's record says. */
  evidence: string;
}

export interface EligibilityWarning {
  code: string;
  label: string;
  detail: string;
}

export interface EligibilityResult {
  eligible: boolean;
  passedChecks: EligibilityCheck[];
  failedChecks: EligibilityCheck[];
  warnings: EligibilityWarning[];
  eligibilityVersion: number;
}

/**
 * A profile with almost nothing in it cannot be assessed either way. Excluding
 * it is the honest outcome: ranking it would present an absence of information
 * as an absence of capability, and both the officer and the supplier would be
 * misled.
 */
const MINIMUM_ASSESSABLE_COMPLETION = 40;

/** Coverage values that confine a supplier to states they have named. */
const REGION_LIMITED_COVERAGE = new Set(["SINGLE_DISTRICT", "STATE"]);

/** A credential expiring within this window is flagged, not excluded. */
const EXPIRY_WARNING_DAYS = 180;

function credentialText(credential: CandidateVendor["credentials"][number]): string {
  return [credential.name, credential.issuingAuthority ?? "", credential.kind].join(" ");
}

/**
 * Whole days from today to an expiry date, both taken as calendar dates.
 *
 * Comparing a date against a timestamp is what produced the original bug: a
 * credential expiring today, evaluated in the afternoon, came out as -1 day and
 * was reported expired. A credential is valid for the whole of its final day,
 * so both sides are reduced to a calendar day before subtracting, and the
 * result is exact rather than rounded.
 */
function daysUntil(isoDate: string, now: Date): number {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return 0;

  const expiry = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return (expiry - today) / 86_400_000;
}

export function evaluateEligibility(
  workPackage: NormalizedWorkPackage,
  vendor: CandidateVendor,
  now: Date = new Date(),
): EligibilityResult {
  const passed: EligibilityCheck[] = [];
  const failed: EligibilityCheck[] = [];
  const warnings: EligibilityWarning[] = [];

  // ---- Assessability ------------------------------------------------------
  const assessable = vendor.completionPercentage >= MINIMUM_ASSESSABLE_COMPLETION;
  (assessable ? passed : failed).push({
    code: "PROFILE_ASSESSABLE",
    label: "Capability profile is complete enough to assess",
    requirement: `A supplier's profile must be at least ${MINIMUM_ASSESSABLE_COMPLETION}% complete before it can be assessed against a work package.`,
    evidence: `Profile is ${vendor.completionPercentage}% complete.`,
  });

  // ---- Verification -------------------------------------------------------
  const rejected = vendor.verificationState === "REJECTED";
  (rejected ? failed : passed).push({
    code: "VERIFICATION_NOT_REJECTED",
    label: "Supplier is not rejected in verification",
    requirement: "A supplier whose verification has been rejected cannot be engaged.",
    evidence: `Verification state is ${vendor.verificationState}.`,
  });

  if (vendor.verificationState !== "VERIFIED" && !rejected) {
    warnings.push({
      code: "NOT_YET_VERIFIED",
      label: "Verification not yet complete",
      detail:
        vendor.verificationState === "PENDING"
          ? "Supporting documents have been submitted but not yet reviewed by the portal administration."
          : "This supplier has not submitted documents for verification. Their recorded details are unconfirmed.",
    });
  }

  // ---- Mandatory certifications ------------------------------------------
  for (const required of workPackage.mandatoryCertifications) {
    const holder = vendor.credentials.find((credential) =>
      credentialSatisfies(required.code, credentialText(credential)),
    );

    if (holder === undefined) {
      failed.push({
        code: "MANDATORY_CERTIFICATION",
        label: `Mandatory credential: ${required.label}`,
        requirement: `Required by this work package: "${required.sourceText}"`,
        evidence: "No matching credential is recorded on this supplier's profile.",
      });
      continue;
    }

    // An expired mandatory credential is not held. This is the one place where
    // a date decides eligibility rather than merely colouring it.
    if (holder.validUntil !== null && daysUntil(holder.validUntil, now) < 0) {
      failed.push({
        code: "CREDENTIAL_VALIDITY",
        label: `Mandatory credential expired: ${required.label}`,
        requirement: `Required by this work package: "${required.sourceText}"`,
        evidence: `"${holder.name}" expired on ${holder.validUntil.slice(0, 10)}.`,
      });
      continue;
    }

    passed.push({
      code: "MANDATORY_CERTIFICATION",
      label: `Mandatory credential: ${required.label}`,
      requirement: `Required by this work package: "${required.sourceText}"`,
      evidence:
        `Holds "${holder.name}"` +
        (holder.issuingAuthority === null ? "" : ` issued by ${holder.issuingAuthority}`) +
        (holder.verificationState === "VERIFIED" ? " (verified)." : "."),
    });

    if (holder.validUntil !== null) {
      const remaining = daysUntil(holder.validUntil, now);
      if (remaining >= 0 && remaining <= EXPIRY_WARNING_DAYS) {
        warnings.push({
          code: "CREDENTIAL_EXPIRING",
          label: `${required.label} expires soon`,
          detail: `"${holder.name}" expires on ${holder.validUntil.slice(0, 10)} (${remaining} day(s) from now).`,
        });
      }
    }
  }

  // ---- Delivery region ----------------------------------------------------
  if (workPackage.requiredRegions.length > 0) {
    const operating = new Set(
      vendor.operatingStates.map((state) => state.trim().toLowerCase()),
    );
    const covered = workPackage.requiredRegions.filter((region) =>
      operating.has(region.toLowerCase()),
    );
    const regionLimited = REGION_LIMITED_COVERAGE.has(vendor.serviceCoverage ?? "");

    if (regionLimited && covered.length === 0) {
      failed.push({
        code: "DELIVERY_REGION",
        label: "Delivery region",
        requirement: `Delivery is in ${workPackage.requiredRegions.join(", ")}.`,
        evidence:
          vendor.operatingStates.length === 0
            ? `Declared coverage is ${vendor.serviceCoverage}, and no operating states are recorded.`
            : `Declared coverage is ${vendor.serviceCoverage}, limited to ${vendor.operatingStates.join(", ")}.`,
      });
    } else {
      passed.push({
        code: "DELIVERY_REGION",
        label: "Delivery region",
        requirement: `Delivery is in ${workPackage.requiredRegions.join(", ")}.`,
        evidence:
          covered.length > 0
            ? `Operates in ${covered.join(", ")}.`
            : `Declared coverage is ${vendor.serviceCoverage ?? "not stated"}, which is not limited to specific states.`,
      });

      if (covered.length === 0) {
        warnings.push({
          code: "REGION_NOT_NAMED",
          label: "Required state not named in the supplier's operating states",
          detail: `The supplier's declared coverage is wide enough to include ${workPackage.requiredRegions.join(", ")}, but they have not listed it among the states they operate in.`,
        });
      }
    }
  }

  // ---- Contract value -----------------------------------------------------
  const ceiling = workPackage.estimatedValueCeilingInr;
  if (ceiling !== null && vendor.maxProjectValueInr !== null) {
    const withinCapacity = vendor.maxProjectValueInr >= ceiling;
    (withinCapacity ? passed : failed).push({
      code: "CONTRACT_VALUE_CEILING",
      label: "Contract value within stated capacity",
      requirement: `The work package states a value of up to ${formatInr(ceiling)}.`,
      evidence: `The supplier states a maximum project value of ${formatInr(vendor.maxProjectValueInr)}.`,
    });
  }

  if (
    ceiling !== null &&
    vendor.minProjectValueInr !== null &&
    vendor.minProjectValueInr > ceiling
  ) {
    warnings.push({
      code: "BELOW_MINIMUM_VALUE",
      label: "Package is smaller than the supplier's minimum engagement",
      detail: `The supplier states a minimum project value of ${formatInr(vendor.minProjectValueInr)}, above this package's stated ${formatInr(ceiling)}. They may decline to bid.`,
    });
  }

  return {
    eligible: failed.length === 0,
    passedChecks: passed,
    failedChecks: failed,
    warnings,
    eligibilityVersion: ELIGIBILITY_VERSION,
  };
}
