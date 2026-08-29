import { apiRequest } from "./client.js";

/**
 * Supplier-facing procurement invitations.
 *
 * The shape here is the whole of what a supplier is told about an invitation:
 * which department issued it, which work package it concerns, what was asked,
 * and by when. There is deliberately no rank, no match score, no dimension
 * breakdown and no other supplier — that is the department's internal
 * assessment, and the API does not serve it to this side.
 */

export type InvitationStatus = "INVITED" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

export interface VendorInvitation {
  id: string;
  status: InvitationStatus;
  message: string | null;
  responseDeadline: string | null;
  invitedAt: string;
  respondedAt: string | null;
  responseNote: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;

  departmentName: string;
  projectId: string;
  projectTitle: string;
  projectReferenceNumber: string;

  workPackageId: string;
  packageNumber: string;
  packageTitle: string;
  packageDescription: string;
  packageScope: string;
  packageCategory: string;
  packageComplexity: string;
  packagePriority: string;
  deliverables: string[];
}

const BASE = "/api/v1/vendor/invitations";

export function fetchInvitations(signal?: AbortSignal): Promise<VendorInvitation[]> {
  return apiRequest<VendorInvitation[]>(BASE, { signal });
}

export function fetchInvitation(
  invitationId: string,
  signal?: AbortSignal,
): Promise<VendorInvitation> {
  return apiRequest<VendorInvitation>(`${BASE}/${invitationId}`, { signal });
}

/**
 * Accept or decline. The server refuses a second answer, so this is not a
 * toggle: the portal hides the controls once an invitation has been answered
 * and the API enforces the same thing independently.
 */
export function respondToInvitation(
  invitationId: string,
  body: { decision: "ACCEPTED" | "DECLINED"; note: string | null },
): Promise<VendorInvitation> {
  return apiRequest<VendorInvitation>(`${BASE}/${invitationId}/respond`, {
    method: "POST",
    body,
  });
}
