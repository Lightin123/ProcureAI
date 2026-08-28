import { z } from "zod";

import type { VendorProfile } from "../repositories/vendorProfiles.js";
import type { ProfileValues } from "./completion.js";
import {
  DELIVERY_MODEL_VALUES,
  DEPLOYMENT_READINESS_VALUES,
  GOVERNMENT_EXPERIENCE_VALUES,
  GOVERNMENT_SCALE_READINESS_VALUES,
  INDIAN_STATES,
  INDUSTRY_VALUES,
  INNOVATION_STAGE_VALUES,
  ORGANIZATION_TYPE_VALUES,
  SERVICE_COVERAGE_VALUES,
  SOLUTION_NOVELTY_VALUES,
  SOLUTION_TYPE_VALUES,
} from "./taxonomy.js";

/**
 * The profile as the onboarding schema addresses it: plain nested values, keyed
 * by the same paths the schema's fields declare. Completion tracking and the
 * capability document both read this shape, so they never need to know how the
 * profile is stored.
 */
export function toProfileValues(profile: VendorProfile): ProfileValues {
  return {
    legalName: profile.legalName,
    organizationType: profile.organizationType,
    yearEstablished: profile.yearEstablished,
    registrationNumber: profile.registrationNumber,
    website: profile.website,
    identifiers: profile.identifiers,
    eligibility: profile.eligibility,
    registeredAddress: profile.registeredAddress,
    operatingStates: profile.operatingStates,
    primaryContact: profile.primaryContact,
    authorisedRepresentative: profile.authorisedRepresentative,
    industries: profile.industries,
    subDomains: profile.subDomains,
    solutionTypes: profile.solutionTypes,
    otherSolutionType: profile.otherSolutionType,
    headline: profile.headline,
    capabilitySummary: profile.capabilitySummary,
    coreCapabilities: profile.coreCapabilities,
    expertiseAreas: profile.expertiseAreas,
    problemDomains: profile.problemDomains,
    differentiators: profile.differentiators,
    valueProposition: profile.valueProposition,
    sectorsServed: profile.sectorsServed,
    targetCustomers: profile.targetCustomers,
    deliveryModels: profile.deliveryModels,
    serviceCoverage: profile.serviceCoverage,
    coverageNotes: profile.coverageNotes,
    teamSize: profile.teamSize,
    domainExpertise: profile.domainExpertise,
    capacityNotes: profile.capacityNotes,
    deliveryCapability: profile.deliveryCapability,
    scalabilityNotes: profile.scalabilityNotes,
    infrastructureNotes: profile.infrastructureNotes,
    governmentScaleReadiness: profile.governmentScaleReadiness,
    typicalProjectValueInr: profile.typicalProjectValueInr,
    minProjectValueInr: profile.minProjectValueInr,
    maxProjectValueInr: profile.maxProjectValueInr,
    governmentExperience: profile.governmentExperience,
    gemRegistered: profile.gemRegistered,
    pastTenderExperience: profile.pastTenderExperience,
    portfolioUrl: profile.portfolioUrl,
    solutionNovelty: profile.solutionNovelty,
    innovationStage: profile.innovationStage,
    problemBeingSolved: profile.problemBeingSolved,
    innovationDescription: profile.innovationDescription,
    deploymentReadiness: profile.deploymentReadiness,
    measurableImpact: profile.measurableImpact,
    hasIntellectualProperty: profile.hasIntellectualProperty,
    intellectualPropertyDetails: profile.intellectualPropertyDetails,
    dynamicAnswers: profile.dynamicAnswers,
  };
}

/**
 * Merges a validated patch over the current values so completion and the
 * capability document are computed from what the profile will be, not from what
 * it was. Object-valued fields merge key by key, matching how the repository
 * writes them.
 */
export function mergeValues(current: ProfileValues, patch: Record<string, unknown>): ProfileValues {
  const merged: ProfileValues = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    const existing = merged[key];

    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      merged[key] = { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) };
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

const trimmedText = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) => trimmedText(max).nullable();
const tagList = z.array(z.string().trim().min(1).max(120)).max(40);
const enumOf = (values: readonly string[]) =>
  z.string().refine((value) => values.includes(value), "Value is not a recognised option.");

const contactSchema = z
  .object({
    name: trimmedText(150).optional(),
    designation: trimmedText(150).optional(),
    email: z.union([z.email(), z.literal("")]).optional(),
    phone: trimmedText(30).optional(),
  })
  .strict();

/**
 * Every field a vendor may write, with the taxonomy enforced server-side. The
 * portal renders the same taxonomy, so a value outside it can only come from a
 * client that bypassed the form.
 */
export const profilePatchSchema = z
  .object({
    legalName: trimmedText(200).nullable(),
    organizationType: enumOf(ORGANIZATION_TYPE_VALUES).nullable(),
    yearEstablished: z.number().int().min(1800).max(2100).nullable(),
    registrationNumber: nullableText(100),
    website: z.union([z.url(), z.literal(""), z.null()]),
    identifiers: z
      .object({
        gstin: trimmedText(20).optional(),
        pan: trimmedText(12).optional(),
        cin: trimmedText(30).optional(),
        udyam: trimmedText(30).optional(),
        dpiit: trimmedText(30).optional(),
        gemSellerId: trimmedText(40).optional(),
      })
      .strict(),
    eligibility: z
      .object({
        flags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
        msmeCategory: z.enum(["MICRO", "SMALL", "MEDIUM"]).nullable().optional(),
      })
      .strict(),
    registeredAddress: z
      .object({
        line1: trimmedText(200).optional(),
        line2: trimmedText(200).optional(),
        city: trimmedText(120).optional(),
        district: trimmedText(120).optional(),
        state: z.union([enumOf(INDIAN_STATES), z.literal("")]).optional(),
        pincode: trimmedText(10).optional(),
      })
      .strict(),
    operatingStates: z.array(enumOf(INDIAN_STATES)).max(40),
    primaryContact: contactSchema,
    authorisedRepresentative: contactSchema,

    industries: z.array(enumOf(INDUSTRY_VALUES)).max(10),
    subDomains: tagList,
    solutionTypes: z.array(enumOf(SOLUTION_TYPE_VALUES)).max(12),
    otherSolutionType: nullableText(200),

    headline: nullableText(200),
    capabilitySummary: nullableText(4000),
    coreCapabilities: tagList,
    expertiseAreas: tagList,
    problemDomains: tagList,
    differentiators: nullableText(3000),
    valueProposition: nullableText(3000),
    sectorsServed: tagList,
    targetCustomers: tagList,
    deliveryModels: z.array(enumOf(DELIVERY_MODEL_VALUES)).max(12),
    serviceCoverage: enumOf(SERVICE_COVERAGE_VALUES).nullable(),
    coverageNotes: nullableText(2000),

    teamSize: z.number().int().min(0).max(1_000_000).nullable(),
    domainExpertise: tagList,
    capacityNotes: nullableText(2000),
    deliveryCapability: nullableText(3000),
    scalabilityNotes: nullableText(2000),
    infrastructureNotes: nullableText(2000),
    governmentScaleReadiness: enumOf(GOVERNMENT_SCALE_READINESS_VALUES).nullable(),
    typicalProjectValueInr: z.number().min(0).max(999_999_999_999).nullable(),
    minProjectValueInr: z.number().min(0).max(999_999_999_999).nullable(),
    maxProjectValueInr: z.number().min(0).max(999_999_999_999).nullable(),

    governmentExperience: enumOf(GOVERNMENT_EXPERIENCE_VALUES).nullable(),
    gemRegistered: z.boolean().nullable(),
    pastTenderExperience: nullableText(3000),
    portfolioUrl: z.union([z.url(), z.literal(""), z.null()]),

    solutionNovelty: enumOf(SOLUTION_NOVELTY_VALUES).nullable(),
    innovationStage: enumOf(INNOVATION_STAGE_VALUES).nullable(),
    problemBeingSolved: nullableText(3000),
    innovationDescription: nullableText(3000),
    deploymentReadiness: enumOf(DEPLOYMENT_READINESS_VALUES).nullable(),
    measurableImpact: nullableText(3000),
    hasIntellectualProperty: z.boolean().nullable(),
    intellectualPropertyDetails: nullableText(2000),

    // Conditional answers. Keys are validated against the onboarding schema in
    // the route, which is the only place that knows which questions this vendor
    // is being asked.
    dynamicAnswers: z.record(
      z.string().max(80),
      z.union([
        z.string().trim().max(3000),
        z.number(),
        z.boolean(),
        z.array(z.string().trim().min(1).max(200)).max(40),
        z.null(),
      ]),
    ),
  })
  .partial()
  .strict();

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
