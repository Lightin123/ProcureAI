import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { SessionCheck } from "./SessionCheck.js";

/**
 * Route gate. This is a usability control, not a security boundary — the API
 * rejects every unauthenticated request regardless of what the browser renders.
 */
export function RequireAuth() {
  const { status, signedOut } = useAuth();
  const location = useLocation();

  if (status === "checking") {
    return <SessionCheck />;
  }

  if (status === "anonymous") {
    // A deliberate sign-out is not an interruption, so nothing is remembered:
    // the next sign-in starts at that role's own landing page rather than the
    // previous user's last screen. Only a lost or expired session is resumed.
    const state = signedOut ? null : { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }

  return <Outlet />;
}
