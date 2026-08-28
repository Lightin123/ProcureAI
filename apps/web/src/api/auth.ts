import { apiRequest } from "./client.js";

export type UserRole = "GOVERNMENT_OFFICIAL" | "ADMIN" | "VENDOR";

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  organizationId: string;
  organizationName: string;
  organizationKind: "GOVERNMENT" | "VENDOR";
  permissions: string[];
}

interface UserEnvelope {
  user: AuthenticatedUser;
}

export async function login(email: string, password: string): Promise<AuthenticatedUser> {
  const result = await apiRequest<UserEnvelope>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return result.user;
}

export interface VendorRegistrationInput {
  organizationName: string;
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: true;
}

/**
 * Self-registration creates a supplier account only. There is no role in the
 * request body — the API decides, so this endpoint cannot be used to create a
 * government or administrator account.
 */
export async function registerVendor(
  input: VendorRegistrationInput,
): Promise<AuthenticatedUser> {
  const result = await apiRequest<UserEnvelope>("/api/v1/auth/register", {
    method: "POST",
    body: input,
  });
  return result.user;
}

export async function logout(): Promise<void> {
  await apiRequest<{ loggedOut: boolean }>("/api/v1/auth/logout", { method: "POST" });
}

export async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthenticatedUser> {
  const result = await apiRequest<UserEnvelope>("/api/v1/auth/me", { signal });
  return result.user;
}
