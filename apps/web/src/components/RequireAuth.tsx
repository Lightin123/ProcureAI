import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.js";
import { SessionCheck } from "./SessionCheck.js";

/**
 * Route gate. This is a usability control, not a security boundary — the API
 * rejects every unauthenticated request regardless of what the browser renders.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "checking") {
    return <SessionCheck />;
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
