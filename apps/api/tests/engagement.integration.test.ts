/**
 * End-to-end tests for Milestone 7 — shortlisting, invitation, notification and
 * the supplier's response.
 *
 * These go over HTTP rather than calling the repositories, because what they
 * verify is the part a unit test cannot reach: that the session decides who the
 * caller is, that the permission table decides what they may do, and that an id
 * arriving in a URL or a request body is never enough on its own. Almost every
 * assertion below is about a request that must be refused.
 *
 * Run with:
 *   npm run migrate && npm run seed
 *   npm run dev            # in another terminal
 *   npm run test:integration
 *
 * The suite skips rather than fails when the API is not running, so a
 * contributor without a local server can still run `npm test`.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { loadConfig } from "../src/config/env.js";
import { closePool, query } from "../src/db/pool.js";

try {
  loadConfig();
} catch {
  // No .env — the suite skips below.
}

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";

let serverUp = false;

// Probed at module scope: `describe`'s skip flag is read while the suites are
// being declared, which happens before any hook runs.
try {
  const probe = await fetch(`${BASE}/health`, {
    signal: AbortSignal.timeout(2000),
  });
  serverUp = probe.ok;
} catch {
  serverUp = false;
}

const canRun = serverUp && PASSWORD !== "" && process.env.DATABASE_URL !== undefined;

// ---------------------------------------------------------------------------
// A minimal cookie-carrying client. `fetch` does not keep cookies, and the
// session cookie is the whole point of these tests.
// ---------------------------------------------------------------------------

interface Session {
  cookie: string;
  userId: string;
  organizationId: string;
}

interface ApiResponse<T> {
  status: number;
  code?: string;
  message?: string;
  data?: T;
}

async function call<T>(
  session: Session | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session === undefined ? {} : { Cookie: session.cookie }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const payload = (await response.json().catch(() => undefined)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | undefined;

  return {
    status: response.status,
    code: payload?.error?.code,
    message: payload?.error?.message,
    data: payload?.data,
  };
}

async function signIn(email: string): Promise<Session> {
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  assert.equal(response.status, 200, `sign-in failed for ${email}`);

  const setCookie = response.headers.getSetCookie().at(0);
  assert.ok(setCookie !== undefined, `no session cookie for ${email}`);

  const payload = (await response.json()) as {
    data: { user: { id: string; organizationId: string } };
  };

  return {
    cookie: setCookie.split(";")[0] ?? "",
    userId: payload.data.user.id,
    organizationId: payload.data.user.organizationId,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Recommendation {
  vendor: { vendorProfileId: string; organizationName: string };
  rank: number | null;
  overallScore: number;
  eligible: boolean;
}

interface MatchView {
  workPackage: { id: string; status: string; packageNumber: string; title: string };
  recommendations: Recommendation[];
  excluded: Recommendation[];
  shortlist: Array<{
    vendorProfileId: string;
    reason: string | null;
    addedByName: string;
    invitationId: string | null;
    invitationStatus: string | null;
  }>;
  invitations: Array<{
    id: string;
    vendorProfileId: string;
    status: string;
    message: string | null;
    responseDeadline: string | null;
    invitedByName: string;
    respondedAt: string | null;
    responseNote: string | null;
  }>;
}

interface VendorInvitationView {
  id: string;
  status: string;
  packageNumber: string;
  departmentName: string;
  message: string | null;
}

let infraOfficial: Session;
let healthOfficial: Session;
let admin: Session;
let energySupplier: Session;
let manufacturingSupplier: Session;

let confirmedPackageId = "";
let unconfirmedPackageId = "";
let otherPackageId = "";

/** vendor_profiles.id for the supplier accounts the tests act as. */
let energyProfileId = "";
let manufacturingProfileId = "";

/** A supplier the eligibility gate excluded from `confirmedPackageId`. */
let ineligibleProfileId = "";

/** Rolled back at the end so the suite can be re-run against the same seed. */
const createdInvitationIds: string[] = [];
const shortlistedProfileIds: string[] = [];

before(async () => {
  if (!canRun) return;

  [infraOfficial, healthOfficial, admin, energySupplier, manufacturingSupplier] =
    await Promise.all([
      signIn("official@procureai.local"),
      signIn("official.health@procureai.local"),
      signIn("admin@procureai.local"),
      signIn("supplier.energy@procureai.local"),
      signIn("supplier.manufacturing@procureai.local"),
    ]);

  const packages = await query<{ id: string; status: string; package_number: string }>(
    `SELECT wp.id, wp.status::text, wp.package_number
     FROM work_packages wp
     JOIN procurement_projects pr ON pr.id = wp.project_id
     WHERE pr.reference_number = 'PRJ-2026-0201' AND wp.is_deleted = false
     ORDER BY wp.display_order`,
  );

  // WP-02 (solar street lighting) is the package the energy cooperative wins;
  // it is what makes the happy path a realistic demonstration rather than an
  // arbitrary pairing.
  confirmedPackageId = packages.rows.find((row) => row.package_number === "WP-02")?.id ?? "";
  otherPackageId = packages.rows.find((row) => row.package_number === "WP-01")?.id ?? "";
  unconfirmedPackageId = packages.rows.find((row) => row.status === "UNDER_REVIEW")?.id ?? "";

  const profiles = await query<{ id: string; code: string }>(
    `SELECT p.id, o.code
     FROM vendor_profiles p
     JOIN organizations o ON o.id = p.organization_id
     WHERE o.code IN ('VND-URJA-SAHKAR', 'VND-BHARAT-FAB')`,
  );
  energyProfileId = profiles.rows.find((row) => row.code === "VND-URJA-SAHKAR")?.id ?? "";
  manufacturingProfileId = profiles.rows.find((row) => row.code === "VND-BHARAT-FAB")?.id ?? "";

  // Clears any engagement left on this package by a previous session — a
  // browser walkthrough, an interrupted run, the demo script. The suite asserts
  // on state transitions ("the first invitation succeeds", "the second is
  // refused"), so it has to start from a known state rather than from whatever
  // the last person to touch the package left behind.
  await query(
    `DELETE FROM vendor_notifications
     WHERE invitation_id IN (
       SELECT id FROM work_package_invitations WHERE work_package_id = $1
     )`,
    [confirmedPackageId],
  );
  await query(`DELETE FROM work_package_invitations WHERE work_package_id = $1`, [
    confirmedPackageId,
  ]);
  await query(`DELETE FROM work_package_shortlist WHERE work_package_id = $1`, [
    confirmedPackageId,
  ]);
  await query(
    `DELETE FROM work_package_history
     WHERE work_package_id = $1
       AND action IN ('SHORTLISTED', 'SHORTLIST_REMOVED', 'INVITED',
                      'INVITATION_WITHDRAWN', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED')`,
    [confirmedPackageId],
  );

  // A fresh run, so every assertion below is against a stored ranking this test
  // produced rather than one left behind by a previous session.
  const run = await call<MatchView>(
    infraOfficial,
    "POST",
    `/api/v1/work-packages/${confirmedPackageId}/vendor-matches`,
  );
  assert.equal(run.status, 200, "matching run failed");
  ineligibleProfileId = run.data?.excluded[0]?.vendor.vendorProfileId ?? "";
});

after(async () => {
  if (canRun) {
    // Leaves the seeded demonstration data exactly as it was found: the
    // notifications, invitations and shortlist entries these tests created are
    // removed, and nothing produced by the seed script is touched.
    for (const id of createdInvitationIds) {
      await query(`DELETE FROM vendor_notifications WHERE invitation_id = $1`, [id]);
      await query(`DELETE FROM work_package_invitations WHERE id = $1`, [id]);
    }
    for (const profileId of shortlistedProfileIds) {
      await query(
        `DELETE FROM work_package_shortlist WHERE work_package_id = $1 AND vendor_profile_id = $2`,
        [confirmedPackageId, profileId],
      );
    }
    await query(
      `DELETE FROM work_package_history
       WHERE work_package_id = $1
         AND action IN ('SHORTLISTED', 'SHORTLIST_REMOVED', 'INVITED',
                        'INVITATION_WITHDRAWN', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED')`,
      [confirmedPackageId],
    );
  }

  await closePool();
});

// ---------------------------------------------------------------------------

describe("government recommendation review", { skip: !canRun }, () => {
  it("serves the stored ranking with dimensions, eligibility and evidence", async () => {
    const view = await call<MatchView & { recommendations: Array<Record<string, unknown>> }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches`,
    );

    assert.equal(view.status, 200);
    const top = view.data?.recommendations[0] as Record<string, any> | undefined;
    assert.ok(top !== undefined, "no eligible supplier was ranked");

    assert.equal(top.dimensions.length, 7, "all seven ranking dimensions are served");
    assert.deepEqual(
      top.dimensions.map((dimension: { key: string }) => dimension.key).sort(),
      [
        "capability",
        "capacity",
        "compliance",
        "credibility",
        "experience",
        "geographic",
        "semantic",
      ],
    );

    assert.ok(Array.isArray(top.retrievalSources) && top.retrievalSources.length > 0);
    assert.ok(Array.isArray(top.eligibility.passedChecks));
    assert.ok(Array.isArray(top.evidence.matchedCapabilities));
    assert.ok(Array.isArray(top.evidence.missingCapabilities));
    assert.ok(typeof top.explanation === "string" && top.explanation.length > 0);
  });

  it("refuses another department's work package with 404, not 403", async () => {
    const view = await call(
      healthOfficial,
      "GET",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches`,
    );

    assert.equal(view.status, 404);
    assert.equal(view.code, "NOT_FOUND");
  });

  it("refuses a supplier account outright", async () => {
    const view = await call(
      energySupplier,
      "GET",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches`,
    );

    assert.equal(view.status, 403);
  });
});

describe("shortlist", { skip: !canRun }, () => {
  it("refuses a supplier the eligibility gate excluded", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/shortlist`,
      { vendorProfileId: ineligibleProfileId, reason: "Attempting to bypass the gate." },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "SUPPLIER_NOT_ELIGIBLE");
  });

  it("refuses a supplier never assessed against this package", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${unconfirmedPackageId}/vendor-matches/shortlist`,
      { vendorProfileId: energyProfileId, reason: "Package is not confirmed." },
    );

    // The unconfirmed gate fires first, which is the stricter of the two.
    assert.equal(result.status, 409);
    assert.equal(result.code, "WORK_PACKAGE_NOT_CONFIRMED");
  });

  it("records the acting official, the reason and the rank at the time", async () => {
    const result = await call<MatchView>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/shortlist`,
      {
        vendorProfileId: energyProfileId,
        reason: "Strongest capability and geographic fit; ISO and BIS credentials on record.",
      },
    );
    shortlistedProfileIds.push(energyProfileId);

    assert.equal(result.status, 200);
    const entry = result.data?.shortlist.find((row) => row.vendorProfileId === energyProfileId);
    assert.ok(entry !== undefined);
    assert.equal(entry.addedByName, "A. Sharma");
    assert.match(entry.reason ?? "", /Strongest capability/);
    assert.equal(entry.invitationStatus, null, "a shortlisted supplier is not yet invited");
  });

  it("writes an attributable audit entry", async () => {
    const history = await query<{ action: string; actor_id: string; reason: string | null }>(
      `SELECT action::text, actor_id, reason FROM work_package_history
       WHERE work_package_id = $1 AND action = 'SHORTLISTED'
       ORDER BY created_at DESC LIMIT 1`,
      [confirmedPackageId],
    );

    const entry = history.rows[0];
    assert.ok(entry !== undefined, "shortlisting was not audited");
    assert.equal(entry.actor_id, infraOfficial.userId);
    assert.match(entry.reason ?? "", /Strongest capability/);
  });

  it("keeps the shortlist to one work package", async () => {
    const other = await call<MatchView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${otherPackageId}/vendor-matches`,
    );

    assert.equal(other.status, 200);
    assert.equal(
      other.data?.shortlist.some((row) => row.vendorProfileId === energyProfileId),
      false,
      "shortlisting for WP-02 must not shortlist for WP-01",
    );
  });

  it("refuses an administrator, who holds oversight but not the decision", async () => {
    const result = await call(
      admin,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/shortlist`,
      { vendorProfileId: manufacturingProfileId, reason: "Oversight should not decide." },
    );

    assert.equal(result.status, 403);
  });
});

describe("invitation", { skip: !canRun }, () => {
  it("refuses a supplier who is not on the shortlist", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations`,
      { vendorProfileId: manufacturingProfileId, message: null, responseDeadline: null },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "SUPPLIER_NOT_SHORTLISTED");
  });

  it("refuses an unconfirmed work package", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${unconfirmedPackageId}/vendor-matches/invitations`,
      { vendorProfileId: energyProfileId, message: null, responseDeadline: null },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "WORK_PACKAGE_NOT_CONFIRMED");
  });

  it("refuses another department's work package", async () => {
    const result = await call(
      healthOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations`,
      { vendorProfileId: energyProfileId, message: null, responseDeadline: null },
    );

    assert.equal(result.status, 404);
  });

  it("issues an invitation and notifies the supplier in the portal", async () => {
    const deadline = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);

    const result = await call<{ invitation: { id: string; status: string } }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations`,
      {
        vendorProfileId: energyProfileId,
        message: "Please confirm capacity for 1,240 units and a five-year maintenance term.",
        responseDeadline: deadline,
      },
    );

    assert.equal(result.status, 201);
    assert.equal(result.data?.invitation.status, "INVITED");
    createdInvitationIds.push(result.data?.invitation.id ?? "");

    const notifications = await query<{ category: string; title: string; link_path: string }>(
      `SELECT category, title, link_path FROM vendor_notifications
       WHERE invitation_id = $1`,
      [result.data?.invitation.id],
    );

    assert.equal(notifications.rows.length, 1, "exactly one notification per invitation");
    assert.equal(notifications.rows[0]?.category, "INVITATION");
    assert.equal(notifications.rows[0]?.title, "New procurement invitation");
    assert.match(notifications.rows[0]?.link_path ?? "", /^\/vendor\/invitations\//);
  });

  it("refuses a second live invitation to the same supplier", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations`,
      { vendorProfileId: energyProfileId, message: null, responseDeadline: null },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "INVITATION_ALREADY_OPEN");
  });

  it("refuses to drop a shortlist entry that holds a live invitation", async () => {
    const result = await call(
      infraOfficial,
      "DELETE",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/shortlist/${energyProfileId}`,
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "INVITATION_OPEN");
  });

  it("shows the invitation on the government tracking view", async () => {
    const view = await call<MatchView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches`,
    );

    const invitation = view.data?.invitations.find(
      (row) => row.vendorProfileId === energyProfileId,
    );

    assert.ok(invitation !== undefined);
    assert.equal(invitation.status, "INVITED");
    assert.equal(invitation.invitedByName, "A. Sharma");
    assert.ok(invitation.responseDeadline !== null);
    assert.equal(invitation.respondedAt, null);
  });
});

describe("supplier notifications", { skip: !canRun }, () => {
  it("counts the unread notification for the invited supplier", async () => {
    const summary = await call<{
      unreadCount: number;
      notifications: Array<{ id: string; invitationId: string | null; readAt: string | null }>;
      awaitingResponse: number;
    }>(energySupplier, "GET", "/api/v1/vendor/notifications/summary");

    assert.equal(summary.status, 200);
    assert.ok((summary.data?.unreadCount ?? 0) >= 1);
    assert.equal(summary.data?.awaitingResponse, 1);
    assert.ok(
      summary.data?.notifications.some(
        (notification) => notification.invitationId === createdInvitationIds[0],
      ),
      "the invitation notification is in the supplier's list",
    );
  });

  it("refuses to mark another supplier's notification read", async () => {
    const owned = await query<{ id: string }>(
      `SELECT id FROM vendor_notifications WHERE invitation_id = $1`,
      [createdInvitationIds[0]],
    );

    const result = await call(
      manufacturingSupplier,
      "POST",
      `/api/v1/vendor/notifications/${owned.rows[0]?.id}/read`,
    );

    assert.equal(result.status, 404, "another supplier's notification reads as absent");

    const unchanged = await query<{ read_at: Date | null }>(
      `SELECT read_at FROM vendor_notifications WHERE id = $1`,
      [owned.rows[0]?.id],
    );
    assert.equal(unchanged.rows[0]?.read_at, null, "and is not marked read");
  });

  it("marks the owner's own notification read and updates the count", async () => {
    const owned = await query<{ id: string }>(
      `SELECT id FROM vendor_notifications WHERE invitation_id = $1`,
      [createdInvitationIds[0]],
    );

    const before = await call<{ unreadCount: number }>(
      energySupplier,
      "GET",
      "/api/v1/vendor/notifications/summary",
    );

    const result = await call<{ read: boolean; unreadCount: number }>(
      energySupplier,
      "POST",
      `/api/v1/vendor/notifications/${owned.rows[0]?.id}/read`,
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.read, true);
    assert.equal(
      result.data?.unreadCount,
      (before.data?.unreadCount ?? 1) - 1,
      "the unread count falls by exactly one",
    );
  });
});

describe("supplier invitation response", { skip: !canRun }, () => {
  it("serves the invitation to its owner without any government-only data", async () => {
    const result = await call<VendorInvitationView & Record<string, unknown>>(
      energySupplier,
      "GET",
      `/api/v1/vendor/invitations/${createdInvitationIds[0]}`,
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.status, "INVITED");
    assert.equal(result.data?.departmentName, "Department of Infrastructure Development");
    assert.match(result.data?.message ?? "", /five-year maintenance/);

    for (const forbidden of [
      "rank",
      "overallScore",
      "dimensions",
      "eligibility",
      "shortlist",
      "reason",
      "recommendations",
      "semanticSimilarity",
    ]) {
      assert.equal(
        forbidden in (result.data ?? {}),
        false,
        `the supplier view must not carry \`${forbidden}\``,
      );
    }
  });

  it("refuses another supplier's invitation with 404", async () => {
    const result = await call(
      manufacturingSupplier,
      "GET",
      `/api/v1/vendor/invitations/${createdInvitationIds[0]}`,
    );

    assert.equal(result.status, 404);
  });

  it("refuses another supplier's response, and the invitation stays open", async () => {
    const result = await call(
      manufacturingSupplier,
      "POST",
      `/api/v1/vendor/invitations/${createdInvitationIds[0]}/respond`,
      { decision: "ACCEPTED", note: null },
    );

    assert.equal(result.status, 404);

    const row = await query<{ status: string; responded_by: string | null }>(
      `SELECT status::text, responded_by FROM work_package_invitations WHERE id = $1`,
      [createdInvitationIds[0]],
    );
    assert.equal(row.rows[0]?.status, "INVITED");
    assert.equal(row.rows[0]?.responded_by, null);
  });

  it("refuses a government official acting on a supplier's invitation", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/vendor/invitations/${createdInvitationIds[0]}/respond`,
      { decision: "ACCEPTED", note: null },
    );

    assert.equal(result.status, 403);
  });

  it("requires a reason when declining", async () => {
    const result = await call(
      energySupplier,
      "POST",
      `/api/v1/vendor/invitations/${createdInvitationIds[0]}/respond`,
      { decision: "DECLINED", note: null },
    );

    assert.equal(result.status, 400);
    assert.equal(result.code, "VALIDATION_ERROR");
  });

  it("accepts, attributes the answer, and audits it", async () => {
    const result = await call<{ status: string; respondedAt: string | null }>(
      energySupplier,
      "POST",
      `/api/v1/vendor/invitations/${createdInvitationIds[0]}/respond`,
      { decision: "ACCEPTED", note: "Capacity confirmed for the stated quantity." },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.status, "ACCEPTED");
    assert.ok(result.data?.respondedAt !== null);

    const row = await query<{ responded_by: string; response_note: string }>(
      `SELECT responded_by, response_note FROM work_package_invitations WHERE id = $1`,
      [createdInvitationIds[0]],
    );
    assert.equal(row.rows[0]?.responded_by, energySupplier.userId);
    assert.match(row.rows[0]?.response_note ?? "", /Capacity confirmed/);

    const history = await query<{ actor_id: string }>(
      `SELECT actor_id FROM work_package_history
       WHERE work_package_id = $1 AND action = 'INVITATION_ACCEPTED'
       ORDER BY created_at DESC LIMIT 1`,
      [confirmedPackageId],
    );
    assert.equal(
      history.rows[0]?.actor_id,
      energySupplier.userId,
      "the acceptance is attributed to the supplier's own user",
    );
  });

  it("refuses a second answer", async () => {
    const result = await call(
      energySupplier,
      "POST",
      `/api/v1/vendor/invitations/${createdInvitationIds[0]}/respond`,
      { decision: "DECLINED", note: "Changed our mind." },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "INVITATION_NOT_OPEN");
  });

  it("refuses to withdraw an invitation the supplier has accepted", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations/${createdInvitationIds[0]}/withdraw`,
      { reason: "No longer required." },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "INVITATION_NOT_OPEN");
  });

  it("shows the acceptance on the government tracking view", async () => {
    const view = await call<MatchView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches`,
    );

    const invitation = view.data?.invitations.find(
      (row) => row.id === createdInvitationIds[0],
    );

    assert.equal(invitation?.status, "ACCEPTED");
    assert.match(invitation?.responseNote ?? "", /Capacity confirmed/);

    const entry = view.data?.shortlist.find((row) => row.vendorProfileId === energyProfileId);
    assert.equal(entry?.invitationStatus, "ACCEPTED");
  });

  it("does not leak a supplier's invitations across organizations", async () => {
    const mine = await call<Array<{ id: string }>>(
      manufacturingSupplier,
      "GET",
      "/api/v1/vendor/invitations",
    );

    assert.equal(mine.status, 200);
    assert.equal(
      mine.data?.some((invitation) => invitation.id === createdInvitationIds[0]),
      false,
    );
  });
});

describe("withdrawal and decline", { skip: !canRun }, () => {
  let secondInvitationId = "";

  it("issues a second invitation to a different supplier", async () => {
    const shortlisted = await call<MatchView>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/shortlist`,
      { vendorProfileId: manufacturingProfileId, reason: "Second source for the same package." },
    );
    assert.equal(shortlisted.status, 200);
    shortlistedProfileIds.push(manufacturingProfileId);

    const result = await call<{ invitation: { id: string } }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations`,
      { vendorProfileId: manufacturingProfileId, message: null, responseDeadline: null },
    );

    assert.equal(result.status, 201);
    secondInvitationId = result.data?.invitation.id ?? "";
    createdInvitationIds.push(secondInvitationId);
  });

  it("lets the supplier decline with a stated reason", async () => {
    const result = await call<{ status: string }>(
      manufacturingSupplier,
      "POST",
      `/api/v1/vendor/invitations/${secondInvitationId}/respond`,
      { decision: "DECLINED", note: "No capacity within the stated delivery window." },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.status, "DECLINED");

    const history = await query<{ reason: string | null }>(
      `SELECT reason FROM work_package_history
       WHERE work_package_id = $1 AND action = 'INVITATION_DECLINED'
       ORDER BY created_at DESC LIMIT 1`,
      [confirmedPackageId],
    );
    assert.match(history.rows[0]?.reason ?? "", /No capacity/);
  });

  it("allows a fresh invitation once the previous one is closed", async () => {
    const result = await call<{ invitation: { id: string; status: string } }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations`,
      { vendorProfileId: manufacturingProfileId, message: "Revised delivery window.", responseDeadline: null },
    );

    assert.equal(result.status, 201, "a declined invitation does not block a fresh one");
    createdInvitationIds.push(result.data?.invitation.id ?? "");
  });

  it("withdraws an open invitation and notifies the supplier", async () => {
    const latest = createdInvitationIds.at(-1) ?? "";

    const result = await call<MatchView>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations/${latest}/withdraw`,
      { reason: "The package scope is being revised." },
    );

    assert.equal(result.status, 200);
    assert.equal(
      result.data?.invitations.find((row) => row.id === latest)?.status,
      "WITHDRAWN",
    );

    const notifications = await query<{ title: string }>(
      `SELECT title FROM vendor_notifications WHERE invitation_id = $1 ORDER BY created_at DESC`,
      [latest],
    );
    assert.equal(notifications.rows[0]?.title, "Procurement invitation withdrawn");
  });

  it("refuses a withdrawal from another department", async () => {
    const result = await call(
      healthOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches/invitations/${createdInvitationIds[0]}/withdraw`,
      { reason: "Not ours to withdraw." },
    );

    assert.equal(result.status, 404);
  });

  it("refuses an invitation id from a different work package in the same department", async () => {
    assert.ok(otherPackageId !== "", "WP-01 is needed for this test");

    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${otherPackageId}/vendor-matches/invitations/${createdInvitationIds[0]}/withdraw`,
      { reason: "Wrong package." },
    );

    assert.equal(result.status, 404);
  });
});

describe("regression — Milestone 6 is unchanged", { skip: !canRun }, () => {
  it("still ranks, still excludes, and still explains", async () => {
    const run = await call<MatchView & { run: Record<string, unknown> }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches`,
    );

    assert.equal(run.status, 200);
    assert.ok((run.data?.recommendations.length ?? 0) > 0, "eligible suppliers are ranked");
    assert.ok((run.data?.excluded.length ?? 0) > 0, "excluded suppliers are still reported");
    assert.equal(
      run.data?.recommendations.every((entry) => entry.eligible),
      true,
      "nothing failing the gate reaches the ranking",
    );
    assert.equal(
      run.data?.recommendations[0]?.rank,
      1,
      "ranking positions survive the re-run",
    );
  });

  it("keeps the shortlist and the invitations across a re-run", async () => {
    const view = await call<MatchView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${confirmedPackageId}/vendor-matches`,
    );

    assert.ok(
      view.data?.shortlist.some((row) => row.vendorProfileId === energyProfileId),
      "recalculating matching does not clear the shortlist",
    );
    assert.ok(
      (view.data?.invitations.length ?? 0) >= 2,
      "recalculating matching does not clear the invitations",
    );
  });

  it("still refuses a supplier the vendor portal never assessed", async () => {
    const dashboard = await call<{ counts: Record<string, number> }>(
      energySupplier,
      "GET",
      "/api/v1/vendor/dashboard",
    );

    assert.equal(dashboard.status, 200);
    assert.equal(typeof dashboard.data?.counts.invitations, "number");
    assert.equal(typeof dashboard.data?.counts.openOpportunities, "number");
  });
});

describe("permission table", { skip: !canRun }, () => {
  it("grants the supplier only its own invitation permissions", async () => {
    const { ROLE_PERMISSIONS } = await import("../src/auth/permissions.js");

    assert.ok(ROLE_PERMISSIONS.VENDOR.includes("vendor:invitation:read"));
    assert.ok(ROLE_PERMISSIONS.VENDOR.includes("vendor:invitation:respond"));
    assert.equal(ROLE_PERMISSIONS.VENDOR.includes("vendor:invitation:manage"), false);
    assert.equal(ROLE_PERMISSIONS.VENDOR.includes("vendor:matching:read"), false);
    assert.equal(ROLE_PERMISSIONS.VENDOR.includes("vendor:shortlist:manage"), false);
  });

  it("keeps the administrator out of procurement decisions", async () => {
    const { ROLE_PERMISSIONS } = await import("../src/auth/permissions.js");

    assert.equal(ROLE_PERMISSIONS.ADMIN.includes("vendor:invitation:manage"), false);
    assert.equal(ROLE_PERMISSIONS.ADMIN.includes("vendor:shortlist:manage"), false);
    assert.ok(ROLE_PERMISSIONS.ADMIN.includes("vendor:matching:read"), "oversight may still read");
  });

  it("gives the government official the invitation permission and no supplier one", async () => {
    const { ROLE_PERMISSIONS } = await import("../src/auth/permissions.js");

    assert.ok(ROLE_PERMISSIONS.GOVERNMENT_OFFICIAL.includes("vendor:invitation:manage"));
    assert.equal(
      ROLE_PERMISSIONS.GOVERNMENT_OFFICIAL.includes("vendor:invitation:respond"),
      false,
    );
  });
});
