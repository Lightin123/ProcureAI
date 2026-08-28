/**
 * The single client-side statement of which permission each portal section
 * needs, and where a role belongs when it has not asked for a specific page.
 *
 * App.tsx builds its route guards from this, the header builds its navigation
 * from it, and the sign-in redirect checks against it, so the three can never
 * disagree. These are usability controls; the API enforces the same permissions
 * independently on every request.
 */

export const ROUTE_PERMISSION = {
  projectCreate: "project:create",
  projects: "project:read",
  vendor: "vendor:profile:read",
  vendorOpportunities: "vendor:opportunity:read",
  vendorRegistry: "vendor:registry:read",
  status: "system:status:read",
} as const;

/**
 * Longest prefix wins, so `/projects/new` is matched before `/projects` and
 * `/vendor/opportunities` before `/vendor`. Order in this list is the
 * precedence.
 */
const PATH_RULES: ReadonlyArray<readonly [string, string]> = [
  ["/projects/new", ROUTE_PERMISSION.projectCreate],
  ["/projects", ROUTE_PERMISSION.projects],
  ["/vendor/opportunities", ROUTE_PERMISSION.vendorOpportunities],
  ["/vendor", ROUTE_PERMISSION.vendor],
  ["/admin/suppliers", ROUTE_PERMISSION.vendorRegistry],
  ["/status", ROUTE_PERMISSION.status],
];

/** Reachable without signing in. Never a post-sign-in redirect target. */
export const PUBLIC_PATHS: readonly string[] = ["/login", "/register"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function permissionForPath(pathname: string): string | undefined {
  const path = pathname.split("?")[0] ?? pathname;

  for (const [prefix, permission] of PATH_RULES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return permission;
    }
  }

  return undefined;
}

export function canAccessPath(
  pathname: string,
  hasPermission: (permission: string) => boolean,
): boolean {
  if (isPublicPath(pathname)) {
    return false;
  }

  const permission = permissionForPath(pathname);
  return permission === undefined || hasPermission(permission);
}

/**
 * Where this role starts. Ordered most-specific first: a vendor is sent to the
 * supplier workspace before anything else, so a future permission grant to
 * vendors cannot silently move their landing page into the government portal.
 *
 * Returns undefined when a role can reach no section at all, so callers render
 * an explanation rather than redirecting in a loop.
 */
export function landingPathFor(
  hasPermission: (permission: string) => boolean,
): string | undefined {
  if (hasPermission(ROUTE_PERMISSION.vendor)) return "/vendor";
  if (hasPermission(ROUTE_PERMISSION.projects)) return "/projects";
  if (hasPermission(ROUTE_PERMISSION.vendorRegistry)) return "/admin/suppliers";
  if (hasPermission(ROUTE_PERMISSION.status)) return "/status";
  return undefined;
}

export interface NavItem {
  to: string;
  label: string;
  permission: string;
  /** Marked active for any path beneath it, not only an exact match. */
  matchPrefix?: string;
}

/**
 * Primary navigation. Filtered by permission, so each role sees only its own
 * portal: a government official never sees supplier navigation, and a supplier
 * never sees the procurement register.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: "/projects",
    label: "Procurement Projects",
    permission: ROUTE_PERMISSION.projects,
    matchPrefix: "/projects",
  },
  { to: "/vendor", label: "Supplier Dashboard", permission: ROUTE_PERMISSION.vendor },
  {
    to: "/vendor/opportunities",
    label: "Procurement Opportunities",
    permission: ROUTE_PERMISSION.vendorOpportunities,
    matchPrefix: "/vendor/opportunities",
  },
  {
    to: "/vendor/profile",
    label: "Capability Profile",
    permission: ROUTE_PERMISSION.vendor,
    matchPrefix: "/vendor/profile",
  },
  {
    to: "/admin/suppliers",
    label: "Supplier Registry",
    permission: ROUTE_PERMISSION.vendorRegistry,
    matchPrefix: "/admin/suppliers",
  },
  { to: "/status", label: "System Status", permission: ROUTE_PERMISSION.status },
];
