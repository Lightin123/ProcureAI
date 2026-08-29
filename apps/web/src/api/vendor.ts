import { apiRequest } from "./client.js";
import type { VendorInvitation } from "./vendorInvitations.js";

// ---------------------------------------------------------------------------
// Onboarding schema — served by the API so the questionnaire, its validation
// and the completion calculation are one definition rather than three.
// ---------------------------------------------------------------------------

export interface TaxonomyOption {
  value: string;
  label: string;
  hint?: string;
}

export interface IndustryOption extends TaxonomyOption {
  subDomains: string[];
}

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "year"
  | "currency"
  | "url"
  | "email"
  | "tel"
  | "select"
  | "multiselect"
  | "tags"
  | "states"
  | "state"
  | "subdomains"
  | "boolean";

export interface FieldCondition {
  path: string;
  includesAny: string[];
}

export interface ShowIf {
  any: FieldCondition[];
}

export interface OnboardingField {
  path: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  rows?: number;
  options?: TaxonomyOption[];
  showIf?: ShowIf;
  wide?: boolean;
}

export interface OnboardingGroup {
  id: string;
  title: string;
  description?: string;
  showIf?: ShowIf;
  fields: OnboardingField[];
}

export type CollectionId = "offerings" | "experience" | "credentials" | "documents";

export interface OnboardingStep {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  groups: OnboardingGroup[];
  collections?: CollectionId[];
  weight: number;
}

export interface OnboardingSchema {
  steps: OnboardingStep[];
  collections: Record<
    CollectionId,
    { title: string; description: string; kindOptions?: TaxonomyOption[] }
  >;
  taxonomy: {
    industries: IndustryOption[];
    solutionTypes: TaxonomyOption[];
    organizationTypes: TaxonomyOption[];
    deliveryModels: TaxonomyOption[];
    serviceCoverage: TaxonomyOption[];
    governmentExperience: TaxonomyOption[];
    governmentScaleReadiness: TaxonomyOption[];
    solutionNovelty: TaxonomyOption[];
    innovationStage: TaxonomyOption[];
    deploymentReadiness: TaxonomyOption[];
    clientTypes: TaxonomyOption[];
    credentialKinds: TaxonomyOption[];
    offeringKinds: TaxonomyOption[];
    documentTypes: TaxonomyOption[];
    eligibilityFlags: TaxonomyOption[];
    states: string[];
  };
  upload: { maxBytes: number; acceptedTypes: string[] };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

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
  aiInsights: CapabilityInsights | null;
  aiInsightsAt: string | null;
  aiInsightsModel: string | null;

  submittedAt: string | null;
  verifiedAt: string | null;
  verificationNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityInsights {
  positioning_summary: string;
  strengths: Array<{ title: string; detail: string }>;
  gaps: Array<{ title: string; detail: string }>;
  suggested_opportunity_areas: string[];
  model: string;
  prompt_version: string;
}

export interface SectionProgress {
  id: string;
  title: string;
  shortTitle: string;
  requiredTotal: number;
  requiredAnswered: number;
  optionalTotal: number;
  optionalAnswered: number;
  percentage: number;
  complete: boolean;
}

export interface CompletionResult {
  percentage: number;
  sections: SectionProgress[];
  missingRequired: Array<{ stepId: string; path: string; label: string }>;
  nextStepId?: string;
  readyToSubmit: boolean;
}

export interface VendorOffering {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  categories: string[];
  tags: string[];
  sectors: string[];
  createdAt: string;
}

export interface VendorExperienceEntry {
  id: string;
  title: string;
  clientName: string | null;
  clientType: string | null;
  sector: string | null;
  description: string | null;
  outcome: string | null;
  contractValueInr: number | null;
  startYear: number | null;
  endYear: number | null;
  referenceUrl: string | null;
  createdAt: string;
}

export interface VendorCredential {
  id: string;
  kind: string;
  name: string;
  issuingAuthority: string | null;
  identifier: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  notes: string | null;
  verificationState: VerificationState;
  createdAt: string;
}

export interface VendorDocument {
  id: string;
  documentType: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  referenceNumber: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  verificationState: VerificationState;
  reviewNotes: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}

export interface VendorProfileBundle {
  profile: VendorProfile;
  offerings: VendorOffering[];
  experience: VendorExperienceEntry[];
  credentials: VendorCredential[];
  documents: VendorDocument[];
  completion: CompletionResult;
}

// ---------------------------------------------------------------------------
// Opportunities and dashboard
// ---------------------------------------------------------------------------

export interface MatchComponent {
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface MatchResult {
  score: number;
  band: "STRONG" | "MODERATE" | "LIMITED";
  matchedTerms: string[];
  unmatchedTerms: string[];
  components: MatchComponent[];
}

export interface OpportunityRequirement {
  kind: string;
  category: string;
  text: string;
}

export interface VendorOpportunity {
  id: string;
  referenceNumber: string;
  title: string;
  summary: string;
  problemDescription: string;
  departmentName: string;
  status: string;
  publishedAt: string;
  responseDeadline: string | null;
  requirements: OpportunityRequirement[];
  saved: boolean;
  interestState: "NONE" | "SUBMITTED" | "WITHDRAWN";
  interestAt: string | null;
  match?: MatchResult;
}

export interface VendorNotification {
  id: string;
  category: string;
  title: string;
  body: string;
  linkPath: string | null;
  /** Set when the notification is about a procurement invitation. */
  invitationId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSummary {
  unreadCount: number;
  notifications: VendorNotification[];
  awaitingResponse: number;
}

export interface ProfileSuggestion {
  title: string;
  detail: string;
  stepId: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface VendorDashboard {
  profile: {
    id: string;
    organizationName: string;
    legalName: string | null;
    headline: string | null;
    status: VendorProfileStatus;
    verificationState: VerificationState;
    verificationNotes: string | null;
    completionPercentage: number;
    industries: string[];
    solutionTypes: string[];
    aiInsights: CapabilityInsights | null;
    aiInsightsAt: string | null;
    aiInsightsModel: string | null;
    submittedAt: string | null;
  };
  completion: CompletionResult;
  counts: {
    offerings: number;
    experience: number;
    credentials: number;
    documents: number;
    pendingDocuments: number;
    openOpportunities: number;
    savedOpportunities: number;
    interestSubmitted: number;
    unreadNotifications: number;
    invitations: number;
    invitationsAwaitingResponse: number;
    invitationsAccepted: number;
  };
  recommendedOpportunities: VendorOpportunity[];
  savedOpportunities: VendorOpportunity[];
  submissions: Array<{
    id: string;
    title: string;
    referenceNumber: string;
    departmentName: string;
    interestState: string;
    interestAt: string | null;
  }>;
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    referenceNumber: string;
    responseDeadline: string | null;
  }>;
  suggestions: ProfileSuggestion[];
  notifications: VendorNotification[];
  openInvitations: VendorInvitation[];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const BASE = "/api/v1/vendor";

export function fetchOnboardingSchema(signal?: AbortSignal): Promise<OnboardingSchema> {
  return apiRequest<OnboardingSchema>(`${BASE}/onboarding-schema`, { signal });
}

export function fetchProfile(signal?: AbortSignal): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile`, { signal });
}

export function saveProfileStep(
  stepId: string,
  values: Record<string, unknown>,
): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile`, {
    method: "PATCH",
    body: { stepId, values },
  });
}

export function submitProfile(): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile/submit`, { method: "POST" });
}

export function addOffering(body: {
  kind: string;
  name: string;
  description: string | null;
  categories: string[];
  tags: string[];
  sectors: string[];
}): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile/offerings`, { method: "POST", body });
}

export function removeOffering(id: string): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile/offerings/${id}`, { method: "DELETE" });
}

export function addExperience(body: Record<string, unknown>): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile/experience`, { method: "POST", body });
}

export function removeExperience(id: string): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile/experience/${id}`, { method: "DELETE" });
}

export function addCredential(body: Record<string, unknown>): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile/credentials`, { method: "POST", body });
}

export function removeCredential(id: string): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/profile/credentials/${id}`, { method: "DELETE" });
}

export function uploadDocument(body: {
  documentType: string;
  title: string;
  fileName: string;
  mimeType: string;
  content: string;
  referenceNumber: string | null;
  issuedOn: string | null;
  validUntil: string | null;
}): Promise<VendorDocument> {
  return apiRequest<VendorDocument>(`${BASE}/profile/documents`, { method: "POST", body });
}

export function removeDocument(id: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`${BASE}/profile/documents/${id}`, { method: "DELETE" });
}

export function documentDownloadPath(id: string): string {
  return `${BASE}/profile/documents/${id}/content`;
}

export function fetchDashboard(signal?: AbortSignal): Promise<VendorDashboard> {
  return apiRequest<VendorDashboard>(`${BASE}/dashboard`, { signal });
}

export function fetchOpportunities(signal?: AbortSignal): Promise<VendorOpportunity[]> {
  return apiRequest<VendorOpportunity[]>(`${BASE}/opportunities`, { signal });
}

export function fetchOpportunity(
  id: string,
  signal?: AbortSignal,
): Promise<VendorOpportunity> {
  return apiRequest<VendorOpportunity>(`${BASE}/opportunities/${id}`, { signal });
}

export function setOpportunitySaved(id: string, saved: boolean): Promise<{ saved: boolean }> {
  return apiRequest<{ saved: boolean }>(`${BASE}/opportunities/${id}/save`, {
    method: "POST",
    body: { saved },
  });
}

export function setOpportunityInterest(
  id: string,
  body: { withdraw: boolean; message: string | null },
): Promise<{ interestState: string }> {
  return apiRequest<{ interestState: string }>(`${BASE}/opportunities/${id}/interest`, {
    method: "POST",
    body,
  });
}

export function fetchNotifications(signal?: AbortSignal): Promise<VendorNotification[]> {
  return apiRequest<VendorNotification[]>(`${BASE}/notifications`, { signal });
}

export function markNotificationsRead(): Promise<{ read: boolean; unreadCount: number }> {
  return apiRequest<{ read: boolean; unreadCount: number }>(`${BASE}/notifications/read`, {
    method: "POST",
  });
}

/** Marks one notification read — what opening it from the bell does. */
export function markNotificationRead(
  notificationId: string,
): Promise<{ read: boolean; unreadCount: number }> {
  return apiRequest<{ read: boolean; unreadCount: number }>(
    `${BASE}/notifications/${notificationId}/read`,
    { method: "POST" },
  );
}

/** The header badge's own request: the count and the most recent few. */
export function fetchNotificationSummary(signal?: AbortSignal): Promise<NotificationSummary> {
  return apiRequest<NotificationSummary>(`${BASE}/notifications/summary`, { signal });
}

export function requestCapabilityInsights(): Promise<{
  insights: CapabilityInsights;
  model: string;
}> {
  return apiRequest<{ insights: CapabilityInsights; model: string }>(`${BASE}/profile/insights`, {
    method: "POST",
  });
}
