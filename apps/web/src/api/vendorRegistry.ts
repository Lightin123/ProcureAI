import { apiRequest } from "./client.js";
import type { VendorProfileBundle, VerificationState } from "./vendor.js";

const BASE = "/api/v1/vendor-registry";

export interface VendorRegistryEntry {
  id: string;
  organizationId: string;
  organizationName: string;
  legalName: string | null;
  headline: string | null;
  status: string;
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

export function listVendorRegistry(signal?: AbortSignal): Promise<VendorRegistryEntry[]> {
  return apiRequest<VendorRegistryEntry[]>(BASE, { signal });
}

export function fetchRegistryProfile(
  id: string,
  signal?: AbortSignal,
): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/${id}`, { signal });
}

export function decideVerification(
  id: string,
  body: { verificationState: "PENDING" | "VERIFIED" | "REJECTED"; notes: string | null },
): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(`${BASE}/${id}/verification`, {
    method: "POST",
    body,
  });
}

export function reviewDocument(
  profileId: string,
  documentId: string,
  body: { verificationState: "PENDING" | "VERIFIED" | "REJECTED"; notes: string | null },
): Promise<VendorProfileBundle> {
  return apiRequest<VendorProfileBundle>(
    `${BASE}/${profileId}/documents/${documentId}/review`,
    { method: "POST", body },
  );
}

export function registryDocumentPath(profileId: string, documentId: string): string {
  return `${BASE}/${profileId}/documents/${documentId}/content`;
}
