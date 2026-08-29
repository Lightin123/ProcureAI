import { apiRequest } from "./client.js";

/**
 * Supplier-facing structured responses.
 *
 * The shape here is the whole of what a supplier is told: the terms the
 * department set, the confirmed requirements to answer, its own draft, and how
 * much of what is required is still missing. There is deliberately no reviewing
 * official, no other supplier and no assessment of any kind — the API does not
 * serve those to this side, and this module does not ask for them.
 */

export type ResponseStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CLARIFICATION_REQUESTED"
  | "RESUBMITTED"
  | "READY_FOR_EVALUATION"
  | "WITHDRAWN";

export type SectionMode = "OFF" | "OPTIONAL" | "REQUIRED";

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
  label: string;
  type: "TEXT" | "LONG_TEXT" | "NUMBER" | "MONEY" | "DATE" | "BOOLEAN";
  hint?: string;
  maxLength?: number;
  essential: boolean;
}

export interface SectionDefinition {
  id: string;
  label: string;
  description: string;
  perRequirement: boolean;
  fields: ResponseFieldDefinition[];
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

export interface VendorResponseSummary {
  id: string;
  invitationId: string;
  workPackageId: string;
  projectId: string;
  status: ResponseStatus;
  responseType: string;
  configStatus: string;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  submittedAt: string | null;
  submissionCount: number;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  updatedAt: string;
  departmentName: string;
  projectTitle: string;
  projectReferenceNumber: string;
  packageNumber: string;
  packageTitle: string;
  openClarifications: number;
}

export interface VendorResponseDetail extends VendorResponseSummary {
  body: ResponseBody;
  createdAt: string;
}

export interface VendorResponseConfig {
  responseType: string;
  responseTypeLabel: string;
  status: string;
  title: string | null;
  instructions: string | null;
  responseDeadline: string | null;
  deadlinePassed: boolean;
  sections: Record<string, SectionMode>;
  allowClarifications: boolean;
  allowDocuments: boolean;
  documentsRequired: boolean;
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

export interface VendorResponseWorkspace {
  response: VendorResponseDetail;
  config: VendorResponseConfig;
  sections: SectionDefinition[];
  requirementCompliance: Array<{ value: string; label: string }>;
  questions: ResponseQuestion[];
  requirements: RequirementRow[];
  requirementAnswers: RequirementAnswer[];
  questionAnswers: QuestionAnswer[];
  documents: ResponseDocument[];
  clarifications: Clarification[];
  completeness: Completeness;
  editable: boolean;
  upload: { maxBytes: number; acceptedTypes: string[] };
}

const BASE = "/api/v1/vendor/responses";

export function fetchVendorResponses(signal?: AbortSignal): Promise<VendorResponseSummary[]> {
  return apiRequest<VendorResponseSummary[]>(BASE, { signal });
}

export function fetchVendorResponse(
  responseId: string,
  signal?: AbortSignal,
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(`${BASE}/${responseId}`, { signal });
}

/**
 * Opens the response for an accepted invitation, or resumes the draft already
 * open against it. The server is idempotent here, so this is safe to call from
 * a "Start response" button that the supplier may press twice.
 */
export function openVendorResponse(invitationId: string): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(BASE, { method: "POST", body: { invitationId } });
}

export function saveVendorDraft(
  responseId: string,
  values: Record<string, string | number | boolean | null>,
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(`${BASE}/${responseId}`, {
    method: "PATCH",
    body: { values },
  });
}

export function saveRequirementAnswer(
  responseId: string,
  requirementId: string,
  body: { compliance: string; answer: string | null; notes: string | null },
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(
    `${BASE}/${responseId}/requirements/${requirementId}`,
    { method: "PUT", body },
  );
}

export function saveQuestionAnswer(
  responseId: string,
  questionId: string,
  value: unknown,
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(`${BASE}/${responseId}/questions/${questionId}`, {
    method: "PUT",
    body: { value },
  });
}

export function uploadResponseDocument(
  responseId: string,
  body: {
    title: string;
    description: string | null;
    fileName: string;
    mimeType: string;
    content: string;
  },
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(`${BASE}/${responseId}/documents`, {
    method: "POST",
    body,
  });
}

export function removeResponseDocument(
  responseId: string,
  documentId: string,
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(`${BASE}/${responseId}/documents/${documentId}`, {
    method: "DELETE",
  });
}

export function responseDocumentPath(responseId: string, documentId: string): string {
  return `${BASE}/${responseId}/documents/${documentId}/content`;
}

export function submitVendorResponse(responseId: string): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(`${BASE}/${responseId}/submit`, { method: "POST" });
}

export function withdrawVendorResponse(
  responseId: string,
  reason: string,
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(`${BASE}/${responseId}/withdraw`, {
    method: "POST",
    body: { reason },
  });
}

export function askClarification(
  responseId: string,
  body: { subject: string | null; question: string },
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(`${BASE}/${responseId}/clarifications`, {
    method: "POST",
    body,
  });
}

export function answerClarification(
  responseId: string,
  clarificationId: string,
  answer: string,
): Promise<VendorResponseWorkspace> {
  return apiRequest<VendorResponseWorkspace>(
    `${BASE}/${responseId}/clarifications/${clarificationId}/answer`,
    { method: "POST", body: { answer } },
  );
}

export const VENDOR_RESPONSE_BADGE: Record<
  ResponseStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft — not yet submitted", className: "gov-badge gov-badge--draft" },
  SUBMITTED: { label: "Submitted", className: "gov-badge gov-badge--operational" },
  UNDER_REVIEW: { label: "Under review", className: "gov-badge gov-badge--analysis" },
  CLARIFICATION_REQUESTED: {
    label: "Clarification requested",
    className: "gov-badge gov-badge--tender",
  },
  RESUBMITTED: { label: "Resubmitted", className: "gov-badge gov-badge--operational" },
  READY_FOR_EVALUATION: {
    label: "Accepted for evaluation",
    className: "gov-badge gov-badge--completed",
  },
  WITHDRAWN: { label: "Withdrawn", className: "gov-badge gov-badge--cancelled" },
};
