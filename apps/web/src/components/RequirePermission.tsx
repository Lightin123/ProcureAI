import React from "react";
import { Outlet } from "react-router-dom";

import { useHasPermission } from "../auth/AuthContext.js";
import { ForbiddenPage } from "../pages/ForbiddenPage.js";

/**
 * Renders the Forbidden page in place rather than redirecting, so the URL and
 * breadcrumb stay put and the user can see what was refused.
 */
export function RequirePermission({ permission }: { permission: string }) {
  const hasPermission = useHasPermission();

  if (!hasPermission(permission)) {
    return <ForbiddenPage />;
  }

  return <Outlet />;
}
