/**
 * End-to-end tests for Milestone 9 — evaluation configuration, deterministic
 * scoring, requirement compliance, AI advisory analysis, explainable ranking,
 * the side-by-side comparison and the human decision.
 *
 * These go over HTTP rather than calling the repositories, because what they
 * verify is the part a unit test cannot reach: that the session decides who the
 * caller is, that the permission table decides what they may do, that an id
 * arriving in a URL or a request body is never enough on its own, that a
 * supplier can reach none of this, and that no route produces a decision. Most
 * of the assertions below are about a request that must be refused.
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
        error?: {
          code?: string;
          message?: string;
          details?: Array<{ field: string; message: string }>;
        };
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

interface CriterionView {
  id: string;
  criterionKey: string;
  criterionType: string;
  weight: number;
  targetValue: number | null;
}

interface ConfigView {
  id: string;
  status: string;
  criteriaVersion: number;
  criteria: CriterionView[];
}

interface CriterionScoreView {
  criterionKey: string;
  criterionType: string;
  label: string;
  weight: number;
  score: number;
  weightedContribution: number;
  basis: string;
  evidence: string[];
  missing: boolean;
}

interface ResultView {
  responseId: string;
  vendorProfileId: string;
  organizationName: string;
  ranked: boolean;
  exclusionReason: string | null;
  rankPosition: number | null;
  totalScore: number;
  criterionScores: CriterionScoreView[];
  compliance: Array<{
    requirementId: string;
    status: string;
    statedPosition: string | null;
    vendorStatement: string | null;
    note: string | null;
  }>;
  complianceSummary: {
    total: number;
    compliant: number;
    partiallyCompliant: number;
    nonCompliant: number;
    insufficientInformation: number;
    coverage: number;
  };
  missingInformation: Array<{ source: string; message: string }>;
  strengths: string[];
  gaps: string[];
  structuredSummary: Record<string, unknown>;
}

interface RunView {
  id: string;
  scoringVersion: number;
  criteriaVersion: number;
  criteriaSnapshot: CriterionView[];
  requestSnapshot: Record<string, unknown>;
  evaluatedCount: number;
  rankedCount: number;
  excludedCount: number;
  requestedByName: string;
  createdAt: string;
}

interface WorkspaceView {
  workPackage: { id: string; packageNumber: string; status: string };
  responseConfig: { id: string; responseType: string; sections: Record<string, string> } | null;
  questions: Array<{ id: string; prompt: string; answerType: string }>;
  requirementCount: number;
  config: ConfigView | null;
  consistencyProblems: Array<{ field: string; message: string }>;
  responses: Array<{
    responseId: string;
    vendorProfileId: string;
    organizationName: string;
    status: string;
    readyForEvaluation: boolean;
    eligibility: { eligible: boolean } | null;
    hasAiAnalysis: boolean;
  }>;
  latestRun: RunView | null;
  results: ResultView[];
  decisions: DecisionView[];
}

interface DecisionView {
  id: string;
  responseId: string;
  vendorProfileId: string;
  decision: string;
  status: string;
  reason: string;
  evaluationRunId: string | null;
  rankAtDecision: number | null;
  scoreAtDecision: number | null;
  decidedByName: string;
  revocationReason: string | null;
}

interface AnalysisView {
  id: string;
  summary: string;
  strengths: Array<{ title: string; detail: string }>;
  weaknesses: Array<{ title: string; detail: string }>;
  attentionPoints: Array<{ title: string; detail: string }>;
  evidence: Array<{ section: string; quote: string }>;
  provider: string;
  model: string;
  promptVersion: string;
  generatedByName: string;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let infraOfficial: Session;
let healthOfficial: Session;
let admin: Session;

let packageId = "";
let otherPackageId = "";

interface Responder {
  profileId: string;
  invitationId: string;
  responseId: string;
  session: Session;
  quote: number;
  weeks: number;
  team: number;
}

const responders: Responder[] = [];
let questionId = "";
const TOUCHED_PACKAGES: string[] = [];

async function clearEvaluationState(workPackageId: string): Promise<void> {
  await query(
    `DELETE FROM work_package_response_decisions WHERE work_package_id = $1`,
    [workPackageId],
  );
  await query(
    `DELETE FROM work_package_response_ai_analyses WHERE work_package_id = $1`,
    [workPackageId],
  );
  await query(`DELETE FROM work_package_evaluation_runs WHERE work_package_id = $1`, [
    workPackageId,
  ]);
  await query(`DELETE FROM work_package_evaluation_configs WHERE work_package_id = $1`, [
    workPackageId,
  ]);
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
            OR action::text LIKE 'SHORTLIST%'
            OR action::text LIKE 'EVALUATION%'
            OR action::text LIKE 'VENDOR_%'
            OR action::text LIKE 'DECISION%')`,
    [workPackageId],
  );
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
  assert.ok(email !== undefined, "the supplier has no user account");
  return email;
}

/**
 * Builds the Milestone 8 state this milestone starts from: two suppliers
 * shortlisted, invited, accepted, drafting against the same configuration, and
 * both submitted, reviewed and marked ready for evaluation.
 */
async function buildResponses(): Promise<void> {
  const run = await call<{
    recommendations: Array<{ vendor: { vendorProfileId: string } }>;
  }>(infraOfficial, "POST", `/api/v1/work-packages/${packageId}/vendor-matches`);
  assert.equal(run.status, 200, `matching run failed: ${run.code ?? ""} ${run.message ?? ""}`);

  const candidates = (run.data?.recommendations ?? []).slice(0, 2);
  assert.ok(candidates.length >= 2, "at least two eligible suppliers are needed for a comparison");

  // Distinct figures, so a relative score has something to be relative to.
  const shapes = [
    { quote: 2_000_000, weeks: 12, team: 20 },
    { quote: 4_000_000, weeks: 24, team: 10 },
  ];

  for (const [index, candidate] of candidates.entries()) {
    const profileId = candidate.vendor.vendorProfileId;

    const shortlisted = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/vendor-matches/shortlist`,
      { vendorProfileId: profileId, reason: "Assessed as a credible supplier for this package." },
    );
    assert.equal(shortlisted.status, 200, "shortlisting failed");

    const invited = await call<{ invitation: { id: string } }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/vendor-matches/invitations`,
      { vendorProfileId: profileId, message: "Please respond.", responseDeadline: null },
    );
    assert.equal(invited.status, 201, "invitation failed");

    const session = await signIn(await emailForProfile(profileId));
    const invitationId = invited.data?.invitation.id ?? "";

    const accepted = await call(
      session,
      "POST",
      `/api/v1/vendor/invitations/${invitationId}/respond`,
      { decision: "ACCEPTED", note: null },
    );
    assert.equal(accepted.status, 200, "the supplier could not accept its invitation");

    responders.push({
      profileId,
      invitationId,
      responseId: "",
      session,
      ...(shapes[index] ?? shapes[0]!),
    });
  }

  // One configuration for both, so the responses are comparable.
  const configured = await call<{ config: { id: string } }>(
    infraOfficial,
    "PUT",
    `/api/v1/work-packages/${packageId}/responses/config`,
    {
      responseType: "PROPOSAL",
      title: "Proposal",
      instructions: "Respond against each confirmed requirement.",
      responseDeadline: "2027-12-31",
      sections: {},
      allowClarifications: true,
      allowDocuments: true,
      documentsRequired: false,
    },
  );
  assert.equal(configured.status, 200, "the response could not be configured");

  const question = await call<{ question: { id: string } }>(
    infraOfficial,
    "POST",
    `/api/v1/work-packages/${packageId}/responses/config/questions`,
    {
      section: "capacity",
      prompt: "Do you maintain a permanent office in the district?",
      helpText: null,
      answerType: "BOOLEAN",
      options: [],
      isRequired: true,
    },
  );
  assert.equal(question.status, 201, "the custom question could not be added");
  questionId = question.data?.question.id ?? "";

  const opened = await call(
    infraOfficial,
    "POST",
    `/api/v1/work-packages/${packageId}/responses/config/open`,
  );
  assert.equal(opened.status, 200, "the response could not be opened");

  const requirements = await query<{ id: string }>(
    `SELECT r.id
     FROM work_package_requirements wpr
     JOIN project_requirements r ON r.id = wpr.requirement_id
     WHERE wpr.work_package_id = $1 AND r.status = 'ACCEPTED'
     ORDER BY r.created_at`,
    [packageId],
  );

  for (const [index, responder] of responders.entries()) {
    const opened = await call<{ response: { id: string } }>(
      responder.session,
      "POST",
      "/api/v1/vendor/responses",
      { invitationId: responder.invitationId },
    );
    assert.equal(opened.status, 201, "the supplier could not open a response");
    responder.responseId = opened.data?.response.id ?? "";

    const saved = await call(
      responder.session,
      "PATCH",
      `/api/v1/vendor/responses/${responder.responseId}`,
      {
        values: {
          summary:
            "Our organisation offers a complete delivery of this package with local supervision.",
          technicalApproach:
            "A phased approach beginning with a site survey, followed by staged installation and commissioning against the departmental specification.",
          technicalStandards: "IS 1234, ISO 9001 quality management.",
          executionPlan:
            "Three phases over the stated duration, with fortnightly reporting to the department.",
          teamComposition: "One project manager, two site engineers and a supervisory team.",
          timelineSummary: "Mobilisation in week one, installation from week three, handover at the end.",
          estimatedDurationWeeks: responder.weeks,
          proposedStartDate: "2027-01-15",
          capacityStatement:
            "Our permanent workforce covers this package without subcontracting any core activity.",
          committedTeamSize: responder.team,
          experienceSummary:
            "We have delivered comparable installations for two urban local bodies in the last three years.",
          complianceStatement:
            "We hold current registrations and will comply with every stated statutory condition.",
          complianceConfirmed: true,
          commercialSummary: "The quoted amount covers supply, installation and one year of support.",
          quotedValueInr: responder.quote,
          priceValidityDays: 90,
          paymentTerms: "Against milestone certification.",
          taxesIncluded: true,
        },
      },
    );
    assert.equal(saved.status, 200, "the draft could not be saved");

    for (const [requirementIndex, requirement] of requirements.rows.entries()) {
      // The second supplier leaves its last requirement thin on purpose, so the
      // comparison has an "insufficient information" row to assert on.
      const thin = index === 1 && requirementIndex === requirements.rows.length - 1;

      const answered = await call(
        responder.session,
        "PUT",
        `/api/v1/vendor/responses/${responder.responseId}/requirements/${requirement.id}`,
        {
          compliance: "MEETS",
          answer: thin
            ? "Yes."
            : "We meet this requirement in full, with the arrangements described in our technical approach.",
          notes: null,
        },
      );
      assert.equal(answered.status, 200, "a requirement answer could not be saved");
    }

    const answeredQuestion = await call(
      responder.session,
      "PUT",
      `/api/v1/vendor/responses/${responder.responseId}/questions/${questionId}`,
      { value: index === 0 },
    );
    assert.equal(answeredQuestion.status, 200, "the custom answer could not be saved");

    const submitted = await call(
      responder.session,
      "POST",
      `/api/v1/vendor/responses/${responder.responseId}/submit`,
    );
    assert.equal(
      submitted.status,
      200,
      `submission failed: ${submitted.code ?? ""} ${JSON.stringify(submitted.details ?? [])}`,
    );

    const reviewed = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responder.responseId}/review`,
    );
    assert.equal(reviewed.status, 200, "the review could not be opened");
  }

  // Only the first is marked ready at first, so the suite can assert that the
  // second is excluded and then that readying it brings it into the ranking.
  const readied = await call(
    infraOfficial,
    "POST",
    `/api/v1/work-packages/${packageId}/responses/${responders[0]?.responseId}/ready`,
  );
  assert.equal(readied.status, 200, "the response could not be marked ready");
}

before(async () => {
  if (!canRun) return;

  [infraOfficial, healthOfficial, admin] = await Promise.all([
    signIn("official@procureai.local"),
    signIn("official.health@procureai.local"),
    signIn("admin@procureai.local"),
  ]);

  const packages = await query<{ id: string; package_number: string }>(
    `SELECT wp.id, wp.package_number
     FROM work_packages wp
     JOIN procurement_projects pr ON pr.id = wp.project_id
     WHERE pr.reference_number = 'PRJ-2026-0201' AND wp.is_deleted = false
       AND wp.status = 'CONFIRMED'
     ORDER BY wp.display_order`,
  );

  packageId = packages.rows.find((row) => row.package_number === "WP-02")?.id ?? "";
  otherPackageId = packages.rows.find((row) => row.package_number === "WP-01")?.id ?? "";
  assert.ok(packageId !== "", "the seeded work package was not found");

  TOUCHED_PACKAGES.push(packageId);
  for (const id of TOUCHED_PACKAGES) await clearEvaluationState(id);

  await buildResponses();
});

after(async () => {
  if (canRun) {
    for (const id of TOUCHED_PACKAGES) await clearEvaluationState(id);
  }
  await closePool();
});

// ---------------------------------------------------------------------------
// Authorization boundaries
// ---------------------------------------------------------------------------

describe("evaluation authorization", { skip: !canRun }, () => {
  it("refuses a supplier account outright, on every evaluation route", async () => {
    const supplier = responders[0]?.session;
    assert.ok(supplier !== undefined);

    const paths: Array<[string, string]> = [
      ["GET", `/api/v1/work-packages/${packageId}/evaluation`],
      ["GET", `/api/v1/work-packages/${packageId}/evaluation/criteria-schema`],
      ["GET", `/api/v1/work-packages/${packageId}/evaluation/comparison`],
      ["GET", `/api/v1/work-packages/${packageId}/evaluation/runs`],
      ["GET", `/api/v1/work-packages/${packageId}/evaluation/decisions`],
      ["POST", `/api/v1/work-packages/${packageId}/evaluation/run`],
      ["PUT", `/api/v1/work-packages/${packageId}/evaluation/config`],
      ["POST", `/api/v1/work-packages/${packageId}/evaluation/decisions`],
    ];

    for (const [method, path] of paths) {
      const result = await call(supplier, method, path, method === "GET" ? undefined : {});
      assert.equal(result.status, 403, `${method} ${path} was not refused`);
    }
  });

  it("refuses a supplier its own response's evaluation and AI analysis", async () => {
    const supplier = responders[0]?.session;
    const responseId = responders[0]?.responseId ?? "";

    const read = await call(
      supplier,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/responses/${responseId}`,
    );
    assert.equal(read.status, 403);

    const generate = await call(
      supplier,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/responses/${responseId}/ai-analysis`,
    );
    assert.equal(generate.status, 403);
  });

  it("refuses an unauthenticated caller", async () => {
    const result = await call(undefined, "GET", `/api/v1/work-packages/${packageId}/evaluation`);
    assert.equal(result.status, 401);
  });

  it("answers another department with 404, not 403", async () => {
    const result = await call(
      healthOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );
    assert.equal(result.status, 404);
    assert.equal(result.code, "NOT_FOUND");
  });

  it("lets oversight read an evaluation but take no act on it", async () => {
    const read = await call(admin, "GET", `/api/v1/work-packages/${packageId}/evaluation`);
    assert.equal(read.status, 200, "oversight cannot read the evaluation");

    for (const [method, path, body] of [
      ["PUT", `/api/v1/work-packages/${packageId}/evaluation/config`, { criteria: [] }],
      ["POST", `/api/v1/work-packages/${packageId}/evaluation/run`, undefined],
      [
        "POST",
        `/api/v1/work-packages/${packageId}/evaluation/decisions`,
        { responseId: responders[0]?.responseId, decision: "SELECTED", reason: "x".repeat(40) },
      ],
    ] as Array<[string, string, unknown]>) {
      const result = await call(admin, method, path, body);
      assert.equal(result.status, 403, `${method} ${path} was not refused for oversight`);
    }
  });
});

// ---------------------------------------------------------------------------
// Criteria configuration
// ---------------------------------------------------------------------------

describe("evaluation configuration", { skip: !canRun }, () => {
  it("serves the criterion catalogue rather than expecting the browser to hold one", async () => {
    const result = await call<{
      criterionTypes: Array<{ type: string; method: string }>;
      totalWeight: number;
      presets: Record<string, unknown>;
    }>(infraOfficial, "GET", `/api/v1/work-packages/${packageId}/evaluation/criteria-schema`);

    assert.equal(result.status, 200);
    assert.equal(result.data?.totalWeight, 100);
    assert.ok((result.data?.criterionTypes.length ?? 0) >= 8);
    assert.ok(result.data?.criterionTypes.every((entry) => entry.method.length > 0));
  });

  it("stores an inconsistent set as a draft, with the problems, and refuses to run it", async () => {
    const saved = await call<{
      config: ConfigView;
      consistencyProblems: Array<{ message: string }>;
    }>(infraOfficial, "PUT", `/api/v1/work-packages/${packageId}/evaluation/config`, {
      title: "Draft criteria",
      notes: null,
      criteria: [
        {
          criterionKey: "price",
          criterionType: "PRICE",
          direction: "LOWER_IS_BETTER",
          label: "Price",
          description: null,
          weight: 40,
          targetValue: null,
          questionId: null,
        },
      ],
    });

    assert.equal(saved.status, 200);
    assert.equal(saved.data?.config.status, "DRAFT");
    assert.ok((saved.data?.consistencyProblems.length ?? 0) > 0);

    const run = await call(infraOfficial, "POST", `/api/v1/work-packages/${packageId}/evaluation/run`);
    assert.equal(run.status, 409);
    assert.equal(run.code, "EVALUATION_CRITERIA_INCONSISTENT");
  });

  it("refuses a criterion attached to a question on another work package's form", async () => {
    const foreign = await query<{ id: string }>(
      `SELECT q.id FROM work_package_response_questions q
       JOIN work_package_response_configs c ON c.id = q.config_id
       WHERE c.work_package_id <> $1
       LIMIT 1`,
      [packageId],
    );

    if (foreign.rows[0] === undefined) return;

    const result = await call(
      infraOfficial,
      "PUT",
      `/api/v1/work-packages/${packageId}/evaluation/config`,
      {
        title: null,
        notes: null,
        criteria: [
          {
            criterionKey: "borrowed",
            criterionType: "CUSTOM",
            direction: "HIGHER_IS_BETTER",
            label: "Borrowed question",
            description: null,
            weight: 100,
            targetValue: null,
            questionId: foreign.rows[0].id,
          },
        ],
      },
    );

    assert.equal(result.status, 400);
    assert.equal(result.code, "VALIDATION_ERROR");
  });

  it("stores a consistent set as ready, with a bumped version", async () => {
    const saved = await call<{
      config: ConfigView;
      consistencyProblems: Array<{ message: string }>;
    }>(infraOfficial, "PUT", `/api/v1/work-packages/${packageId}/evaluation/config`, {
      title: "Technical and commercial evaluation",
      notes: "Weighted towards requirement compliance and price, as the sanction requires.",
      criteria: [
        {
          criterionKey: "requirement-compliance",
          criterionType: "REQUIREMENT_COMPLIANCE",
          direction: "HIGHER_IS_BETTER",
          label: "Requirement compliance",
          description: null,
          weight: 30,
          targetValue: null,
          questionId: null,
        },
        {
          criterionKey: "price",
          criterionType: "PRICE",
          direction: "LOWER_IS_BETTER",
          label: "Price",
          description: null,
          weight: 30,
          targetValue: 6_000_000,
          questionId: null,
        },
        {
          criterionKey: "timeline",
          criterionType: "TIMELINE",
          direction: "LOWER_IS_BETTER",
          label: "Delivery timeline",
          description: null,
          weight: 15,
          targetValue: null,
          questionId: null,
        },
        {
          criterionKey: "capacity",
          criterionType: "CAPACITY",
          direction: "HIGHER_IS_BETTER",
          label: "Capacity",
          description: null,
          weight: 10,
          targetValue: null,
          questionId: null,
        },
        {
          criterionKey: "compliance",
          criterionType: "COMPLIANCE",
          direction: "HIGHER_IS_BETTER",
          label: "Certifications and compliance",
          description: null,
          weight: 5,
          targetValue: null,
          questionId: null,
        },
        {
          criterionKey: "local-office",
          criterionType: "CUSTOM",
          direction: "HIGHER_IS_BETTER",
          label: "Permanent district office",
          description: null,
          weight: 10,
          targetValue: null,
          questionId,
        },
      ],
    });

    assert.equal(saved.status, 200, `${saved.code ?? ""} ${saved.message ?? ""}`);
    assert.deepEqual(saved.data?.consistencyProblems, []);
    assert.equal(saved.data?.config.status, "READY");
    assert.equal(saved.data?.config.criteria.length, 6);

    const total = (saved.data?.config.criteria ?? []).reduce(
      (sum, criterion) => sum + criterion.weight,
      0,
    );
    assert.equal(total, 100);
  });

  it("records the configuration in the work package history", async () => {
    const history = await query<{ action: string; new_value: { criteriaVersion?: number } }>(
      `SELECT action::text, new_value FROM work_package_history
       WHERE work_package_id = $1 AND action = 'EVALUATION_CONFIGURED'
       ORDER BY created_at DESC`,
      [packageId],
    );

    assert.ok(history.rows.length >= 2, "each configuration change should be audited");
    assert.ok((history.rows[0]?.new_value.criteriaVersion ?? 0) >= 2);
  });
});

// ---------------------------------------------------------------------------
// Running the evaluation
// ---------------------------------------------------------------------------

describe("deterministic evaluation", { skip: !canRun }, () => {
  it("scores only responses the department marked ready, and explains the rest", async () => {
    const run = await call<{ run: RunView; results: ResultView[] }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/run`,
    );

    assert.equal(run.status, 201, `${run.code ?? ""} ${run.message ?? ""}`);
    assert.equal(run.data?.run.rankedCount, 1, "only the readied response should be ranked");

    const excluded = (run.data?.results ?? []).filter((result) => !result.ranked);
    assert.equal(excluded.length, 1);
    assert.ok(
      /ready for evaluation/i.test(excluded[0]?.exclusionReason ?? ""),
      "an excluded response must say why it was left out",
    );
  });

  it("ranks both responses once the second is marked ready", async () => {
    const readied = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/responses/${responders[1]?.responseId}/ready`,
    );
    assert.equal(readied.status, 200);

    const run = await call<{ run: RunView; results: ResultView[] }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/run`,
    );

    assert.equal(run.status, 201);
    assert.equal(run.data?.run.rankedCount, 2);
    assert.equal(run.data?.run.excludedCount, 0);
  });

  it("ranks the cheaper, faster, larger, better-substantiated response first", async () => {
    const workspace = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );

    const ranked = (workspace.data?.results ?? [])
      .filter((result) => result.ranked)
      .sort((left, right) => (left.rankPosition ?? 0) - (right.rankPosition ?? 0));

    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.responseId, responders[0]?.responseId);
    assert.ok((ranked[0]?.totalScore ?? 0) > (ranked[1]?.totalScore ?? 0));
  });

  it("decomposes every score into criterion, weight, contribution, basis and evidence", async () => {
    const workspace = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );

    const first = (workspace.data?.results ?? []).find((result) => result.rankPosition === 1);
    assert.ok(first !== undefined);
    assert.equal(first.criterionScores.length, 6);

    for (const score of first.criterionScores) {
      assert.ok(score.basis.length > 0, `${score.criterionKey} has no stated basis`);
      assert.ok(score.weight > 0);
      assert.ok(score.score >= 0 && score.score <= 100);
      assert.equal(
        score.weightedContribution,
        Math.round(((score.score * score.weight) / 100) * 100) / 100,
      );
    }

    const summed =
      Math.round(
        first.criterionScores.reduce((sum, score) => sum + score.weightedContribution, 0) * 100,
      ) / 100;
    assert.equal(summed, first.totalScore, "the total must be the sum of the contributions");
  });

  it("scores the lowest compliant quote at 100 and quotes both figures", async () => {
    const workspace = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );

    const cheapest = (workspace.data?.results ?? []).find(
      (result) => result.responseId === responders[0]?.responseId,
    );
    const dearest = (workspace.data?.results ?? []).find(
      (result) => result.responseId === responders[1]?.responseId,
    );

    const cheapPrice = cheapest?.criterionScores.find((score) => score.criterionType === "PRICE");
    const dearPrice = dearest?.criterionScores.find((score) => score.criterionType === "PRICE");

    assert.equal(cheapPrice?.score, 100);
    assert.equal(dearPrice?.score, 50, "twice the price scores half");
    assert.ok((dearPrice?.evidence.length ?? 0) >= 2, "the comparison figures must be evidenced");
  });

  it("does not count an unsubstantiated answer as compliance", async () => {
    const workspace = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );

    const thin = (workspace.data?.results ?? []).find(
      (result) => result.responseId === responders[1]?.responseId,
    );

    assert.ok((thin?.complianceSummary.insufficientInformation ?? 0) >= 1);

    const finding = thin?.compliance.find(
      (entry) => entry.status === "INSUFFICIENT_INFORMATION" && entry.vendorStatement === "Yes.",
    );
    assert.ok(finding !== undefined, "an unsubstantiated 'meets' must not read as compliant");
    assert.equal(finding.statedPosition, "MEETS", "the supplier's own position stays visible");
    assert.ok((finding.note ?? "").length > 0, "the difference must be explained");
  });

  it("reports missing information rather than scoring around it", async () => {
    const workspace = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );

    const thin = (workspace.data?.results ?? []).find(
      (result) => result.responseId === responders[1]?.responseId,
    );

    assert.ok((thin?.missingInformation.length ?? 0) > 0);
    assert.ok(
      thin?.missingInformation.some((item) => item.source === "Requirement compliance"),
      "an unsubstantiated requirement must appear as missing information",
    );
  });

  it("scores a yes/no departmental question from the answer given", async () => {
    const workspace = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );

    const yes = (workspace.data?.results ?? []).find(
      (result) => result.responseId === responders[0]?.responseId,
    );
    const no = (workspace.data?.results ?? []).find(
      (result) => result.responseId === responders[1]?.responseId,
    );

    assert.equal(yes?.criterionScores.find((s) => s.criterionKey === "local-office")?.score, 100);
    assert.equal(no?.criterionScores.find((s) => s.criterionKey === "local-office")?.score, 0);
  });

  it("produces the same numbers when run again on unchanged responses", async () => {
    const before = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );

    const rerun = await call<{ run: RunView; results: ResultView[] }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/run`,
    );
    assert.equal(rerun.status, 201);

    const scoreByResponse = (results: ResultView[]): Record<string, number> =>
      Object.fromEntries(results.filter((r) => r.ranked).map((r) => [r.responseId, r.totalScore]));

    assert.deepEqual(
      scoreByResponse(rerun.data?.results ?? []),
      scoreByResponse(before.data?.results ?? []),
    );
  });
});

// ---------------------------------------------------------------------------
// Snapshots and history
// ---------------------------------------------------------------------------

describe("evaluation snapshots and audit", { skip: !canRun }, () => {
  it("stores the criteria that were applied, with the run", async () => {
    const runs = await call<{ runs: RunView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/runs`,
    );

    assert.equal(runs.status, 200);
    assert.ok((runs.data?.runs.length ?? 0) >= 3, "every run is kept, not overwritten");

    const latest = runs.data?.runs[0];
    assert.equal(latest?.criteriaSnapshot.length, 6);
    assert.ok(latest?.scoringVersion !== undefined);
    assert.ok(latest?.requestSnapshot.requirements !== undefined);
    assert.ok(latest?.requestSnapshot.targets !== undefined);
  });

  it("keeps an earlier run readable after the criteria are changed", async () => {
    const runs = await call<{ runs: RunView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/runs`,
    );

    const earliest = runs.data?.runs.at(-1);
    assert.ok(earliest !== undefined);

    const changed = await call(
      infraOfficial,
      "PUT",
      `/api/v1/work-packages/${packageId}/evaluation/config`,
      {
        title: "Reweighted",
        notes: null,
        criteria: [
          {
            criterionKey: "price",
            criterionType: "PRICE",
            direction: "LOWER_IS_BETTER",
            label: "Price",
            description: null,
            weight: 100,
            targetValue: null,
            questionId: null,
          },
        ],
      },
    );
    assert.equal(changed.status, 200);

    const stored = await call<{ run: RunView; results: ResultView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/runs/${earliest.id}`,
    );

    assert.equal(stored.status, 200);
    assert.equal(
      stored.data?.run.criteriaSnapshot.length,
      earliest.criteriaSnapshot.length,
      "a stored run must keep the criteria it applied",
    );
    assert.ok(
      (stored.data?.results.length ?? 0) > 0,
      "a stored run must keep the scores it calculated",
    );
  });

  it("refuses a run id from another work package", async () => {
    if (otherPackageId === "") return;

    const runs = await call<{ runs: RunView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/runs`,
    );
    const runId = runs.data?.runs[0]?.id ?? "";

    const result = await call(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${otherPackageId}/evaluation/runs/${runId}`,
    );
    assert.equal(result.status, 404);
  });

  it("records each run in the work package history with its ranking", async () => {
    const history = await query<{
      new_value: { runId?: string; ranking?: Array<{ rank: number; totalScore: number }> };
    }>(
      `SELECT new_value FROM work_package_history
       WHERE work_package_id = $1 AND action = 'EVALUATION_RUN'
       ORDER BY created_at DESC`,
      [packageId],
    );

    assert.ok(history.rows.length >= 3);
    assert.ok(history.rows[0]?.new_value.runId !== undefined);
    assert.ok((history.rows[0]?.new_value.ranking?.length ?? 0) >= 1, "the ranking shown is audited");
  });
});

// ---------------------------------------------------------------------------
// AI advisory analysis
// ---------------------------------------------------------------------------

describe("AI advisory analysis", { skip: !canRun }, () => {
  it("generates an advisory reading that carries no score of any kind", async () => {
    const generated = await call<{ analysis: AnalysisView }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/responses/${responders[0]?.responseId}/ai-analysis`,
    );

    // The AI service may not be running locally; that is a skip, not a failure.
    if (generated.status === 503) return;

    assert.equal(generated.status, 201, `${generated.code ?? ""} ${generated.message ?? ""}`);

    const analysis = generated.data?.analysis;
    assert.ok(analysis !== undefined);
    assert.ok(analysis.summary.length > 0);
    assert.ok(analysis.provider.length > 0 && analysis.model.length > 0);

    const serialised = JSON.stringify(analysis);
    for (const forbidden of ["totalScore", "rankPosition", "weightedContribution", "criterionScores"]) {
      assert.ok(!serialised.includes(forbidden), `the analysis carries a ${forbidden} field`);
    }
  });

  it("does not change any deterministic score", async () => {
    const before = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );
    const beforeScores = (before.data?.results ?? []).map((r) => `${r.responseId}:${r.totalScore}`);

    const generated = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/responses/${responders[1]?.responseId}/ai-analysis`,
    );
    if (generated.status === 503) return;

    const after = await call<WorkspaceView>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation`,
    );
    const afterScores = (after.data?.results ?? []).map((r) => `${r.responseId}:${r.totalScore}`);

    assert.deepEqual(afterScores, beforeScores);
  });

  it("keeps every generation rather than replacing the last", async () => {
    const first = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/responses/${responders[0]?.responseId}/ai-analysis`,
    );
    if (first.status === 503) return;

    const listed = await call<{ analyses: AnalysisView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/responses/${responders[0]?.responseId}/ai-analysis`,
    );

    assert.equal(listed.status, 200);
    assert.ok((listed.data?.analyses.length ?? 0) >= 2, "an earlier reading must stay on the record");
  });

  it("records the generation in the work package history, marked advisory", async () => {
    const history = await query<{ new_value: { advisory?: boolean; model?: string } }>(
      `SELECT new_value FROM work_package_history
       WHERE work_package_id = $1 AND action = 'EVALUATION_AI_ANALYSIS'
       ORDER BY created_at DESC`,
      [packageId],
    );

    if (history.rows.length === 0) return; // AI service not running.
    assert.equal(history.rows[0]?.new_value.advisory, true);
    assert.ok((history.rows[0]?.new_value.model ?? "").length > 0);
  });
});

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

describe("vendor comparison", { skip: !canRun }, () => {
  it("lays the ranked responses side by side, from the stored run", async () => {
    const comparison = await call<{
      run: RunView;
      requirements: Array<{ id: string }>;
      columns: Array<{
        responseId: string;
        rankPosition: number | null;
        eligibility: { eligible: boolean } | null;
        aiAnalysis: AnalysisView | null;
        criterionScores: CriterionScoreView[];
      }>;
    }>(infraOfficial, "GET", `/api/v1/work-packages/${packageId}/evaluation/comparison`);

    assert.equal(comparison.status, 200);
    assert.equal(comparison.data?.columns.length, 2);
    assert.ok((comparison.data?.requirements.length ?? 0) > 0);

    for (const column of comparison.data?.columns ?? []) {
      assert.ok(column.rankPosition !== null);
      assert.ok(column.criterionScores.length > 0);
    }
  });

  it("carries the eligibility verdict from supplier matching rather than a second one", async () => {
    const comparison = await call<{
      columns: Array<{ eligibility: { eligible: boolean } | null }>;
    }>(infraOfficial, "GET", `/api/v1/work-packages/${packageId}/evaluation/comparison`);

    assert.ok(
      comparison.data?.columns.every((column) => column.eligibility?.eligible === true),
      "every invited supplier passed the Milestone 6 gate and should read as eligible",
    );
  });

  it("serves a named earlier run when one is asked for", async () => {
    const runs = await call<{ runs: RunView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/runs`,
    );
    const earliest = runs.data?.runs.at(-1)?.id ?? "";

    const comparison = await call<{ run: RunView }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/comparison?runId=${earliest}`,
    );

    assert.equal(comparison.status, 200);
    assert.equal(comparison.data?.run.id, earliest);
  });
});

// ---------------------------------------------------------------------------
// One response's evaluation
// ---------------------------------------------------------------------------

describe("one response's evaluation", { skip: !canRun }, () => {
  it("serves the criterion scores, the comparison and the advisory reading apart", async () => {
    const view = await call<{
      result: ResultView | null;
      requirements: Array<{ id: string }>;
      aiAnalyses: AnalysisView[];
      eligibility: { eligible: boolean } | null;
    }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/responses/${responders[0]?.responseId}`,
    );

    assert.equal(view.status, 200);
    assert.ok(view.data?.result !== null);
    assert.ok((view.data?.result?.criterionScores.length ?? 0) > 0);
    assert.ok((view.data?.requirements.length ?? 0) > 0);
  });

  it("refuses a response id belonging to another work package", async () => {
    if (otherPackageId === "") return;

    const result = await call(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${otherPackageId}/evaluation/responses/${responders[0]?.responseId}`,
    );
    assert.equal(result.status, 404);
  });
});

// ---------------------------------------------------------------------------
// The human decision
// ---------------------------------------------------------------------------

describe("human decision", { skip: !canRun }, () => {
  it("refuses a decision with no reason", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      { responseId: responders[0]?.responseId, decision: "SELECTED", reason: "" },
    );

    assert.equal(result.status, 400);
    assert.equal(result.code, "VALIDATION_ERROR");
  });

  it("refuses a decision with a reason too short to be a reason", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      { responseId: responders[0]?.responseId, decision: "SELECTED", reason: "best" },
    );

    assert.equal(result.status, 400);
  });

  it("refuses an outcome that is not select or reject", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      {
        responseId: responders[0]?.responseId,
        decision: "AWARDED",
        reason: "x".repeat(40),
      },
    );

    assert.equal(result.status, 400);
  });

  it("refuses an evaluation run belonging to another work package", async () => {
    if (otherPackageId === "") return;

    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      {
        responseId: responders[0]?.responseId,
        decision: "REJECTED",
        reason: "This should never be recorded because the run does not belong here.",
        evaluationRunId: "00000000-0000-4000-8000-000000000000",
      },
    );

    assert.equal(result.status, 404);
  });

  it("records a selection with its actor, reason and the evaluation it cites", async () => {
    const runs = await call<{ runs: RunView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/runs`,
    );
    const runId = runs.data?.runs[0]?.id ?? null;

    const recorded = await call<{ decision: DecisionView }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      {
        responseId: responders[0]?.responseId,
        decision: "SELECTED",
        reason:
          "Highest evaluated response, every requirement substantiated, and the quote is within the sanctioned ceiling.",
        evaluationRunId: runId,
      },
    );

    assert.equal(recorded.status, 201, `${recorded.code ?? ""} ${recorded.message ?? ""}`);

    const decision = recorded.data?.decision;
    assert.equal(decision?.decision, "SELECTED");
    assert.equal(decision?.status, "ACTIVE");
    assert.equal(decision?.evaluationRunId, runId);
    assert.ok((decision?.decidedByName ?? "").length > 0);
    assert.ok(decision?.rankAtDecision !== null, "the rank at the moment of decision is stored");
    assert.ok(decision?.scoreAtDecision !== null, "the score at the moment of decision is stored");
  });

  it("refuses a second selection on the same work package", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      {
        responseId: responders[1]?.responseId,
        decision: "SELECTED",
        reason: "A second selection should be impossible while the first one stands.",
        evaluationRunId: null,
      },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "SELECTION_EXISTS");
  });

  it("refuses a second decision on the same response", async () => {
    const result = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      {
        responseId: responders[0]?.responseId,
        decision: "REJECTED",
        reason: "A response cannot be both selected and rejected at the same time.",
        evaluationRunId: null,
      },
    );

    assert.equal(result.status, 409);
    assert.equal(result.code, "ALREADY_DECIDED");
  });

  it("records a rejection against the other response", async () => {
    const recorded = await call<{ decision: DecisionView }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      {
        responseId: responders[1]?.responseId,
        decision: "REJECTED",
        reason:
          "Quoted materially higher, and one requirement is not substantiated well enough to assess.",
        evaluationRunId: null,
      },
    );

    assert.equal(recorded.status, 201);
    assert.equal(recorded.data?.decision.decision, "REJECTED");
  });

  it("audits the selection and the rejection in the work package history", async () => {
    const history = await query<{ action: string; reason: string | null }>(
      `SELECT action::text, reason FROM work_package_history
       WHERE work_package_id = $1 AND action IN ('VENDOR_SELECTED', 'VENDOR_REJECTED')
       ORDER BY created_at`,
      [packageId],
    );

    assert.equal(history.rows.length, 2);
    assert.equal(history.rows[0]?.action, "VENDOR_SELECTED");
    assert.ok((history.rows[0]?.reason ?? "").length > 0, "the reason is part of the audit record");
  });

  it("revokes a decision without erasing what was first decided", async () => {
    const decisions = await call<{ decisions: DecisionView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
    );

    const selection = decisions.data?.decisions.find(
      (decision) => decision.decision === "SELECTED" && decision.status === "ACTIVE",
    );
    assert.ok(selection !== undefined);

    const short = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions/${selection.id}/revoke`,
      { reason: "oops" },
    );
    assert.equal(short.status, 400, "a revocation needs a stated reason too");

    const revoked = await call<{ decision: DecisionView }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions/${selection.id}/revoke`,
      { reason: "Revoked pending a clarification on the quoted price validity period." },
    );

    assert.equal(revoked.status, 200);
    assert.equal(revoked.data?.decision.status, "REVOKED");
    assert.equal(
      revoked.data?.decision.reason,
      selection.reason,
      "the original reason must survive the revocation",
    );
    assert.ok((revoked.data?.decision.revocationReason ?? "").length > 0);

    const again = await call(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions/${selection.id}/revoke`,
      { reason: "Revoking an already revoked decision should not be possible." },
    );
    assert.equal(again.status, 409);
  });

  it("allows a fresh selection once the first is revoked", async () => {
    const recorded = await call<{ decision: DecisionView }>(
      infraOfficial,
      "POST",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
      {
        responseId: responders[0]?.responseId,
        decision: "SELECTED",
        reason: "Price validity confirmed by the supplier; the original assessment stands.",
        evaluationRunId: null,
      },
    );

    assert.equal(recorded.status, 201);

    const decisions = await call<{ decisions: DecisionView[] }>(
      infraOfficial,
      "GET",
      `/api/v1/work-packages/${packageId}/evaluation/decisions`,
    );

    // One selection (revoked), one rejection, and this fresh selection. The
    // revoked row is still there, which is the point of the assertion: a
    // correction adds a record rather than editing the one it corrects.
    const rows = decisions.data?.decisions ?? [];
    assert.equal(rows.length, 3, "every decision, live and revoked, stays on the record");
    assert.equal(rows.filter((decision) => decision.status === "REVOKED").length, 1);
    assert.equal(
      rows.filter((decision) => decision.decision === "SELECTED" && decision.status === "ACTIVE")
        .length,
      1,
    );
  });

  it("never selects a supplier without being told to", async () => {
    // The only writer of a decision row is the route above. Running an
    // evaluation must therefore add none.
    const before = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM work_package_response_decisions WHERE work_package_id = $1`,
      [packageId],
    );

    const run = await call(infraOfficial, "POST", `/api/v1/work-packages/${packageId}/evaluation/run`);
    assert.ok(run.status === 201 || run.status === 409);

    const after = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM work_package_response_decisions WHERE work_package_id = $1`,
      [packageId],
    );

    assert.equal(after.rows[0]?.count, before.rows[0]?.count);
  });
});

// ---------------------------------------------------------------------------
// Milestones 6, 7 and 8 still work
// ---------------------------------------------------------------------------

describe("earlier milestones are unaffected", { skip: !canRun }, () => {
  it("still runs supplier matching and returns an explainable ranking", async () => {
    const run = await call<{
      recommendations: Array<{ overallScore: number; dimensions: Array<{ key: string }> }>;
      provenance: { rankingVersion: number };
    }>(infraOfficial, "POST", `/api/v1/work-packages/${packageId}/vendor-matches`);

    assert.equal(run.status, 200);
    assert.ok((run.data?.recommendations.length ?? 0) > 0);
    assert.equal(run.data?.recommendations[0]?.dimensions.length, 7);
  });

  it("still serves the response workspace and the collected responses", async () => {
    const workspace = await call<{
      responses: Array<{ id: string; status: string }>;
      counts: { readyForEvaluation: number };
    }>(infraOfficial, "GET", `/api/v1/work-packages/${packageId}/responses`);

    assert.equal(workspace.status, 200);
    assert.equal(workspace.data?.responses.length, 2);
    assert.equal(workspace.data?.counts.readyForEvaluation, 2);
  });

  it("still shows a supplier its own response and nothing about the evaluation", async () => {
    const view = await call<Record<string, unknown>>(
      responders[0]?.session,
      "GET",
      `/api/v1/vendor/responses/${responders[0]?.responseId}`,
    );

    assert.equal(view.status, 200);

    const serialised = JSON.stringify(view.data);
    for (const forbidden of [
      "totalScore",
      "rankPosition",
      "criterionScores",
      "decision",
      "evaluation",
    ]) {
      assert.ok(
        !serialised.includes(forbidden),
        `the supplier's own view leaks ${forbidden}`,
      );
    }
  });

  it("still refuses a supplier another supplier's response", async () => {
    const result = await call(
      responders[1]?.session,
      "GET",
      `/api/v1/vendor/responses/${responders[0]?.responseId}`,
    );
    assert.equal(result.status, 404);
  });
});
