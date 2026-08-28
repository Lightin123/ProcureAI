import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  registerVendor as registerRequest,
  type AuthenticatedUser,
  type VendorRegistrationInput,
} from "../api/auth.js";
import { ApiRequestError, setUnauthorizedHandler } from "../api/client.js";

type AuthStatus = "checking" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | undefined;
  sessionExpired: boolean;
  /**
   * Resolves with the signed-in user. Callers need the identity synchronously
   * to decide where to navigate; reading it back from context immediately after
   * would see the previous render's value and send everyone to a fallback.
   */
  login: (email: string, password: string) => Promise<AuthenticatedUser>;
  register: (input: VendorRegistrationInput) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthenticatedUser | undefined>(undefined);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Session restoration. The cookie is the persistence; the browser sends it,
  // and the server decides. Nothing about the identity is stored client-side.
  useEffect(() => {
    const controller = new AbortController();

    fetchCurrentUser(controller.signal)
      .then((current) => {
        setUser(current);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setUser(undefined);
        setStatus("anonymous");
      });

    return () => {
      controller.abort();
    };
  }, []);

  // A 401 from any request ends the session here, once, rather than in each
  // component that happens to make a call.
  useEffect(() => {
    setUnauthorizedHandler((code) => {
      // SESSION_EXPIRED means a cookie was presented and rejected, so the user
      // is told their session ended. UNAUTHENTICATED means no cookie at all,
      // which is simply "not signed in" and needs no explanation.
      setSessionExpired(code === "SESSION_EXPIRED");
      setUser(undefined);
      setStatus("anonymous");
    });

    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const authenticated = await loginRequest(email, password);
    setSessionExpired(false);
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const register = useCallback(async (input: VendorRegistrationInput) => {
    // Registration signs the new supplier in, so the portal never asks someone
    // to re-enter the password they have just chosen.
    const authenticated = await registerRequest(input);
    setSessionExpired(false);
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      // Logging out is best-effort on the client; the server has already
      // revoked the session, so the local state must be cleared regardless.
      if (!(error instanceof ApiRequestError)) {
        throw error;
      }
    } finally {
      setSessionExpired(false);
      setUser(undefined);
      setStatus("anonymous");
    }
  }, []);

  const hasPermission = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionExpired, login, register, logout, hasPermission }),
    [status, user, sessionExpired, login, register, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}

/** For screens that only render inside an authenticated subtree. */
export function useCurrentUser(): AuthenticatedUser {
  const { user } = useAuth();
  if (user === undefined) {
    throw new Error("useCurrentUser must be used within an authenticated route.");
  }
  return user;
}

/**
 * Permission checks here drive what is shown, never what is allowed — the API
 * re-derives every permission server-side on each request.
 */
export function useHasPermission(): (permission: string) => boolean {
  return useAuth().hasPermission;
}

/** Permission check against a specific user, for code that has one in hand. */
export function permissionChecker(
  user: AuthenticatedUser | undefined,
): (permission: string) => boolean {
  return (permission) => user?.permissions.includes(permission) ?? false;
}
