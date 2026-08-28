import { query } from "../db/pool.js";

export type VendorProfileStatus = "DRAFT" | "SUBMITTED" | "VERIFIED" | "CHANGES_REQUESTED";
export type VerificationState = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface VendorProfile {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationCode: string;
  status: VendorProfileStatus;
  verificationState: VerificationState;

  legalName: string | null;
  organizationType: string | null;
  yearEstablished: number | null;
  registrationNumber: string | null;
  identifiers: Record<string, unknown>;
  eligibility: Record<string, unknown>;
  registeredAddress: Record<string, unknown>;
  operatingStates: string[];
  website: string | null;
  primaryContact: Record<string, unknown>;
  authorisedRepresentative: Record<string, unknown>;

  industries: string[];
  subDomains: string[];
  solutionTypes: string[];
  otherSolutionType: string | null;

  headline: string | null;
  capabilitySummary: string | null;
  coreCapabilities: string[];
  expertiseAreas: string[];
  problemDomains: string[];
  differentiators: string | null;
  valueProposition: string | null;
  sectorsServed: string[];
  targetCustomers: string[];
  deliveryModels: string[];
  serviceCoverage: string | null;
  coverageNotes: string | null;

  teamSize: number | null;
  domainExpertise: string[];
  capacityNotes: string | null;
  deliveryCapability: string | null;
  scalabilityNotes: string | null;
  infrastructureNotes: string | null;
  governmentScaleReadiness: string | null;
  typicalProjectValueInr: number | null;
  minProjectValueInr: number | null;
  maxProjectValueInr: number | null;

  governmentExperience: string | null;
  gemRegistered: boolean | null;
  pastTenderExperience: string | null;
  portfolioUrl: string | null;

  solutionNovelty: string | null;
  innovationStage: string | null;
  problemBeingSolved: string | null;
  innovationDescription: string | null;
  deploymentReadiness: string | null;
  measurableImpact: string | null;
  hasIntellectualProperty: boolean | null;
  intellectualPropertyDetails: string | null;

  dynamicAnswers: Record<string, unknown>;

  completionPercentage: number;
  completedSections: string[];
  lastSection: string | null;

  capabilityDocument: string | null;
  capabilityKeywords: string[];
  aiInsights: unknown;
  aiInsightsAt: string | null;
  aiInsightsModel: string | null;

  submittedAt: string | null;
  verifiedAt: string | null;
  verificationNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scalar and array columns a vendor may write, keyed by the field name the API
 * exposes. An update can only touch a column named here, so a client cannot
 * reach `verification_state` or `completion_percentage` by adding a key to the
 * request body — those are set by the server from its own reasoning.
 */
const WRITABLE_COLUMNS: Readonly<Record<string, string>> = {
  legalName: "legal_name",
  organizationType: "organization_type",
  yearEstablished: "year_established",
  registrationNumber: "registration_number",
  website: "website",
  operatingStates: "operating_states",
  industries: "industries",
  subDomains: "sub_domains",
  solutionTypes: "solution_types",
  otherSolutionType: "other_solution_type",
  headline: "headline",
  capabilitySummary: "capability_summary",
  coreCapabilities: "core_capabilities",
  expertiseAreas: "expertise_areas",
  problemDomains: "problem_domains",
  differentiators: "differentiators",
  valueProposition: "value_proposition",
  sectorsServed: "sectors_served",
  targetCustomers: "target_customers",
  deliveryModels: "delivery_models",
  serviceCoverage: "service_coverage",
  coverageNotes: "coverage_notes",
  teamSize: "team_size",
  domainExpertise: "domain_expertise",
  capacityNotes: "capacity_notes",
  deliveryCapability: "delivery_capability",
  scalabilityNotes: "scalability_notes",
  infrastructureNotes: "infrastructure_notes",
  governmentScaleReadiness: "government_scale_readiness",
  typicalProjectValueInr: "typical_project_value_inr",
  minProjectValueInr: "min_project_value_inr",
  maxProjectValueInr: "max_project_value_inr",
  governmentExperience: "government_experience",
  gemRegistered: "gem_registered",
  pastTenderExperience: "past_tender_experience",
  portfolioUrl: "portfolio_url",
  solutionNovelty: "solution_novelty",
  innovationStage: "innovation_stage",
  problemBeingSolved: "problem_being_solved",
  innovationDescription: "innovation_description",
  deploymentReadiness: "deployment_readiness",
  measurableImpact: "measurable_impact",
  hasIntellectualProperty: "has_intellectual_property",
  intellectualPropertyDetails: "intellectual_property_details",
};

/**
 * Object-valued columns. These are merged rather than replaced, so a step that
 * submits only part of an object leaves the rest intact.
 */
const WRITABLE_JSONB_COLUMNS: Readonly<Record<string, string>> = {
  identifiers: "identifiers",
  eligibility: "eligibility",
  registeredAddress: "registered_address",
  primaryContact: "primary_contact",
  authorisedRepresentative: "authorised_representative",
  dynamicAnswers: "dynamic_answers",
};

export const WRITABLE_FIELD_NAMES: readonly string[] = [
  ...Object.keys(WRITABLE_COLUMNS),
  ...Object.keys(WRITABLE_JSONB_COLUMNS),
];

interface ProfileRow {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_code: string;
  status: VendorProfileStatus;
  verification_state: VerificationState;
  legal_name: string | null;
  organization_type: string | null;
  year_established: number | null;
  registration_number: string | null;
  identifiers: Record<string, unknown> | null;
  eligibility: Record<string, unknown> | null;
  registered_address: Record<string, unknown> | null;
  operating_states: string[];
  website: string | null;
  primary_contact: Record<string, unknown> | null;
  authorised_representative: Record<string, unknown> | null;
  industries: string[];
  sub_domains: string[];
  solution_types: string[];
  other_solution_type: string | null;
  headline: string | null;
  capability_summary: string | null;
  core_capabilities: string[];
  expertise_areas: string[];
  problem_domains: string[];
  differentiators: string | null;
  value_proposition: string | null;
  sectors_served: string[];
  target_customers: string[];
  delivery_models: string[];
  service_coverage: string | null;
  coverage_notes: string | null;
  team_size: number | null;
  domain_expertise: string[];
  capacity_notes: string | null;
  delivery_capability: string | null;
  scalability_notes: string | null;
  infrastructure_notes: string | null;
  government_scale_readiness: string | null;
  typical_project_value_inr: string | null;
  min_project_value_inr: string | null;
  max_project_value_inr: string | null;
  government_experience: string | null;
  gem_registered: boolean | null;
  past_tender_experience: string | null;
  portfolio_url: string | null;
  solution_novelty: string | null;
  innovation_stage: string | null;
  problem_being_solved: string | null;
  innovation_description: string | null;
  deployment_readiness: string | null;
  measurable_impact: string | null;
  has_intellectual_property: boolean | null;
  intellectual_property_details: string | null;
  dynamic_answers: Record<string, unknown> | null;
  completion_percentage: number;
  completed_sections: string[];
  last_section: string | null;
  capability_document: string | null;
  capability_keywords: string[];
  ai_insights: unknown;
  ai_insights_at: Date | null;
  ai_insights_model: string | null;
  submitted_at: Date | null;
  verified_at: Date | null;
  verification_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

const SELECT_PROFILE = `
  SELECT p.id, p.organization_id, o.name AS organization_name, o.code AS organization_code,
         p.status, p.verification_state,
         p.legal_name, p.organization_type, p.year_established, p.registration_number,
         p.identifiers, p.eligibility, p.registered_address, p.operating_states, p.website,
         p.primary_contact, p.authorised_representative,
         p.industries, p.sub_domains, p.solution_types, p.other_solution_type,
         p.headline, p.capability_summary, p.core_capabilities, p.expertise_areas,
         p.problem_domains, p.differentiators, p.value_proposition, p.sectors_served,
         p.target_customers, p.delivery_models, p.service_coverage, p.coverage_notes,
         p.team_size, p.domain_expertise, p.capacity_notes, p.delivery_capability,
         p.scalability_notes, p.infrastructure_notes, p.government_scale_readiness,
         p.typical_project_value_inr, p.min_project_value_inr, p.max_project_value_inr,
         p.government_experience, p.gem_registered, p.past_tender_experience, p.portfolio_url,
         p.solution_novelty, p.innovation_stage, p.problem_being_solved,
         p.innovation_description, p.deployment_readiness, p.measurable_impact,
         p.has_intellectual_property, p.intellectual_property_details,
         p.dynamic_answers, p.completion_percentage, p.completed_sections, p.last_section,
         p.capability_document, p.capability_keywords,
         p.ai_insights, p.ai_insights_at, p.ai_insights_model,
         p.submitted_at, p.verified_at, p.verification_notes, p.created_at, p.updated_at
  FROM vendor_profiles p
  JOIN organizations o ON o.id = p.organization_id
`;

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function object(value: Record<string, unknown> | null): Record<string, unknown> {
  return value ?? {};
}

function toProfile(row: ProfileRow): VendorProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationCode: row.organization_code,
    status: row.status,
    verificationState: row.verification_state,
    legalName: row.legal_name,
    organizationType: row.organization_type,
    yearEstablished: row.year_established,
    registrationNumber: row.registration_number,
    identifiers: object(row.identifiers),
    eligibility: object(row.eligibility),
    registeredAddress: object(row.registered_address),
    operatingStates: row.operating_states,
    website: row.website,
    primaryContact: object(row.primary_contact),
    authorisedRepresentative: object(row.authorised_representative),
    industries: row.industries,
    subDomains: row.sub_domains,
    solutionTypes: row.solution_types,
    otherSolutionType: row.other_solution_type,
    headline: row.headline,
    capabilitySummary: row.capability_summary,
    coreCapabilities: row.core_capabilities,
    expertiseAreas: row.expertise_areas,
    problemDomains: row.problem_domains,
    differentiators: row.differentiators,
    valueProposition: row.value_proposition,
    sectorsServed: row.sectors_served,
    targetCustomers: row.target_customers,
    deliveryModels: row.delivery_models,
    serviceCoverage: row.service_coverage,
    coverageNotes: row.coverage_notes,
    teamSize: row.team_size,
    domainExpertise: row.domain_expertise,
    capacityNotes: row.capacity_notes,
    deliveryCapability: row.delivery_capability,
    scalabilityNotes: row.scalability_notes,
    infrastructureNotes: row.infrastructure_notes,
    governmentScaleReadiness: row.government_scale_readiness,
    typicalProjectValueInr: numeric(row.typical_project_value_inr),
    minProjectValueInr: numeric(row.min_project_value_inr),
    maxProjectValueInr: numeric(row.max_project_value_inr),
    governmentExperience: row.government_experience,
    gemRegistered: row.gem_registered,
    pastTenderExperience: row.past_tender_experience,
    portfolioUrl: row.portfolio_url,
    solutionNovelty: row.solution_novelty,
    innovationStage: row.innovation_stage,
    problemBeingSolved: row.problem_being_solved,
    innovationDescription: row.innovation_description,
    deploymentReadiness: row.deployment_readiness,
    measurableImpact: row.measurable_impact,
    hasIntellectualProperty: row.has_intellectual_property,
    intellectualPropertyDetails: row.intellectual_property_details,
    dynamicAnswers: object(row.dynamic_answers),
    completionPercentage: row.completion_percentage,
    completedSections: row.completed_sections,
    lastSection: row.last_section,
    capabilityDocument: row.capability_document,
    capabilityKeywords: row.capability_keywords,
    aiInsights: row.ai_insights,
    aiInsightsAt: row.ai_insights_at?.toISOString() ?? null,
    aiInsightsModel: row.ai_insights_model,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    verificationNotes: row.verification_notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function findProfileByOrganization(
  organizationId: string,
): Promise<VendorProfile | undefined> {
  const result = await query<ProfileRow>(`${SELECT_PROFILE} WHERE p.organization_id = $1`, [
    organizationId,
  ]);
  const row = result.rows[0];
  return row === undefined ? undefined : toProfile(row);
}

export async function findProfileById(id: string): Promise<VendorProfile | undefined> {
  const result = await query<ProfileRow>(`${SELECT_PROFILE} WHERE p.id = $1`, [id]);
  const row = result.rows[0];
  return row === undefined ? undefined : toProfile(row);
}

export async function createProfile(input: {
  organizationId: string;
  createdBy: string;
  legalName: string;
  primaryContact: Record<string, unknown>;
}): Promise<VendorProfile> {
  const result = await query<{ id: string }>(
    `INSERT INTO vendor_profiles (organization_id, created_by, legal_name, primary_contact)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (organization_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [input.organizationId, input.createdBy, input.legalName, JSON.stringify(input.primaryContact)],
  );

  const id = result.rows[0]?.id;
  if (id === undefined) {
    throw new Error("Failed to create the vendor capability profile.");
  }

  const profile = await findProfileById(id);
  if (profile === undefined) {
    throw new Error("The created vendor profile could not be read back.");
  }

  return profile;
}

/**
 * Applies a partial profile update. Unknown keys are ignored rather than
 * rejected, because the route has already validated the payload against the
 * onboarding schema and a silently dropped key here would be a second, weaker
 * gate rather than a first one.
 */
export async function updateProfileValues(
  profileId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const assignments: string[] = [];
  const params: unknown[] = [profileId];

  for (const [field, value] of Object.entries(patch)) {
    const column = WRITABLE_COLUMNS[field];
    if (column !== undefined) {
      params.push(value === undefined ? null : value);
      assignments.push(`${column} = $${params.length}`);
      continue;
    }

    const jsonColumn = WRITABLE_JSONB_COLUMNS[field];
    if (jsonColumn !== undefined) {
      params.push(JSON.stringify(value ?? {}));
      assignments.push(`${jsonColumn} = ${jsonColumn} || $${params.length}::jsonb`);
    }
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push("updated_at = now()");

  await query(`UPDATE vendor_profiles SET ${assignments.join(", ")} WHERE id = $1`, params);
}

export async function updateDerivedProfileState(
  profileId: string,
  input: {
    completionPercentage: number;
    completedSections: string[];
    capabilityDocument: string;
    capabilityKeywords: string[];
    lastSection?: string | undefined;
  },
): Promise<void> {
  await query(
    `UPDATE vendor_profiles
     SET completion_percentage  = $2,
         completed_sections     = $3,
         capability_document    = $4,
         capability_keywords    = $5,
         capability_document_at = now(),
         last_section           = COALESCE($6, last_section),
         updated_at             = now()
     WHERE id = $1`,
    [
      profileId,
      input.completionPercentage,
      input.completedSections,
      input.capabilityDocument,
      input.capabilityKeywords,
      input.lastSection ?? null,
    ],
  );
}

/**
 * Submission moves the profile into the verification queue. It never sets
 * VERIFIED — only an administrator's decision does that.
 */
export async function submitProfileForVerification(profileId: string): Promise<void> {
  await query(
    `UPDATE vendor_profiles
     SET status             = 'SUBMITTED',
         verification_state = 'PENDING',
         submitted_at       = now(),
         updated_at         = now()
     WHERE id = $1`,
    [profileId],
  );
}

export async function recordVerificationDecision(input: {
  profileId: string;
  verificationState: VerificationState;
  notes: string | null;
  verifiedBy: string;
}): Promise<void> {
  const status =
    input.verificationState === "VERIFIED"
      ? "VERIFIED"
      : input.verificationState === "REJECTED"
        ? "CHANGES_REQUESTED"
        : "SUBMITTED";

  await query(
    `UPDATE vendor_profiles
     SET verification_state = $2::vendor_verification_state,
         status             = $3::vendor_profile_status,
         verification_notes = $4,
         verified_by        = $5,
         verified_at        = CASE WHEN $2 = 'VERIFIED' THEN now() ELSE NULL END,
         updated_at         = now()
     WHERE id = $1`,
    [input.profileId, input.verificationState, status, input.notes, input.verifiedBy],
  );
}

export async function saveAiInsights(
  profileId: string,
  insights: unknown,
  model: string | null,
): Promise<void> {
  await query(
    `UPDATE vendor_profiles
     SET ai_insights = $2::jsonb, ai_insights_at = now(), ai_insights_model = $3, updated_at = now()
     WHERE id = $1`,
    [profileId, JSON.stringify(insights), model],
  );
}

export interface VendorRegistryEntry {
  id: string;
  organizationId: string;
  organizationName: string;
  legalName: string | null;
  headline: string | null;
  status: VendorProfileStatus;
  verificationState: VerificationState;
  industries: string[];
  solutionTypes: string[];
  operatingStates: string[];
  completionPercentage: number;
  documentCount: number;
  pendingDocumentCount: number;
  submittedAt: string | null;
  updatedAt: string;
}

/** Administrative listing. Never selects the capability document or contacts. */
export async function listVendorRegistry(): Promise<VendorRegistryEntry[]> {
  const result = await query<{
    id: string;
    organization_id: string;
    organization_name: string;
    legal_name: string | null;
    headline: string | null;
    status: VendorProfileStatus;
    verification_state: VerificationState;
    industries: string[];
    solution_types: string[];
    operating_states: string[];
    completion_percentage: number;
    document_count: string;
    pending_document_count: string;
    submitted_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT p.id, p.organization_id, o.name AS organization_name, p.legal_name, p.headline,
            p.status, p.verification_state, p.industries, p.solution_types, p.operating_states,
            p.completion_percentage, p.submitted_at, p.updated_at,
            COUNT(d.id) AS document_count,
            COUNT(d.id) FILTER (WHERE d.verification_state = 'PENDING') AS pending_document_count
     FROM vendor_profiles p
     JOIN organizations o ON o.id = p.organization_id
     LEFT JOIN vendor_documents d ON d.vendor_profile_id = p.id
     GROUP BY p.id, o.name
     ORDER BY
       CASE p.verification_state WHEN 'PENDING' THEN 0 ELSE 1 END,
       p.updated_at DESC`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    legalName: row.legal_name,
    headline: row.headline,
    status: row.status,
    verificationState: row.verification_state,
    industries: row.industries,
    solutionTypes: row.solution_types,
    operatingStates: row.operating_states,
    completionPercentage: row.completion_percentage,
    documentCount: Number.parseInt(row.document_count, 10),
    pendingDocumentCount: Number.parseInt(row.pending_document_count, 10),
    submittedAt: row.submitted_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  }));
}
