import { apiRequest } from "./client.js";

/**
 * Government-facing response configuration and the response workspace.
 *
 * The mirror of `vendorResponses.ts` and deliberately a separate module: the
 * two sides carry different fields, and a shared type would let a field only
 * one side is entitled to leak into the other side's page by autocomplete.
 */

export type ResponseType = "EXPRESSION_OF_INTEREST" | "RFI" | "PROPOSAL" | "QUOTATION";
export type SectionMode = "OFF" | "OPTIONAL" | "REQUIRED";
export type ConfigStatus = "DRAFT" | "OPEN" | "CLOSED";

export type ResponseStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CLARIFICATION_REQUESTED"
  | "RESUBMITTED"
  | "READY_FOR_EVALUATION"
  | "WITHDRAWN";

export type QuestionType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "BOOLEAN"
  | "DATE"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE";

export interface ResponseFieldDefinition {
  key: string;
  column: string;
  label: string;
  type: "TEXT" | "LONG_TEXT" | "NUMBER" | "MONEY" | "DATE" | "BOOLEAN";
  hint?: string;
  maxLength?: number;
  essential: boolean;
}

export interface ResponseSectionDefinition {
  id: string;
  label: string;
  description: string;
  alwaysOn: boolean;
  perRequirement: boolean;
  fields: ResponseFieldDefinition[];
}

export interface ResponseSchema {
  responseTypes: Array<{ value: ResponseType; label: string; description: string }>;
  sections: ResponseSectionDefinition[];
  sectionModes: SectionMode[];
  defaultSections: Record<ResponseType, Record<string, SectionMode>>;
  questionTypes: Array<{ value: QuestionType; label: string; requiresOptions: boolean }>;
  requirementCompliance: Array<{ value: string; label: string }>;
}

export interface ResponseConfig {
  id: string;
  workPackageId: string;
  responseType: ResponseType;
  status: ConfigStatus;
  title: string | null;
  instructions: string | null;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  sections: Record<string, SectionMode>;
  allowClarifications: boolean;
  allowDocuments: boolean;
  documentsRequired: boolean;
  configuredByName: string;
  openedByName: string | null;
  openedAt: string | null;
  closedByName: string | null;
  closedAt: string | null;
  updatedAt: string;
}

export interface ResponseQuestion {
  id: string;
  section: string;
  prompt: string;
  helpText: string | null;
  answerType: QuestionType;
  options: string[];
  isRequired: boolean;
  displayOrder: number;
}

export interface ResponseSummary {
  id: string;
  workPackageId: string;
  vendorProfileId: string;
  organizationName: string;
  legalName: string | null;
  verificationState: string;
  responseType: ResponseType;
  status: ResponseStatus;
  submittedAt: string | null;
  submittedByName: string | null;
  submissionCount: number;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  openClarifications: number;
  documentCount: number;
  updatedAt: string;
}

export interface ResponseBody {
  summary: string | null;
  technicalApproach: string | null;
  technicalStandards: string | null;
  executionPlan: string | null;
  teamComposition: string | null;
  timelineSummary: string | null;
  estimatedDurationWeeks: number | null;
  proposedStartDate: string | null;
  capacityStatement: string | null;
  committedTeamSize: number | null;
  experienceSummary: string | null;
  complianceStatement: string | null;
  complianceConfirmed: boolean;
  commercialSummary: string | null;
  quotedValueInr: number | null;
  priceValidityDays: number | null;
  paymentTerms: string | null;
  taxesIncluded: boolean | null;
}

export interface ResponseDetail extends ResponseSummary {
  body: ResponseBody;
  reviewStartedAt: string | null;
  reviewStartedByName: string | null;
  readiedAt: string | null;
  readiedByName: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  createdAt: string;
}

export interface RequirementRow {
  id: string;
  kind: string;
  category: string;
  text: string;
}

export interface RequirementAnswer {
  requirementId: string;
  compliance: string;
  answer: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface QuestionAnswer {
  questionId: string;
  value: unknown;
  updatedAt: string;
}

export interface ResponseDocument {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface Clarification {
  id: string;
  raisedBySide: "VENDOR" | "GOVERNMENT";
  status: "OPEN" | "ANSWERED";
  subject: string | null;
  question: string;
  askedByName: string;
  askedAt: string;
  respondBy: string | null;
  answer: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
}

export interface Completeness {
  complete: boolean;
  requiredTotal: number;
  requiredComplete: number;
  optionalTotal: number;
  optionalComplete: number;
  percent: number;
  sections: Array<{
    sectionId: string;
    label: string;
    mode: SectionMode;
    requiredTotal: number;
    requiredComplete: number;
    optionalTotal: number;
    optionalComplete: number;
    complete: boolean;
  }>;
  items: Array<{
    sectionId: string;
    key: string;
    label: string;
    required: boolean;
    complete: boolean;
  }>;
  missing: Array<{ field: string; message: string }>;
}

export interface ResponseWorkspace {
  workPackage: {
    id: string;
    projectId: string;
    packageNumber: string;
    title: string;
    status: string;
    projectTitle: string;
  };
  requirements: RequirementRow[];
  config: ResponseConfig | null;
  questions: ResponseQuestion[];
  responses: ResponseSummary[];
  counts: {
    total: number;
    drafts: number;
    submitted: number;
    underReview: number;
    clarificationRequested: number;
    readyForEvaluation: number;
    withdrawn: number;
    openClarifications: number;
  };
  invitations: Array<{
    id: string;
    vendorProfileId: string;
    organizationName: string;
    legalName: string | null;
    status: string;
    invitedAt: string;
    respondedAt: string | null;
  }>;
}

export interface GovernmentResponseView {
  response: ResponseDetail;
  config: ResponseConfig;
  questions: ResponseQuestion[];
  requirements: RequirementRow[];
  requirementAnswers: RequirementAnswer[];
  questionAnswers: QuestionAnswer[];
  documents: ResponseDocument[];
  clarifications: Clarification[];
  completeness: Completeness;
}

export interface ConfigPayload {
  responseType: ResponseType;
  title: string | null;
  instructions: string | null;
  responseDeadline: string | null;
  sections: Record<string, SectionMode>;
  allowClarifications: boolean;
  allowDocuments: boolean;
  documentsRequired: boolean;
}

function base(workPackageId: string): string {
  return `/api/v1/work-packages/${workPackageId}/responses`;
}

export function fetchResponseSchema(
  workPackageId: string,
  signal?: AbortSignal,
): Promise<ResponseSchema> {
  return apiRequest<ResponseSchema>(`${base(workPackageId)}/schema`, { signal });
}

export function fetchResponseWorkspace(
  workPackageId: string,
  signal?: AbortSignal,
): Promise<ResponseWorkspace> {
  return apiRequest<ResponseWorkspace>(base(workPackageId), { signal });
}

export function saveResponseConfig(
  workPackageId: string,
  body: ConfigPayload,
): Promise<{ config: ResponseConfig; questions: ResponseQuestion[] }> {
  return apiRequest(`${base(workPackageId)}/config`, { method: "PUT", body });
}

export function openResponseConfig(
  workPackageId: string,
): Promise<{ config: ResponseConfig; notifiedSuppliers: number }> {
  return apiRequest(`${base(workPackageId)}/config/open`, { method: "POST" });
}

export function closeResponseConfig(
  workPackageId: string,
): Promise<{ config: ResponseConfig }> {
  return apiRequest(`${base(workPackageId)}/config/close`, { method: "POST" });
}

export function addResponseQuestion(
  workPackageId: string,
  body: {
    section: string;
    prompt: string;
    helpText: string | null;
    answerType: QuestionType;
    options: string[];
    isRequired: boolean;
  },
): Promise<{ question: ResponseQuestion; questions: ResponseQuestion[] }> {
  return apiRequest(`${base(workPackageId)}/config/questions`, { method: "POST", body });
}

export function removeResponseQuestion(
  workPackageId: string,
  questionId: string,
): Promise<{ deleted: boolean; questions: ResponseQuestion[] }> {
  return apiRequest(`${base(workPackageId)}/config/questions/${questionId}`, {
    method: "DELETE",
  });
}

export function fetchResponse(
  workPackageId: string,
  responseId: string,
  signal?: AbortSignal,
): Promise<GovernmentResponseView> {
  return apiRequest<GovernmentResponseView>(`${base(workPackageId)}/${responseId}`, { signal });
}

export function startResponseReview(
  workPackageId: string,
  responseId: string,
): Promise<{ response: ResponseDetail }> {
  return apiRequest(`${base(workPackageId)}/${responseId}/review`, { method: "POST" });
}

export function markResponseReady(
  workPackageId: string,
  responseId: string,
): Promise<{ response: ResponseDetail }> {
  return apiRequest(`${base(workPackageId)}/${responseId}/ready`, { method: "POST" });
}

export function requestClarification(
  workPackageId: string,
  responseId: string,
  body: { subject: string | null; question: string; respondBy: string | null },
): Promise<{
  clarification: Clarification;
  clarifications: Clarification[];
  response: ResponseDetail;
}> {
  return apiRequest(`${base(workPackageId)}/${responseId}/clarifications`, {
    method: "POST",
    body,
  });
}

export function answerClarification(
  workPackageId: string,
  responseId: string,
  clarificationId: string,
  body: { answer: string },
): Promise<{ clarification: Clarification; clarifications: Clarification[] }> {
  return apiRequest(
    `${base(workPackageId)}/${responseId}/clarifications/${clarificationId}/answer`,
    { method: "POST", body },
  );
}

/** A download link; the API serves it as an attachment and never inline. */
export function responseDocumentPath(
  workPackageId: string,
  responseId: string,
  documentId: string,
): string {
  return `${base(workPackageId)}/${responseId}/documents/${documentId}/content`;
}

export const RESPONSE_STATUS_BADGE: Record<
  ResponseStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft with supplier", className: "gov-badge gov-badge--draft" },
  SUBMITTED: { label: "Submitted", className: "gov-badge gov-badge--pending" },
  UNDER_REVIEW: { label: "Under review", className: "gov-badge gov-badge--analysis" },
  CLARIFICATION_REQUESTED: {
    label: "Clarification requested",
    className: "gov-badge gov-badge--tender",
  },
  RESUBMITTED: { label: "Resubmitted", className: "gov-badge gov-badge--pending" },
  READY_FOR_EVALUATION: {
    label: "Ready for evaluation",
    className: "gov-badge gov-badge--operational",
  },
  WITHDRAWN: { label: "Withdrawn", className: "gov-badge gov-badge--cancelled" },
};

export const CONFIG_STATUS_BADGE: Record<ConfigStatus, { label: string; className: string }> = {
  DRAFT: { label: "Not yet opened", className: "gov-badge gov-badge--draft" },
  OPEN: { label: "Open for responses", className: "gov-badge gov-badge--operational" },
  CLOSED: { label: "Closed", className: "gov-badge gov-badge--inactive" },
};
