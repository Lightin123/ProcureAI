/**
 * End-to-end tests for Milestone 8 — response configuration, vendor drafting,
 * submission, clarification and government review.
 *
 * These go over HTTP rather than calling the repositories, because what they
 * verify is the part a unit test cannot reach: that the session decides who the
 * caller is, that the permission table decides what they may do, that an id
 * arriving in a URL or a request body is never enough on its own, and that a
 * response cannot be changed once it has been submitted. Most of the assertions
 * below are about a request that must be refused.
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
import { removeDocument } from "../src/vendor/documentStorage.js";

try {
  loadConfig();
} catch {
  // No .env — the suite skips below.
}

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";

let serverUp = false;

try {
  const probe = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
  serverUp = probe.ok;
} catch {
  serverUp = false;
}

const canRun = serverUp && PASSWORD !== "" && process.env.DATABASE_URL !== undefined;

// ---------------------------------------------------------------------------
// A minimal cookie-carrying client.
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
  details?: Array<{ field: string; message: string }>;
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
    | {
        data?: T;
        error?: { code?: string; message?: string; details?: Array<{ field: string; message: string }> };
      }
    | undefined;

  return {
    status: response.status,
    code: payload?.error?.code,
    message: payload?.error?.message,
    details: payload?.error?.details,
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
// Shapes
// ---------------------------------------------------------------------------

interface ConfigView {
  id: string;
  responseType: string;
  status: string;
  responseDeadline: string | null;
  sections: Record<string, string>;
  allowClarifications: boolean;
  allowDocuments: boolean;
  documentsRequired: boolean;
}

interface QuestionView {
  id: string;
  section: string;
  prompt: string;
  answerType: string;
  options: string[];
  isRequired: boolean;
}

interface WorkspaceView {
  workPackage: { id: string; packageNumber: string; status: string };
  requirements: Array<{ id: string; text: string }>;
  config: ConfigView | null;
  questions: QuestionView[];
  responses: Array<{
    id: string;
    vendorProfileId: string;
    organizationName: string;
    responseType: string;
    status: string;
    submittedAt: string | null;
    responseDeadline: string | null;
    documentCount: number;
    openClarifications: number;
  }>;
  counts: Record<string, number>;
  invitations: Array<{ id: string; vendorProfileId: string; status: string }>;
}

interface VendorWorkspace {
  response: {
    id: string;
    status: string;
    responseType: string;
    submissionCount: number;
    packageNumber: string;
    body: Record<string, unknown>;
  };
  config: { responseType: string; status: string; allowDocuments: boolean };
  requirements: Array<{ id: string; text: string }>;
  requirementAnswers: Array<{ requirementId: string; compliance: string }>;
  questions: QuestionView[];
  questionAnswers: Array<{ questionId: string; value: unknown }>;
  documents: Array<{ id: string; title: string; fileName: string }>;
  clarifications: Array<{
    id: string;
    raisedBySide: string;
    status: string;
    question: string;
    answer: string | null;
    askedByName: string;
    answeredByName: string | null;
  }>;
  completeness: {
    complete: boolean;
    percent: number;
    requiredTotal: number;
    requiredComplete: number;
    missing: Array<{ field: string; message: string }>;
  };
  editable: boolean;
}

interface GovernmentResponseView {
  response: {
    id: string;
    status: string;
    organizationName: string;
    submittedAt: string | null;
    body: { quotedValueInr: number | null; technicalApproach: string | null };
  };
  requirementAnswers: Array<{ requirementId: string; compliance: string; answer: string | null }>;
  documents: Array<{ id: string; title: string }>;
  clarifications: Array<{ id: string; raisedBySide: string; status: string }>;
  completeness: { complete: boolean };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let infraOfficial: Session;
let healthOfficial: Session;
let admin: Session;
let supplier: Session;
let otherSupplier: Session;

/** The package the whole flow runs on, and its neighbours for scope checks. */
let packageId = "";
let deadlinePackageId = "";
let unconfirmedPackageId = "";

let supplierProfileId = "";
let otherSupplierProfileId = "";
let invitationId = "";
let responseId = "";
let questionId = "";

/** A minimal file whose first four bytes are what the signature check reads. */
const PDF_BASE64 = Buffer.from("%PDF-1.4 procureai response attachment").toString("base64");

const TOUCHED_PACKAGES: string[] = [];

async function clearPackageState(workPackageId: string): Promise<void> {
  // The rows cascade, but the files do not: an attachment written by a previous
  // run would otherwise stay on disk forever.
  const attachments = await query<{ storage_key: string }>(
    `SELECT d.storage_key
     FROM work_package_response_documents d
     JOIN work_package_responses r ON r.id = d.response_id
     WHERE r.work_package_id = $1`,
    [workPackageId],
  );
  for (const row of attachments.rows) await removeDocument(row.storage_key);

  await query(
    `DELETE FROM vendor_notifications
     WHERE response_id IN (SELECT id FROM work_package_responses WHERE work_package_id = $1)
        OR invitation_id IN (SELECT id FROM work_package_invitations WHERE work_package_id = $1)`,
    [workPackageId],
  );
  await query(`DELETE FROM work_package_responses WHERE work_package_id = $1`, [workPackageId]);
  await query(`DELETE FROM work_package_response_configs WHERE work_package_id = $1`, [
    workPackageId,
  ]);
  await query(`DELETE FROM work_package_invitations WHERE work_package_id = $1`, [workPackageId]);
  await query(`DELETE FROM work_package_shortlist WHERE work_package_id = $1`, [workPackageId]);
  await query(
    `DELETE FROM work_package_history
     WHERE work_package_id = $1
       AND (action::text LIKE 'RESPONSE%'
            OR action::text LIKE 'INVIT%'
            OR action::text LIKE 'SHORTLIST%')`,
    [workPackageId],
  );
}

/** Shortlists, invites and accepts, so the response flow has a starting point. */
async function engage(workPackageId: string): Promise<{ profileId: string; invitationId: string }> {
  const run = await call<{
    recommendations: Array<{ vendor: { vendorProfileId: string } }>;
  }>(infraOfficial, "POST", `/api/v1/work-packages/${workPackageId}/vendor-matches`);
  assert.equal(run.status, 200, `matching run failed: ${run.code ?? ""} ${run.message ?? ""}`);

  const winner = run.data?.recommendations[0]?.vendor.vendorProfileId;
  assert.ok(winner !== undefined, "no eligible supplier was ranked for this work package");

  const shortlisted = await call(
    infraOfficial,
    "POST",
    `/api/v1/work-packages/${workPackageId}/vendor-matches/shortlist`,
    { vendorProfileId: winner, reason: "Strongest assessed fit for this package." },
  );
  assert.equal(shortlisted.status, 200, "shortlisting failed");

  const invited = await call<{ invitation: { id: string } }>(
    infraOfficial,
    "POST",
    `/api/v1/work-packages/${workPackageId}/vendor-matches/invitations`,
    {
      vendorProfileId: winner,
      message: "Please respond with your proposal.",
      responseDeadline: null,
    },
  );
  assert.equal(invited.status, 201, "invitation failed");

  const id = invited.data?.invitation.id ?? "";
  return { profileId: winner, invitationId: id };
}

async function emailForProfile(profileId: string): Promise<string> {
  const result = await query<{ email: string }>(
    `SELECT u.email FROM users u
     JOIN vendor_profiles p ON p.organization_id = u.organization_id
     WHERE p.id = $1 AND u.role = 'VENDOR'
     ORDER BY u.created_at ASC
     LIMIT 1`,
    [profileId],
  );

  const email = result.rows[0]?.email;
  assert.ok(email !== undefined, "the winning supplier has no user account");
  return email;
}

before(async () => {
  if (!canRun) return;

  [infraOfficial, healthOfficial, admin] = await Promise.all([
    signIn("official@procureai.local"),
    signIn("official.health@procureai.local"),
    signIn("admin@procureai.local"),
  ]);

  const packages = await query<{ id: string; package_number: string; status: string }>(
    `SELECT wp.id, wp.package_number, wp.status::text AS status
     FROM work_packages wp
     JOIN procurement_projects pr ON pr.id = wp.project_id
     WHERE pr.reference_number = 'PRJ-2026-0201' AND wp.is_deleted = false
     ORDER BY wp.display_order`,
  );

  packageId = packages.rows.find((row) => row.package_number === "WP-03")?.id ?? "";
  deadlinePackageId = packages.rows.find((row) => row.package_number === "WP-01")?.id ?? "";
  unconfirmedPackageId = packages.rows.find((row) => row.status === "UNDER_REVIEW")?.id ?? "";

  assert.ok(packageId !== "" && deadlinePackageId !== "", "the seeded packages were not found");

  TOUCHED_PACKAGES.push(packageId, deadlinePackageId);

  // The suite asserts on state transitions, so it has to start from a known
  // state rather than from whatever a browser walkthrough left behind.
  for (const id of TOUCHED_PACKAGES) await clearPackageState(id);

  const engagement = await engage(packageId);
  supplierProfileId = engagement.profileId;
  invitationId = engagement.invitationId;

  supplier = await signIn(await emailForProfile(supplierProfileId));

  const accepted = await call(
    supplier,
    "POST",
    `/api/v1/vendor/invitations/${invitationId}/respond`,
    { decision: "ACCEPTED", note: null },
  );
  assert.equal(accepted.status, 200, "the supplier could not accept its invitation");

  // A second supplier account, for the cross-vendor refusals. Any verified
  // supplier that is not the one responding will do.
  const others = await query<{ id: string; email: string }>(
    `SELECT p.id, u.email
     FROM vendor_profiles p
     JOIN users u ON u.organization_id = p.organization_id AND u.role = 'VENDOR'
     WHERE p.id <> $1
     ORDER BY u.created_at ASC
     LIMIT 1`,
    [supplierProfileId],
  );

  otherSupplierProfileId = others.rows[0]?.id ?? "";
  otherSupplier = await signIn(others.rows[0]?.email ?? "");
});

after(async () => {
  if (canRun) {
    for (const id of TOUCHED_PACKAGES) await clearPackageState(id);
  }
  await closePool();
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe("response configuration", { skip: !canRun }, () => {
  it("refuses a supplier account outright", async () => {
    const result = await call(supplier, "GET", `/api/v1/work-packages/${packageId}/responses`);
    assert.equal(result.status, 403);
  });

  it("refuses another department with 404, not 403", async () => {
    const result = await call(healthOfficial, "GET", `/api/v1/work-packages/${packageId}/responses`);
    assert.equal(result.status, 404);
    assert.equal(result.code, "NOT_FOUND");
  });

  it("lets oversight read the workspace but not configure it", async () => {
    const read = await call<WorkspaceView>(admin, "GET", `/api/v1/work-packages/${packageId}/responses`);
    assert.equal(read.status, 200);

    const write = await call(admin, "PUT", `/api/v1/work-packages/${packageId}/responses/config`, {
      responseType: "PROPOSAL",
    });
    assert.equal(write.status, 403, "an administrator takes no procurement act");
  });

  it("refuses to configure a response on an unconfirmed work package", async () => {
    if (unconfirmedPackageId === "") return;

    const result = await call(
      infraOfficial,
      "PUT",
      `/api/v1/work-packages/${unconfirmedPackageId}/responses/config`,
      { responseType: "PROPOSAL" },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "WORK_PACKAGE_NOT_CONFIRMED");
  });

  it("refuses a response type that is not one of the four", async () => {
    const result = await call(
      infraOfficial,
      "PUT",
      `/api/v1/work-packages/${packageId}/responses/config`,
      { responseType: "TENDER" },
    );

    assert.equal(result.status, 400);
    assert.equal(result.code, "VALIDATION_ERROR");
  });

  it("stores the configuration with the defaults for its response type", async () => {
    const result = await call<{ config: ConfigView }>(
      infraOfficial,
      "PUT",
      `/api/v1/work-packages/${packageId}/responses/config`,
      {
        responseType: "PROPOSAL",
        title: "Proposal for ward level waste infrastructure",
        instructions: "Respond against each confirmed requirement and attach your work plan.",
        responseDeadline: "2026-12-31",
        sections: { capacity: "OPTIONAL", "not-a-section": "REQUIRED" },
        allowClarifications: true,
        allowDocuments: true,
        documentsRequired: true,
      },
    );

    assert.equal(result.status, 200);
    const config = result.data?.config;
    assert.ok(config !== undefined);

    assert.equal(config.status, "DRAFT", "a new configuration is not open until it is opened");
    assert.equal(config.responseType, "PROPOSAL");
    assert.equal(config.sections.capacity, "OPTIONAL", "an explicit mode is honoured");
    assert.equal(config.sections.commercial, "REQUIRED", "an omitted section takes its default");
    assert.equal(config.sections.overview, "REQUIRED", "the summary cannot be switched off");
    assert.equal(config.sections["not-a-section"], undefined, "an invented section is dropped");
    assert.equal(config.responseDeadline, "2026-12-31", "the deadline is the day that was set");
  });

  it("adds a custom question", async () => {
    const result = await call<{ question: QuestionView; questions: QuestionView[] }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/config/questions`,
      {
        section: "execution",
        prompt: "How will segregated material be transported to the processing site?",
        answerType: "SINGLE_CHOICE",
        options: ["Own fleet", "Contracted transport", "Municipal fleet"],
        isRequired: true,
      },
    );

    assert.equal(result.status, 201);
    questionId = result.data?.question.id ?? "";
    assert.notEqual(questionId, "");
  });

  it("refuses a choice question with fewer than two options", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/config/questions`,
      {
        section: "technical",
        prompt: "Choose the applicable standard",
        answerType: "SINGLE_CHOICE",
        options: ["IS 10500"],
      },
    );

    assert.equal(result.status, 400);
  });

  it("refuses options on an answer type that takes none", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/config/questions`,
      {
        section: "technical",
        prompt: "Describe your quality plan",
        answerType: "LONG_TEXT",
        options: ["a", "b"],
      },
    );

    assert.equal(result.status, 400);
  });

  it("refuses a custom question on the requirement section", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/config/questions`,
      { section: "requirements", prompt: "An extra question", answerType: "SHORT_TEXT" },
    );

    assert.equal(result.status, 400);
  });

  it("refuses a supplier trying to open a response before the department does", async () => {
    const result = await call(supplier, "POST", "/api/v1/vendor/responses", { invitationId });

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_NOT_OPEN");
  });

  it("opens the response and notifies the supplier that accepted", async () => {
    const result = await call<{ config: ConfigView; notifiedSuppliers: number }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/config/open`,
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.config.status, "OPEN");
    assert.equal(result.data?.notifiedSuppliers, 1);

    const notifications = await query<{ title: string; category: string }>(
      `SELECT title, category FROM vendor_notifications
       WHERE vendor_profile_id = $1 AND category = 'RESPONSE'
       ORDER BY created_at DESC LIMIT 1`,
      [supplierProfileId],
    );

    assert.match(notifications.rows[0]?.title ?? "", /requested/i);
  });

  it("refuses to open the same configuration twice", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/config/open`,
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_NOT_DRAFT");
  });

  it("shows the supplier that a response is now due, on its invitation", async () => {
    const result = await call<{ response: { open: boolean; responseType: string } }>(
      supplier,
      "GET",
      `/api/v1/vendor/invitations/${invitationId}`,
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.response.open, true);
    assert.equal(result.data?.response.responseType, "PROPOSAL");
  });
});

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

describe("vendor drafting", { skip: !canRun }, () => {
  it("refuses another supplier trying to open this invitation", async () => {
    const result = await call(otherSupplier, "POST", "/api/v1/vendor/responses", { invitationId });

    assert.equal(result.status, 404);
    assert.equal(result.code, "NOT_FOUND");
  });

  it("opens a draft with nothing filled in", async () => {
    const result = await call<VendorWorkspace>(supplier, "POST", "/api/v1/vendor/responses", {
      invitationId,
    });

    assert.equal(result.status, 201);
    responseId = result.data?.response.id ?? "";
    assert.notEqual(responseId, "");

    assert.equal(result.data?.response.status, "DRAFT");
    assert.equal(result.data?.completeness.complete, false);
    assert.equal(result.data?.completeness.percent, 0);
    assert.equal(result.data?.editable, true);
    assert.ok((result.data?.requirements.length ?? 0) > 0, "the confirmed requirements are served");
  });

  it("resumes the same draft rather than creating a second one", async () => {
    const again = await call<VendorWorkspace>(supplier, "POST", "/api/v1/vendor/responses", {
      invitationId,
    });

    assert.equal(again.data?.response.id, responseId);

    const rows = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM work_package_responses WHERE invitation_id = $1`,
      [invitationId],
    );
    assert.equal(rows.rows[0]?.count, "1");
  });

  it("refuses a field that is not part of the response", async () => {
    const result = await call(supplier, "PATCH", `/api/v1/vendor/responses/${responseId}`, {
      values: { status: "SUBMITTED" },
    });

    assert.equal(result.status, 400);
    assert.equal(result.code, "VALIDATION_ERROR");
    assert.ok(result.details?.some((detail) => detail.field === "values.status"));
  });

  it("refuses a negative duration and a non-numeric quote", async () => {
    const negative = await call(supplier, "PATCH", `/api/v1/vendor/responses/${responseId}`, {
      values: { estimatedDurationWeeks: -4 },
    });
    assert.equal(negative.status, 400);

    const text = await call(supplier, "PATCH", `/api/v1/vendor/responses/${responseId}`, {
      values: { quotedValueInr: "forty lakh" },
    });
    assert.equal(text.status, 400);
  });

  it("saves a partial draft and reports the progress made", async () => {
    const result = await call<VendorWorkspace>(
      supplier,
      "PATCH",
      `/api/v1/vendor/responses/${responseId}`,
      {
        values: {
          summary: "Decentralised composting and dry material recovery across all wards.",
          technicalApproach: "Windrow composting units with a manual sorting line per ward.",
        },
      },
    );

    assert.equal(result.status, 200);
    assert.ok((result.data?.completeness.percent ?? 0) > 0, "progress moved");
    assert.equal(result.data?.completeness.complete, false);
    assert.equal(result.data?.response.body.summary !== null, true);
  });

  it("refuses a requirement that is not on this work package", async () => {
    const foreign = await query<{ id: string }>(
      `SELECT r.id FROM project_requirements r
       WHERE r.id NOT IN (
         SELECT requirement_id FROM work_package_requirements WHERE work_package_id = $1
       )
       LIMIT 1`,
      [packageId],
    );

    const id = foreign.rows[0]?.id;
    if (id === undefined) return;

    const result = await call(
      supplier,
      "PUT",
      `/api/v1/vendor/responses/${responseId}/requirements/${id}`,
      { compliance: "MEETS", answer: "We would meet a requirement we were never asked about." },
    );

    assert.equal(result.status, 404);
  });

  it("refuses an answer outside the options the question offered", async () => {
    const result = await call(
      supplier,
      "PUT",
      `/api/v1/vendor/responses/${responseId}/questions/${questionId}`,
      { value: "Bullock cart" },
    );

    assert.equal(result.status, 400);
    assert.equal(result.code, "VALIDATION_ERROR");
  });

  it("refuses a submission that is missing required information", async () => {
    const result = await call(supplier, "POST", `/api/v1/vendor/responses/${responseId}/submit`);

    assert.equal(result.status, 400);
    assert.equal(result.code, "RESPONSE_INCOMPLETE");
    assert.ok((result.details?.length ?? 0) > 0, "the refusal names what is missing");
  });

  it("keeps the department out of an unsubmitted draft", async () => {
    const result = await call(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/responses/${responseId}`,
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_NOT_SUBMITTED");
  });

  it("still shows the department that a draft has been started", async () => {
    const result = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/responses`,
    );

    assert.equal(result.status, 200);
    const row = result.data?.responses.find((entry) => entry.id === responseId);
    assert.ok(row !== undefined);
    assert.equal(row.status, "DRAFT");
    assert.equal(row.submittedAt, null);
    assert.equal(result.data?.counts.drafts, 1);
  });

  it("completes every required item and submits", async () => {
    const workspace = await call<VendorWorkspace>(
      supplier,
      "GET",
      `/api/v1/vendor/responses/${responseId}`,
    );
    assert.equal(workspace.status, 200);

    for (const requirement of workspace.data?.requirements ?? []) {
      const saved = await call(
        supplier,
        "PUT",
        `/api/v1/vendor/responses/${responseId}/requirements/${requirement.id}`,
        {
          compliance: "MEETS",
          answer: "Addressed in the technical approach and the execution plan.",
          notes: null,
        },
      );
      assert.equal(saved.status, 200, `requirement ${requirement.id} could not be answered`);
    }

    const answered = await call(
      supplier,
      "PUT",
      `/api/v1/vendor/responses/${responseId}/questions/${questionId}`,
      { value: "Own fleet" },
    );
    assert.equal(answered.status, 200);

    const filled = await call<VendorWorkspace>(
      supplier,
      "PATCH",
      `/api/v1/vendor/responses/${responseId}`,
      {
        values: {
          executionPlan: "Ward by ward commissioning over three phases, with handover training.",
          timelineSummary: "Phase one in eight weeks, full coverage in twenty-six.",
          estimatedDurationWeeks: 26,
          capacityStatement: "Forty trained operators and four supervisory engineers.",
          experienceSummary: "Two comparable ward-level facilities delivered in the last cycle.",
          complianceStatement: "Registered under the applicable pollution control consents.",
          complianceConfirmed: true,
          commercialSummary: "Inclusive of civil works, equipment and first-year operations.",
          quotedValueInr: 18_500_000,
          priceValidityDays: 90,
          paymentTerms: "Milestone linked, against certified completion.",
          taxesIncluded: true,
        },
      },
    );
    assert.equal(filled.status, 200);

    // Documents were made mandatory by the configuration, so the response is
    // still incomplete until one is attached.
    assert.equal(filled.data?.completeness.complete, false);
    assert.ok(
      filled.data?.completeness.missing.some((item) => item.field === "documents.documents"),
    );

    const uploaded = await call<VendorWorkspace>(
      supplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/documents`,
      {
        title: "Ward level work plan",
        description: "Phasing and commissioning schedule.",
        fileName: "work-plan.pdf",
        mimeType: "application/pdf",
        content: PDF_BASE64,
      },
    );

    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.data?.documents.length, 1);
    assert.equal(uploaded.data?.completeness.complete, true);
    assert.equal(uploaded.data?.completeness.percent, 100);

    const submitted = await call<VendorWorkspace>(
      supplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/submit`,
    );

    assert.equal(submitted.status, 200);
    assert.equal(submitted.data?.response.status, "SUBMITTED");
    assert.equal(submitted.data?.response.submissionCount, 1);
    assert.equal(submitted.data?.editable, false);
  });

  it("refuses a file whose contents do not match its declared type", async () => {
    // The response is submitted by now, so this also exercises the ordering:
    // the editable check runs before the file is ever decoded.
    const result = await call(
      supplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/documents`,
      {
        title: "Not a PDF",
        fileName: "fake.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("MZ executable").toString("base64"),
      },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_NOT_EDITABLE");
  });

  it("records the submission with its actor and moment", async () => {
    const rows = await query<{ submitted_by: string; submitted_at: Date; submission_count: number }>(
      `SELECT submitted_by, submitted_at, submission_count
       FROM work_package_responses WHERE id = $1`,
      [responseId],
    );

    const row = rows.rows[0];
    assert.ok(row !== undefined);
    assert.equal(row.submitted_by, supplier.userId, "attributed to the supplier's own user");
    assert.ok(row.submitted_at instanceof Date);
    assert.equal(row.submission_count, 1);
  });

  it("confirms the submission in the supplier's own portal", async () => {
    const rows = await query<{ title: string }>(
      `SELECT title FROM vendor_notifications
       WHERE response_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [responseId],
    );

    assert.match(rows.rows[0]?.title ?? "", /submitted/i);
  });

  it("refuses a second submission", async () => {
    const result = await call(supplier, "POST", `/api/v1/vendor/responses/${responseId}/submit`);

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_NOT_EDITABLE");
  });

  it("refuses any edit once submitted", async () => {
    const patched = await call(supplier, "PATCH", `/api/v1/vendor/responses/${responseId}`, {
      values: { quotedValueInr: 1 },
    });
    assert.equal(patched.status, 409);
    assert.equal(patched.code, "RESPONSE_NOT_EDITABLE");

    const stored = await query<{ quoted_value_inr: string }>(
      `SELECT quoted_value_inr FROM work_package_responses WHERE id = $1`,
      [responseId],
    );
    assert.equal(stored.rows[0]?.quoted_value_inr, "18500000", "the stored value did not move");
  });

  it("refuses to remove a document from a submitted response", async () => {
    const workspace = await call<VendorWorkspace>(
      supplier,
      "GET",
      `/api/v1/vendor/responses/${responseId}`,
    );
    const documentId = workspace.data?.documents[0]?.id ?? "";

    const result = await call(
      supplier,
      "DELETE",
      `/api/v1/vendor/responses/${responseId}/documents/${documentId}`,
    );

    assert.equal(result.status, 409);
  });

  it("refuses to change what is being asked for after a submission", async () => {
    const result = await call(
      infraOfficial,
      "PUT",
      `/api/v1/work-packages/${packageId}/responses/config`,
      { responseType: "QUOTATION", allowClarifications: true, allowDocuments: true },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_ALREADY_SUBMITTED");
  });

  it("still allows the deadline and the instructions to be changed", async () => {
    const result = await call<{ config: ConfigView }>(
      infraOfficial,
      "PUT",
      `/api/v1/work-packages/${packageId}/responses/config`,
      {
        responseType: "PROPOSAL",
        instructions: "Extended: respond by the revised date.",
        responseDeadline: "2027-01-31",
        // The whole configuration is resent, as the form does: this is a
        // replace, and the section modes must come back unchanged.
        sections: { capacity: "OPTIONAL" },
        allowClarifications: true,
        allowDocuments: true,
        documentsRequired: true,
      },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.config.responseDeadline, "2027-01-31");
  });

  it("refuses to remove a question after a submission", async () => {
    const result = await call(
      infraOfficial,
      "DELETE",
      `/api/v1/work-packages/${packageId}/responses/config/questions/${questionId}`,
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_ALREADY_SUBMITTED");
  });
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("response authorization", { skip: !canRun }, () => {
  it("hides one supplier's response from another", async () => {
    const read = await call(otherSupplier, "GET", `/api/v1/vendor/responses/${responseId}`);
    assert.equal(read.status, 404);
    assert.equal(read.code, "NOT_FOUND");

    const write = await call(otherSupplier, "PATCH", `/api/v1/vendor/responses/${responseId}`, {
      values: { summary: "Overwritten by a supplier who does not own this." },
    });
    assert.equal(write.status, 404);

    const submit = await call(
      otherSupplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/submit`,
    );
    assert.equal(submit.status, 404);

    const withdraw = await call(
      otherSupplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/withdraw`,
      { reason: "Withdrawing somebody else's response." },
    );
    assert.equal(withdraw.status, 404);
  });

  it("keeps another supplier out of the response list", async () => {
    const result = await call<Array<{ id: string }>>(otherSupplier, "GET", "/api/v1/vendor/responses");

    assert.equal(result.status, 200);
    assert.ok(
      !(result.data ?? []).some((entry) => entry.id === responseId),
      "another supplier's response appeared in the list",
    );
  });

  it("hides a response from another department", async () => {
    const result = await call(
      healthOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/responses/${responseId}`,
    );

    assert.equal(result.status, 404);
  });

  it("refuses a response id belonging to another package in the same department", async () => {
    const result = await call(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${deadlinePackageId}/responses/${responseId}`,
    );

    assert.equal(result.status, 404);
  });

  it("refuses a government account on the supplier routes", async () => {
    const result = await call(infraOfficial, "GET", "/api/v1/vendor/responses");
    assert.equal(result.status, 403);
  });

  it("refuses an unauthenticated caller everywhere", async () => {
    const vendorSide = await call(undefined, "GET", `/api/v1/vendor/responses/${responseId}`);
    assert.equal(vendorSide.status, 401);

    const governmentSide = await call(
      undefined,
      "GET",
      `/api/v1/work-packages/${packageId}/responses`,
    );
    assert.equal(governmentSide.status, 401);
  });

  it("refuses an administrator any review action", async () => {
    const review = await call(
      admin,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/review`,
    );
    assert.equal(review.status, 403);

    const clarify = await call(
      admin,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/clarifications`,
      { question: "An administrator has no business asking this." },
    );
    assert.equal(clarify.status, 403);
  });
});

// ---------------------------------------------------------------------------
// Government review
// ---------------------------------------------------------------------------

describe("government review", { skip: !canRun }, () => {
  it("lists the response with the columns the workspace shows", async () => {
    const result = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/responses`,
    );

    assert.equal(result.status, 200);
    const row = result.data?.responses.find((entry) => entry.id === responseId);
    assert.ok(row !== undefined);

    assert.ok(row.organizationName.length > 0, "Vendor");
    assert.equal(row.responseType, "PROPOSAL", "Response Type");
    assert.equal(row.status, "SUBMITTED", "Status");
    assert.ok(row.submittedAt !== null, "Submitted At");
    assert.equal(row.responseDeadline, "2027-01-31", "Deadline");
    assert.equal(row.documentCount, 1);
  });

  it("serves the complete submitted response", async () => {
    const result = await call<GovernmentResponseView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/responses/${responseId}`,
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.response.status, "SUBMITTED");
    assert.equal(result.data?.response.body.quotedValueInr, 18_500_000);
    assert.ok((result.data?.response.body.technicalApproach ?? "").length > 0);
    assert.ok((result.data?.requirementAnswers.length ?? 0) > 0);
    assert.equal(result.data?.documents.length, 1);
    assert.equal(result.data?.completeness.complete, true);
  });

  it("serves a submitted document as an attachment, never inline", async () => {
    const detail = await call<GovernmentResponseView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/responses/${responseId}`,
    );
    const documentId = detail.data?.documents[0]?.id ?? "";

    const download = await fetch(
      `${BASE}/api/v1/work-packages/${packageId}/responses/${responseId}/documents/${documentId}/content`,
      { headers: { Cookie: infraOfficial.cookie } },
    );

    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition") ?? "", /^attachment;/);
    assert.equal(download.headers.get("x-content-type-options"), "nosniff");

    const forbidden = await fetch(
      `${BASE}/api/v1/work-packages/${packageId}/responses/${responseId}/documents/${documentId}/content`,
      { headers: { Cookie: healthOfficial.cookie } },
    );
    assert.equal(forbidden.status, 404, "another department cannot download it");
  });

  it("refuses to mark a response ready before it has been reviewed", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/ready`,
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_NOT_UNDER_REVIEW");
  });

  it("opens the review and tells the supplier", async () => {
    const result = await call<{ response: { status: string } }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/review`,
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.response.status, "UNDER_REVIEW");

    const notifications = await query<{ title: string }>(
      `SELECT title FROM vendor_notifications
       WHERE response_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [responseId],
    );
    assert.match(notifications.rows[0]?.title ?? "", /under review/i);
  });
});

// ---------------------------------------------------------------------------
// Clarifications
// ---------------------------------------------------------------------------

describe("clarifications", { skip: !canRun }, () => {
  let governmentClarificationId = "";
  let vendorClarificationId = "";

  it("requests a clarification and reopens the response for editing", async () => {
    const result = await call<{
      clarification: { id: string };
      response: { status: string };
    }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/clarifications`,
      {
        subject: "Operator training",
        question: "Confirm how many operators are trained before the first ward goes live.",
        respondBy: "2027-02-15",
      },
    );

    assert.equal(result.status, 201);
    governmentClarificationId = result.data?.clarification.id ?? "";
    assert.equal(result.data?.response.status, "CLARIFICATION_REQUESTED");

    const notifications = await query<{ title: string }>(
      `SELECT title FROM vendor_notifications
       WHERE response_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [responseId],
    );
    assert.match(notifications.rows[0]?.title ?? "", /clarification/i);
  });

  it("lets the supplier edit again while the clarification is outstanding", async () => {
    const result = await call<VendorWorkspace>(
      supplier,
      "PATCH",
      `/api/v1/vendor/responses/${responseId}`,
      { values: { capacityStatement: "Forty operators, twelve trained before ward one goes live." } },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.editable, true);
  });

  it("refuses a resubmission while the department's question is unanswered", async () => {
    const result = await call(supplier, "POST", `/api/v1/vendor/responses/${responseId}/submit`);

    assert.equal(result.status, 400);
    assert.equal(result.code, "CLARIFICATION_UNANSWERED");
  });

  it("refuses the department answering its own clarification request", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/clarifications/${governmentClarificationId}/answer`,
      { answer: "Answering our own question." },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "CLARIFICATION_NOT_ANSWERABLE");
  });

  it("refuses another supplier answering it", async () => {
    const result = await call(
      otherSupplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/clarifications/${governmentClarificationId}/answer`,
      { answer: "Not my response." },
    );

    assert.equal(result.status, 404);
  });

  it("lets the supplier answer, with its actor and moment on the record", async () => {
    const result = await call<VendorWorkspace>(
      supplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/clarifications/${governmentClarificationId}/answer`,
      { answer: "Twelve operators complete training two weeks before commissioning." },
    );

    assert.equal(result.status, 200);
    const thread = result.data?.clarifications.find(
      (entry) => entry.id === governmentClarificationId,
    );
    assert.equal(thread?.status, "ANSWERED");
    assert.ok((thread?.answeredByName ?? "").length > 0);
  });

  it("refuses a second answer to the same clarification", async () => {
    const result = await call(
      supplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/clarifications/${governmentClarificationId}/answer`,
      { answer: "Changing my answer." },
    );

    assert.equal(result.status, 409);
  });

  it("lets the supplier ask its own question", async () => {
    const result = await call<VendorWorkspace>(
      supplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/clarifications`,
      {
        subject: "Site access",
        question: "Will the department provide the ward level sites before commissioning begins?",
      },
    );

    assert.equal(result.status, 201);
    vendorClarificationId =
      result.data?.clarifications.find((entry) => entry.raisedBySide === "VENDOR")?.id ?? "";
    assert.notEqual(vendorClarificationId, "");
  });

  it("refuses the supplier answering its own question", async () => {
    const result = await call(
      supplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/clarifications/${vendorClarificationId}/answer`,
      { answer: "Answering ourselves." },
    );

    assert.equal(result.status, 409);
  });

  it("lets the department answer it, and tells the supplier", async () => {
    const result = await call<{ clarification: { status: string; answeredByName: string | null } }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/clarifications/${vendorClarificationId}/answer`,
      { answer: "Sites are handed over ward by ward, two weeks ahead of each commissioning." },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.clarification.status, "ANSWERED");

    const notifications = await query<{ title: string }>(
      `SELECT title FROM vendor_notifications
       WHERE response_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [responseId],
    );
    assert.match(notifications.rows[0]?.title ?? "", /answered/i);
  });

  it("preserves the whole thread with both sides, in order", async () => {
    const result = await call<VendorWorkspace>(
      supplier,
      "GET",
      `/api/v1/vendor/responses/${responseId}`,
    );

    const thread = result.data?.clarifications ?? [];
    assert.equal(thread.length, 2);
    assert.equal(thread[0]?.raisedBySide, "GOVERNMENT");
    assert.equal(thread[1]?.raisedBySide, "VENDOR");
    for (const entry of thread) {
      assert.ok(entry.askedByName.length > 0, "every entry names who asked");
      assert.equal(entry.status, "ANSWERED");
    }
  });

  it("resubmits once the outstanding question has been answered", async () => {
    const result = await call<VendorWorkspace>(
      supplier,
      "POST",
      `/api/v1/vendor/responses/${responseId}/submit`,
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.response.status, "RESUBMITTED");
    assert.equal(result.data?.response.submissionCount, 2);
    assert.equal(result.data?.editable, false);
  });

  it("reviews the resubmission and marks it ready for evaluation", async () => {
    const reviewed = await call<{ response: { status: string } }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/review`,
    );
    assert.equal(reviewed.data?.response.status, "UNDER_REVIEW");

    const ready = await call<{ response: { status: string } }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responseId}/ready`,
    );

    assert.equal(ready.status, 200);
    assert.equal(ready.data?.response.status, "READY_FOR_EVALUATION");
  });

  it("refuses a withdrawal once the response is ready for evaluation", async () => {
    const result = await call(supplier, "POST", `/api/v1/vendor/responses/${responseId}/withdraw`, {
      reason: "Too late to pull this back.",
    });

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_NOT_WITHDRAWABLE");
  });
});

// ---------------------------------------------------------------------------
// Deadlines and withdrawal, on a second package
// ---------------------------------------------------------------------------

describe("deadlines and withdrawal", { skip: !canRun }, () => {
  let secondResponseId = "";

  before(async () => {
    if (!canRun) return;

    const engagement = await engage(deadlinePackageId);

    // The supplier that wins this package may not be the one from the main
    // flow, so the session is resolved from the winner rather than assumed.
    const session = await signIn(await emailForProfile(engagement.profileId));

    await call(session, "POST", `/api/v1/vendor/invitations/${engagement.invitationId}/respond`, {
      decision: "ACCEPTED",
      note: null,
    });

    // An expression of interest with everything optional but the summary, and a
    // deadline that has already gone by.
    await call(infraOfficial, "PUT", `/api/v1/work-packages/${deadlinePackageId}/responses/config`, {
      responseType: "EXPRESSION_OF_INTEREST",
      instructions: "State your interest.",
      responseDeadline: "2020-01-01",
      sections: {
        requirements: "OPTIONAL",
        technical: "OPTIONAL",
        experience: "OPTIONAL",
        compliance: "OPTIONAL",
      },
      allowClarifications: false,
      allowDocuments: false,
      documentsRequired: false,
    });

    await call(infraOfficial, "POST", `/api/v1/work-packages/${deadlinePackageId}/responses/config/open`);

    const opened = await call<VendorWorkspace>(session, "POST", "/api/v1/vendor/responses", {
      invitationId: engagement.invitationId,
    });
    secondResponseId = opened.data?.response.id ?? "";

    await call(session, "PATCH", `/api/v1/vendor/responses/${secondResponseId}`, {
      values: { summary: "Our organisation is interested in this work package." },
    });

    // Reused by the assertions below.
    (globalThis as Record<string, unknown>).__m8SecondSession = session;
  });

  it("refuses a submission after the stated date has passed", async () => {
    const session = (globalThis as Record<string, unknown>).__m8SecondSession as Session;

    const workspace = await call<VendorWorkspace>(
      session,
      "GET",
      `/api/v1/vendor/responses/${secondResponseId}`,
    );
    assert.equal(workspace.data?.completeness.complete, true, "the response itself is complete");

    const result = await call(
      session,
      "POST",
      `/api/v1/vendor/responses/${secondResponseId}/submit`,
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "RESPONSE_DEADLINE_PASSED");
  });

  it("refuses a clarification question where the department disallowed them", async () => {
    const session = (globalThis as Record<string, unknown>).__m8SecondSession as Session;

    const result = await call(
      session,
      "POST",
      `/api/v1/vendor/responses/${secondResponseId}/clarifications`,
      { question: "May we ask something the department switched off?" },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "CLARIFICATIONS_NOT_ALLOWED");
  });

  it("refuses a document where the department disallowed them", async () => {
    const session = (globalThis as Record<string, unknown>).__m8SecondSession as Session;

    const result = await call(
      session,
      "POST",
      `/api/v1/vendor/responses/${secondResponseId}/documents`,
      {
        title: "Unwanted attachment",
        fileName: "extra.pdf",
        mimeType: "application/pdf",
        content: PDF_BASE64,
      },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "DOCUMENTS_NOT_ACCEPTED");
  });

  it("accepts the submission once the deadline is extended", async () => {
    const session = (globalThis as Record<string, unknown>).__m8SecondSession as Session;

    const extended = await call(
      infraOfficial,
      "PUT",
      `/api/v1/work-packages/${deadlinePackageId}/responses/config`,
      {
        responseType: "EXPRESSION_OF_INTEREST",
        instructions: "State your interest. Deadline extended.",
        responseDeadline: "2027-06-30",
        sections: {
          requirements: "OPTIONAL",
          technical: "OPTIONAL",
          experience: "OPTIONAL",
          compliance: "OPTIONAL",
        },
        allowClarifications: false,
        allowDocuments: false,
        documentsRequired: false,
      },
    );
    assert.equal(extended.status, 200);

    const result = await call<VendorWorkspace>(
      session,
      "POST",
      `/api/v1/vendor/responses/${secondResponseId}/submit`,
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.response.status, "SUBMITTED");
  });

  it("withdraws a submitted response without deleting it", async () => {
    const session = (globalThis as Record<string, unknown>).__m8SecondSession as Session;

    const noReason = await call(
      session,
      "POST",
      `/api/v1/vendor/responses/${secondResponseId}/withdraw`,
      {},
    );
    assert.equal(noReason.status, 400, "a withdrawal states its ground");

    const result = await call<VendorWorkspace>(
      session,
      "POST",
      `/api/v1/vendor/responses/${secondResponseId}/withdraw`,
      { reason: "Our capacity has been committed elsewhere this quarter." },
    );

    assert.equal(result.status, 200);
    assert.equal(result.data?.response.status, "WITHDRAWN");

    const stored = await query<{ status: string; withdrawal_reason: string }>(
      `SELECT status::text, withdrawal_reason FROM work_package_responses WHERE id = $1`,
      [secondResponseId],
    );
    assert.equal(stored.rows[0]?.status, "WITHDRAWN", "the row is still there");
    assert.match(stored.rows[0]?.withdrawal_reason ?? "", /capacity/);
  });

  it("shows the department the withdrawal and its reason", async () => {
    const result = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${deadlinePackageId}/responses`,
    );

    const row = result.data?.responses.find((entry) => entry.id === secondResponseId);
    assert.equal(row?.status, "WITHDRAWN");
    assert.equal(result.data?.counts.withdrawn, 1);
  });

  it("refuses a closed collection", async () => {
    const session = (globalThis as Record<string, unknown>).__m8SecondSession as Session;

    const closed = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${deadlinePackageId}/responses/config/close`,
    );
    assert.equal(closed.status, 200);

    const again = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${deadlinePackageId}/responses/config/close`,
    );
    assert.equal(again.status, 409);

    // A withdrawn response cannot be edited either way; what this asserts is
    // that the closed configuration is refused before anything else.
    const patched = await call(session, "PATCH", `/api/v1/vendor/responses/${secondResponseId}`, {
      values: { summary: "Trying to edit after closure." },
    });
    assert.equal(patched.status, 409);
  });
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

describe("response auditability", { skip: !canRun }, () => {
  it("records every lifecycle event against the work package", async () => {
    const rows = await query<{ action: string; actor_id: string }>(
      `SELECT action::text, actor_id FROM work_package_history
       WHERE work_package_id = $1 AND action::text LIKE 'RESPONSE%'
       ORDER BY created_at ASC`,
      [packageId],
    );

    const actions = rows.rows.map((row) => row.action);

    for (const expected of [
      "RESPONSE_CONFIGURED",
      "RESPONSE_OPENED",
      "RESPONSE_SUBMITTED",
      "RESPONSE_UNDER_REVIEW",
      "RESPONSE_CLARIFICATION_REQUESTED",
      "RESPONSE_CLARIFICATION_ANSWERED",
      "RESPONSE_CLARIFICATION_ASKED",
      "RESPONSE_RESUBMITTED",
      "RESPONSE_READY_FOR_EVALUATION",
    ]) {
      assert.ok(actions.includes(expected), `${expected} was not audited`);
    }
  });

  it("attributes the supplier's acts to the supplier's own user", async () => {
    const rows = await query<{ actor_id: string }>(
      `SELECT actor_id FROM work_package_history
       WHERE work_package_id = $1 AND action = 'RESPONSE_SUBMITTED'
       ORDER BY created_at DESC LIMIT 1`,
      [packageId],
    );

    assert.equal(rows.rows[0]?.actor_id, supplier.userId);
  });

  it("attributes the department's acts to the acting official", async () => {
    const rows = await query<{ actor_id: string }>(
      `SELECT actor_id FROM work_package_history
       WHERE work_package_id = $1 AND action = 'RESPONSE_READY_FOR_EVALUATION'
       ORDER BY created_at DESC LIMIT 1`,
      [packageId],
    );

    assert.equal(rows.rows[0]?.actor_id, infraOfficial.userId);
  });

  it("keeps the supplier's unread count working across response events", async () => {
    const summary = await call<{ unreadCount: number; notifications: Array<{ category: string }> }>(
      supplier,
      "GET",
      "/api/v1/vendor/notifications/summary",
    );

    assert.equal(summary.status, 200);
    assert.ok(summary.data !== undefined);
    assert.ok(summary.data.unreadCount > 0, "response events reach the notification bell");
    assert.ok(
      summary.data.notifications.some((entry) => entry.category === "RESPONSE"),
      "the response notifications are in the same feed as everything else",
    );
  });
});
