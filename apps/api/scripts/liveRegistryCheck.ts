/**
 * Exercises the running application against the seeded supplier registry.
 *
 *   npx tsx scripts/liveRegistryCheck.ts
 *
 * Everything here goes over HTTP against a running API, signing in as real
 * accounts, so it verifies the same paths the portal uses rather than the
 * database directly: the administrator registry listing, a supplier's own
 * dashboard, profile, documents and notifications, the permission boundaries
 * between the two sides, and a work-package matching read.
 *
 * Read-only apart from the sessions it creates. It runs no matching, so it will
 * not rewrite a stored ranking.
 */

import { loadConfig } from "../src/config/env.js";
import { closePool, query } from "../src/db/pool.js";

loadConfig();

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";
const out: string[] = [];

async function login(email: string): Promise<string> {
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (response.status !== 200) throw new Error(`sign-in for ${email} returned ${response.status}`);
  return (response.headers.getSetCookie().at(0) ?? "").split(";")[0] ?? "";
}

async function get(cookie: string, path: string): Promise<{ status: number; data: any }> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json", ...(cookie === "" ? {} : { Cookie: cookie }) },
  });
  const body = (await response.json().catch(() => undefined)) as { data?: unknown } | undefined;
  return { status: response.status, data: body?.data };
}

const admin = await login("admin@procureai.local");
const official = await login("official@procureai.local");

const registry = await get(admin, "/api/v1/vendor-registry");
const rows = (registry.data ?? []) as Array<{
  verificationState: string;
  completionPercentage: number;
  pendingDocumentCount: number;
  documentCount: number;
}>;

out.push(
  `administrator registry: HTTP ${registry.status}, ${rows.length} suppliers, ` +
    `${rows.filter((r) => r.verificationState === "VERIFIED").length} verified, ` +
    `${rows.filter((r) => r.completionPercentage === 100).length} at 100%, ` +
    `${rows.filter((r) => r.documentCount > 0).length} with documents, ` +
    `${rows.filter((r) => r.pendingDocumentCount > 0).length} with a document pending review`,
);
out.push("");

const sampled = [
  "supplier.shakti.foundry@procureai.local",
  "supplier.annapurna.shg@procureai.local",
  "supplier.pathik.roads@procureai.local",
  "supplier.arogya.medequip@procureai.local",
  "vendor@procureai.local",
  "supplier.manufacturing@procureai.local",
];

for (const email of sampled) {
  const cookie = await login(email);
  const dashboard = await get(cookie, "/api/v1/vendor/dashboard");
  const profile = await get(cookie, "/api/v1/vendor/profile");
  const documents = await get(cookie, "/api/v1/vendor/profile/documents");
  const notifications = await get(cookie, "/api/v1/vendor/notifications/summary");
  const documentList = (documents.data ?? []) as Array<{ verificationState: string }>;

  out.push(
    `${email.padEnd(46)} dashboard ${dashboard.status}  profile ${profile.status} ` +
      `${String(profile.data?.completion?.percentage).padStart(3)}% ${String(profile.data?.profile?.verificationState).padEnd(9)} ` +
      `documents ${documentList.length} (${documentList.filter((d) => d.verificationState === "VERIFIED").length} verified)  ` +
      `offerings ${(profile.data?.offerings ?? []).length} experience ${(profile.data?.experience ?? []).length} ` +
      `credentials ${(profile.data?.credentials ?? []).length}  unread ${notifications.data?.unreadCount}`,
  );
}

out.push("");

const vendorCookie = await login("supplier.shakti.foundry@procureai.local");
out.push(
  `permission checks: vendor -> registry ${(await get(vendorCookie, "/api/v1/vendor-registry")).status} (expect 403), ` +
    `official -> vendor profile ${(await get(official, "/api/v1/vendor/profile")).status} (expect 403), ` +
    `anonymous -> registry ${(await get("", "/api/v1/vendor-registry")).status} (expect 401)`,
);

const packages = await query<{ id: string; number: string }>(
  `SELECT wp.id, wp.package_number AS number
   FROM work_packages wp
   JOIN procurement_projects pr ON pr.id = wp.project_id
   WHERE pr.reference_number = 'PRJ-2026-0201' AND wp.status = 'CONFIRMED'
   ORDER BY wp.display_order`,
);

out.push("");
for (const workPackage of packages.rows) {
  const view = await get(official, `/api/v1/work-packages/${workPackage.id}/vendor-matches`);
  const recommendations = (view.data?.recommendations ?? []) as Array<{
    rank: number;
    overallScore: number;
    vendor: { organizationName: string };
  }>;
  out.push(
    `${workPackage.number} matching read: HTTP ${view.status}, pool ${view.data?.run?.poolSize}, ` +
      `${recommendations.length} ranked, ${(view.data?.excluded ?? []).length} excluded, ` +
      `top ${recommendations[0]?.overallScore ?? "-"} ${recommendations[0]?.vendor.organizationName ?? "none"}`,
  );
}

const intact = await query<Record<string, string>>(
  `SELECT (SELECT COUNT(*)::text FROM procurement_projects) AS projects,
          (SELECT COUNT(*)::text FROM work_packages) AS work_packages,
          (SELECT COUNT(*)::text FROM project_requirements) AS requirements,
          (SELECT COUNT(*)::text FROM work_package_shortlist) AS shortlist,
          (SELECT COUNT(*)::text FROM work_package_invitations) AS invitations,
          (SELECT COUNT(*)::text FROM work_package_responses) AS responses,
          (SELECT COUNT(*)::text FROM work_package_match_runs) AS match_runs`,
);

const counts = intact.rows[0] ?? {};
out.push("");
out.push(
  `procurement data intact: ${counts.projects} projects, ${counts.work_packages} work packages, ` +
    `${counts.requirements} requirements, ${counts.shortlist} shortlist entries, ` +
    `${counts.invitations} invitations, ${counts.responses} responses, ${counts.match_runs} match runs`,
);

process.stdout.write(out.join("\n") + "\n");
await closePool();
