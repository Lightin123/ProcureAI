/**
 * Unit tests for the deterministic halves of the matching pipeline.
 *
 * These run with no database and no AI service, because normalization,
 * eligibility and ranking are pure functions of their inputs — which is the
 * property that makes a ranking reproducible and a gate auditable. If any of
 * them ever needs a connection to be tested, that is the bug.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CandidateVendor, RetrievedCandidate } from "../src/matching/candidate.js";
import { evaluateEligibility } from "../src/matching/eligibility.js";
import { normalizeWorkPackage } from "../src/matching/normalization.js";
import type { DimensionKey } from "../src/matching/ranking.js";
import { DIMENSION_WEIGHTS, scoreVendor } from "../src/matching/ranking.js";
import {
  credentialSatisfies,
  extractCertificationRequirements,
  extractMonetaryCeilingInr,
  extractRegions,
} from "../src/matching/requirementSignals.js";
import type { WorkPackageDetail } from "../src/repositories/workPackages.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function workPackage(overrides: Partial<WorkPackageDetail> = {}): WorkPackageDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    analysisId: null,
    packageNumber: "WP-01",
    title: "Solar powered street lighting for fourteen gram panchayats",
    description:
      "Supply, installation and five-year maintenance of 1,240 standalone solar street lighting units.",
    scope:
      "Supply of photovoltaic street lighting units comprising panel, battery, LED luminaire and pole.",
    complexity: "MEDIUM",
    priority: "HIGH",
    estimatedCategory: "Renewable Energy and Electrical Works",
    deliverables: ["1,240 commissioned solar street lighting units"],
    notes: null,
    aiReasoning: null,
    confidenceScore: null,
    status: "CONFIRMED",
    source: "MANUAL",
    displayOrder: 1,
    isDeleted: false,
    deletedAt: null,
    rejectionReason: null,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    requirements: [],
    dependencies: [],
    versions: [],
    ...overrides,
  };
}

function normalized(overrides: Partial<WorkPackageDetail> = {}) {
  return normalizeWorkPackage({
    workPackage: workPackage(overrides),
    projectTitle: "Integrated rural development programme",
    projectProblemDescription: "A consolidated sanction covering fourteen gram panchayats.",
  });
}

function vendor(overrides: Partial<CandidateVendor> = {}): CandidateVendor {
  return {
    profileId: "33333333-3333-4333-8333-333333333333",
    organizationId: "44444444-4444-4444-8444-444444444444",
    organizationName: "Urja Sahkar Rural Energy Cooperative Limited",
    legalName: "Urja Sahkar Rural Energy Cooperative Limited",
    headline: "Decentralised renewable electrification",
    status: "SUBMITTED",
    verificationState: "VERIFIED",
    completionPercentage: 88,
    capabilityKeywords: ["solar", "photovoltaic", "lighting", "battery", "luminaire", "pole"],
    industries: ["ENERGY"],
    subDomains: [],
    solutionTypes: [],
    sectorsServed: ["Rural development"],
    coreCapabilities: [],
    expertiseAreas: [],
    problemDomains: [],
    operatingStates: ["Maharashtra"],
    serviceCoverage: "MULTI_STATE",
    deliveryModels: [],
    teamSize: 132,
    governmentExperience: "STATE",
    governmentScaleReadiness: "STATE_SCALE",
    deliveryCapability: null,
    minProjectValueInr: 2_500_000,
    typicalProjectValueInr: 38_000_000,
    maxProjectValueInr: 260_000_000,
    credentials: [],
    experience: [],
    offerings: [],
    ...overrides,
  };
}

function retrieved(overrides: Partial<RetrievedCandidate> = {}): RetrievedCandidate {
  return {
    profileId: "33333333-3333-4333-8333-333333333333",
    sources: ["LEXICAL"],
    lexicalRank: 1,
    semanticRank: null,
    semanticSimilarity: null,
    ...overrides,
  };
}

const MANDATORY_ISO = {
  id: "r1",
  kind: "CONSTRAINT",
  category: "COMPLIANCE",
  text: "The supplier must hold ISO 9001 certification.",
  rationale: null,
  status: "ACCEPTED",
};

// ---------------------------------------------------------------------------

describe("requirement signal extraction", () => {
  it("extracts a certification only when the clause is an obligation", () => {
    const mandatory = extractCertificationRequirements([
      "The supplier must hold ISO 9001 certification.",
    ]);
    assert.equal(mandatory.length, 1);
    assert.equal(mandatory[0]?.code, "ISO_9001");

    // A descriptive mention is not a gate. Treating it as one would exclude
    // suppliers on the basis of a sentence that imposed nothing.
    const descriptive = extractCertificationRequirements([
      "Bidders often hold quality accreditation comparable to ISO 9001.",
    ]);
    assert.deepEqual(descriptive, []);
  });

  it("invents nothing when no certification is named", () => {
    assert.deepEqual(
      extractCertificationRequirements(["The contractor must complete works within twelve weeks."]),
      [],
    );
  });

  it("does not turn a preference into a mandatory gate", () => {
    // "shall" makes this look like an obligation, but it obliges nobody.
    // Reading it as a gate would exclude every non-MSME supplier from a
    // procurement that merely favoured them.
    assert.deepEqual(
      extractCertificationRequirements([
        "Preference shall be given to MSME and startup bidders as per the Public Procurement Policy 2012.",
      ]),
      [],
    );

    assert.deepEqual(
      extractCertificationRequirements([
        "ISO 9001 certification is desirable and will be viewed favourably.",
      ]),
      [],
    );
  });

  it("scopes the obligation to the clause that carries it", () => {
    // The "must" belongs to the safety clause, not to the BIS clause.
    assert.deepEqual(
      extractCertificationRequirements([
        "The vendor must comply with safety norms; BIS-marked equipment is preferred.",
      ]),
      [],
    );

    // But a genuine two-clause requirement still produces its gate.
    const real = extractCertificationRequirements([
      "Work shall be carried out safely. The supplier must hold ISO 14001 certification.",
    ]);
    assert.equal(real.length, 1);
    assert.equal(real[0]?.code, "ISO_14001");
    // The quoted source is the clause that imposed it, not the whole paragraph.
    assert.ok(!real[0]?.sourceText.includes("carried out safely"));
  });

  it("does not create a contractor-registration gate from merely naming a department", () => {
    assert.deepEqual(
      extractCertificationRequirements([
        "All works must be coordinated with the Public Works Department of the district.",
      ]),
      [],
    );

    const gated = extractCertificationRequirements([
      "The contractor must hold a valid PWD registration of Class I or equivalent.",
    ]);
    assert.equal(gated.length, 1);
    assert.equal(gated[0]?.code, "PWD_LICENCE");
  });

  it("recognises a credential recorded in a different form from the requirement", () => {
    // The requirement form needs registration wording; the credential form
    // must not, or a supplier is excluded for something they hold.
    assert.equal(credentialSatisfies("GEM", "GeM Seller ID 12345"), true);
    assert.equal(credentialSatisfies("CE", "CE Declaration of Conformity"), true);
    assert.equal(
      credentialSatisfies("BIS", "IS 13947 enclosure conformity Bureau of Indian Standards"),
      true,
    );
    assert.equal(
      credentialSatisfies("CPCB", "Consent to Operate Gujarat Pollution Control Board"),
      true,
    );
  });

  it("recognises a recorded credential regardless of word order", () => {
    assert.equal(
      credentialSatisfies(
        "PWD_LICENCE",
        "Class I Contractor registration Karnataka Public Works Department EMPANELMENT",
      ),
      true,
    );
    assert.equal(credentialSatisfies("PWD_LICENCE", "ISO 9001:2015 Bureau Veritas"), false);
  });

  it("reads the largest stated amount as the package value", () => {
    assert.equal(extractMonetaryCeilingInr(["The sanctioned outlay is ₹9.8 crore."]), 98_000_000);
    assert.equal(extractMonetaryCeilingInr(["Rs. 45 lakh for the first phase."]), 4_500_000);
    // A sub-head figure must not become the ceiling, or every supplier capable
    // of the actual work is excluded.
    assert.equal(
      extractMonetaryCeilingInr(["₹16.4 crore total, of which ₹40 lakh is contingency."]),
      164_000_000,
    );
    assert.equal(extractMonetaryCeilingInr(["No amount is stated."]), null);
  });

  it("does not read a rupee amount out of a word ending in 'rs'", () => {
    // "workers 500" contains "rs 500". Without a word boundary this parsed as
    // ₹500 and became the package's stated value, which then let every
    // supplier clear the capacity gate.
    assert.equal(
      extractMonetaryCeilingInr(["The contractor shall deploy 40 workers 500 hours per month."]),
      null,
    );
    assert.equal(extractMonetaryCeilingInr(["Coverage must span 12 sensors 250 units."]), null);

    // A real amount in the same shape still parses.
    assert.equal(extractMonetaryCeilingInr(["The outlay is Rs 4,50,000."]), 450_000);
  });

  it("extracts only states that are actually named", () => {
    assert.deepEqual(extractRegions(["Works across Maharashtra and Gujarat."]), [
      "Gujarat",
      "Maharashtra",
    ]);
    assert.deepEqual(extractRegions(["Works across fourteen gram panchayats."]), []);
  });
});

describe("work package normalization", () => {
  it("weights title vocabulary above scope vocabulary", () => {
    const result = normalized();
    const titleTerm = result.termWeights["lighting"] ?? 0;
    const scopeTerm = result.termWeights["panel"] ?? 0;

    assert.ok(titleTerm > scopeTerm, `expected title term to outweigh scope term`);
    assert.equal(result.terms[0], result.terms[0]?.toLowerCase());
  });

  it("strips generic procurement vocabulary from the matching terms", () => {
    const result = normalized();
    for (const generic of ["procurement", "supplier", "requirement", "deliverable", "tender"]) {
      assert.ok(
        !result.terms.includes(generic),
        `"${generic}" must not be a matching term — it appears in every package and every profile`,
      );
    }
  });

  it("is deterministic", () => {
    assert.deepEqual(normalized().terms, normalized().terms);
    assert.equal(normalized().document, normalized().document);
  });

  it("carries mandatory constraints through from the requirements", () => {
    const result = normalized({ requirements: [MANDATORY_ISO] });
    assert.equal(result.mandatoryCertifications.length, 1);
    assert.equal(result.mandatoryCertifications[0]?.code, "ISO_9001");
  });
});

describe("deterministic eligibility", () => {
  it("excludes a supplier missing a mandatory certification, and says which", () => {
    const result = evaluateEligibility(normalized({ requirements: [MANDATORY_ISO] }), vendor());

    assert.equal(result.eligible, false);
    const failure = result.failedChecks.find((check) => check.code === "MANDATORY_CERTIFICATION");
    assert.ok(failure !== undefined);
    assert.match(failure.requirement, /ISO 9001/);
    assert.match(failure.evidence, /No matching credential/);
  });

  it("admits a supplier who holds the mandatory certification", () => {
    const result = evaluateEligibility(
      normalized({ requirements: [MANDATORY_ISO] }),
      vendor({
        credentials: [
          {
            id: "c1",
            kind: "CERTIFICATION",
            name: "ISO 9001:2015",
            issuingAuthority: "TUV Rheinland India",
            validUntil: null,
            verificationState: "VERIFIED",
          },
        ],
      }),
    );

    assert.equal(result.eligible, true);
    assert.ok(result.passedChecks.some((check) => check.code === "MANDATORY_CERTIFICATION"));
  });

  it("treats an expired mandatory credential as not held", () => {
    const result = evaluateEligibility(
      normalized({ requirements: [MANDATORY_ISO] }),
      vendor({
        credentials: [
          {
            id: "c1",
            kind: "CERTIFICATION",
            name: "ISO 9001:2015",
            issuingAuthority: "TUV Rheinland India",
            validUntil: "2020-01-01",
            verificationState: "VERIFIED",
          },
        ],
      }),
      new Date("2026-08-29T00:00:00Z"),
    );

    assert.equal(result.eligible, false);
    assert.ok(result.failedChecks.some((check) => check.code === "CREDENTIAL_VALIDITY"));
  });

  it("warns rather than excludes when a mandatory credential expires soon", () => {
    const result = evaluateEligibility(
      normalized({ requirements: [MANDATORY_ISO] }),
      vendor({
        credentials: [
          {
            id: "c1",
            kind: "CERTIFICATION",
            name: "ISO 9001:2015",
            issuingAuthority: "TUV Rheinland India",
            validUntil: "2026-11-01",
            verificationState: "VERIFIED",
          },
        ],
      }),
      new Date("2026-08-29T00:00:00Z"),
    );

    assert.equal(result.eligible, true);
    assert.ok(result.warnings.some((warning) => warning.code === "CREDENTIAL_EXPIRING"));
  });

  it("treats a credential as valid through the whole of its final day", () => {
    const holder = (validUntil: string) =>
      vendor({
        credentials: [
          {
            id: "c1",
            kind: "CERTIFICATION",
            name: "ISO 9001:2015",
            issuingAuthority: "TUV Rheinland India",
            validUntil,
            verificationState: "VERIFIED",
          },
        ],
      });

    const pkg = normalized({ requirements: [MANDATORY_ISO] });
    // Afternoon on the expiry date. Comparing a date against a timestamp made
    // this come out as minus one day and excluded a supplier whose credential
    // was still valid.
    const afternoonOfExpiry = new Date("2026-03-15T15:00:00Z");

    assert.equal(evaluateEligibility(pkg, holder("2026-03-15"), afternoonOfExpiry).eligible, true);
    assert.equal(evaluateEligibility(pkg, holder("2026-03-14"), afternoonOfExpiry).eligible, false);
  });

  it("does not gate on a region the work package never states", () => {
    // The state is named only in the parent project. Inheriting it would
    // exclude suppliers against a requirement that appears nowhere in the
    // package, and would quote that requirement back to the officer.
    const inherited = normalizeWorkPackage({
      workPackage: workPackage(),
      projectTitle: "Modernisation of cold storage across Maharashtra",
      projectProblemDescription: "Facilities across the state are failing.",
    });

    assert.deepEqual(inherited.requiredRegions, []);

    const gujaratSupplier = vendor({
      serviceCoverage: "STATE",
      operatingStates: ["Gujarat"],
    });
    const result = evaluateEligibility(inherited, gujaratSupplier);
    assert.ok(!result.failedChecks.some((check) => check.code === "DELIVERY_REGION"));
  });

  it("excludes a profile too incomplete to assess", () => {
    const result = evaluateEligibility(normalized(), vendor({ completionPercentage: 21 }));
    assert.equal(result.eligible, false);
    assert.ok(result.failedChecks.some((check) => check.code === "PROFILE_ASSESSABLE"));
  });

  it("excludes a rejected supplier and admits an unverified one with a warning", () => {
    assert.equal(
      evaluateEligibility(normalized(), vendor({ verificationState: "REJECTED" })).eligible,
      false,
    );

    const unverified = evaluateEligibility(
      normalized(),
      vendor({ verificationState: "UNVERIFIED" }),
    );
    assert.equal(unverified.eligible, true);
    assert.ok(unverified.warnings.some((warning) => warning.code === "NOT_YET_VERIFIED"));
  });

  it("excludes a region-limited supplier who does not operate where delivery is", () => {
    const pkg = normalized({
      requirements: [
        {
          id: "r2",
          kind: "CONSTRAINT",
          category: "OTHER",
          text: "Delivery is across Kerala.",
          rationale: null,
          status: "ACCEPTED",
        },
      ],
    });

    const excluded = evaluateEligibility(
      pkg,
      vendor({ serviceCoverage: "STATE", operatingStates: ["Maharashtra"] }),
    );
    assert.equal(excluded.eligible, false);
    assert.ok(excluded.failedChecks.some((check) => check.code === "DELIVERY_REGION"));

    // A nationally operating supplier is not gated by a state they did not list.
    const national = evaluateEligibility(
      pkg,
      vendor({ serviceCoverage: "NATIONAL", operatingStates: [] }),
    );
    assert.equal(national.eligible, true);
  });

  it("excludes a supplier whose stated capacity is below the package value", () => {
    const pkg = normalized({
      requirements: [
        {
          id: "r3",
          kind: "CONSTRAINT",
          category: "BUDGET",
          text: "The sanctioned outlay for this package is ₹9.8 crore.",
          rationale: null,
          status: "ACCEPTED",
        },
      ],
    });

    const result = evaluateEligibility(pkg, vendor({ maxProjectValueInr: 60_000_000 }));
    assert.equal(result.eligible, false);
    assert.ok(result.failedChecks.some((check) => check.code === "CONTRACT_VALUE_CEILING"));
  });

  it("asserts nothing about a dimension the package does not constrain", () => {
    // No certification, region or value is stated, so no check for any of them
    // should appear — an absent constraint is not a satisfied one.
    const result = evaluateEligibility(normalized(), vendor());
    const codes = [...result.passedChecks, ...result.failedChecks].map((check) => check.code);

    assert.ok(!codes.includes("MANDATORY_CERTIFICATION"));
    assert.ok(!codes.includes("DELIVERY_REGION"));
    assert.ok(!codes.includes("CONTRACT_VALUE_CEILING"));
  });
});

describe("multi-factor ranking", () => {
  const eligible = () => evaluateEligibility(normalized(), vendor());

  it("is deterministic for identical input", () => {
    const first = scoreVendor(normalized(), vendor(), retrieved(), eligible(), {
      semanticEnabled: true,
    });
    const second = scoreVendor(normalized(), vendor(), retrieved(), eligible(), {
      semanticEnabled: true,
    });

    assert.equal(first.overallScore, second.overallScore);
    assert.deepEqual(
      first.dimensions.map((d) => d.score),
      second.dimensions.map((d) => d.score),
    );
  });

  it("reports every dimension with its weight", () => {
    const result = scoreVendor(normalized(), vendor(), retrieved(), eligible(), {
      semanticEnabled: true,
    });

    assert.deepEqual(
      result.dimensions.map((dimension) => dimension.key).sort(),
      Object.keys(DIMENSION_WEIGHTS).sort(),
    );
    for (const dimension of result.dimensions) {
      assert.equal(dimension.weight, DIMENSION_WEIGHTS[dimension.key]);
      assert.ok(dimension.score >= 0 && dimension.score <= 100);
      assert.ok(dimension.detail.length > 0);
    }
  });

  it("scores an irrelevant supplier below a relevant one, whatever their credentials", () => {
    // The failure mode this guards: a verified, national, well-credentialled
    // supplier of the wrong thing outranking a smaller supplier of the right
    // thing. Qualifier dimensions are scaled by relevance precisely to stop it.
    const relevant = scoreVendor(normalized(), vendor(), retrieved(), eligible(), {
      semanticEnabled: true,
    });

    const irrelevantVendor = vendor({
      capabilityKeywords: ["catering", "canteen", "menu"],
      industries: ["FOOD"],
      serviceCoverage: "NATIONAL",
      governmentScaleReadiness: "NATIONAL_SCALE",
      governmentExperience: "MULTIPLE",
      completionPercentage: 100,
      credentials: [
        {
          id: "c1",
          kind: "CERTIFICATION",
          name: "ISO 9001:2015",
          issuingAuthority: "TUV",
          validUntil: null,
          verificationState: "VERIFIED",
        },
        {
          id: "c2",
          kind: "CERTIFICATION",
          name: "ISO 14001:2015",
          issuingAuthority: "TUV",
          validUntil: null,
          verificationState: "VERIFIED",
        },
        {
          id: "c3",
          kind: "CERTIFICATION",
          name: "ISO 45001:2018",
          issuingAuthority: "TUV",
          validUntil: null,
          verificationState: "VERIFIED",
        },
      ],
    });

    const irrelevant = scoreVendor(
      normalized(),
      irrelevantVendor,
      retrieved({ sources: ["SEMANTIC"], semanticSimilarity: 0.14 }),
      evaluateEligibility(normalized(), irrelevantVendor),
      { semanticEnabled: true },
    );

    assert.ok(
      irrelevant.overallScore < relevant.overallScore,
      `irrelevant ${irrelevant.overallScore} must score below relevant ${relevant.overallScore}`,
    );
  });

  it("changes the score when the supplier's capabilities change", () => {
    const before = scoreVendor(normalized(), vendor(), retrieved(), eligible(), {
      semanticEnabled: true,
    });

    const narrowed = vendor({ capabilityKeywords: ["catering"] });
    const after = scoreVendor(
      normalized(),
      narrowed,
      retrieved(),
      evaluateEligibility(normalized(), narrowed),
      { semanticEnabled: true },
    );

    assert.ok(after.overallScore < before.overallScore);
  });

  it("changes the score when the work package's requirements change", () => {
    const lighting = scoreVendor(normalized(), vendor(), retrieved(), eligible(), {
      semanticEnabled: true,
    });

    const unrelated = normalized({
      title: "Supply of fresh vegetables and fruit to anganwadi centres",
      description: "A three-year supply line delivering fresh vegetables and fruit.",
      scope: "Grading to the specified size, cold handling, weekly indent delivery.",
      deliverables: ["Weekly indent-based delivery"],
      estimatedCategory: "Food and Nutrition Supply",
    });

    const food = scoreVendor(
      unrelated,
      vendor(),
      retrieved(),
      evaluateEligibility(unrelated, vendor()),
      { semanticEnabled: true },
    );

    assert.ok(food.overallScore < lighting.overallScore);
  });

  it("never claims a capability, credential or engagement the supplier did not record", () => {
    const bare = vendor({ credentials: [], experience: [], offerings: [] });
    const result = scoreVendor(
      normalized(),
      bare,
      retrieved(),
      evaluateEligibility(normalized(), bare),
      { semanticEnabled: true },
    );

    assert.deepEqual(result.evidence.relevantExperience, []);
    assert.deepEqual(result.evidence.relevantOfferings, []);
    assert.deepEqual(result.evidence.credentials, []);

    // Every matched capability must be a term the supplier actually declared.
    for (const matched of result.evidence.matchedCapabilities) {
      assert.ok(
        bare.capabilityKeywords.includes(matched),
        `"${matched}" is not among the supplier's recorded keywords`,
      );
    }

    assert.ok(
      result.evidence.gaps.some((gap) => /No previous projects are recorded/.test(gap)),
      "an absence of recorded experience must be stated as a gap",
    );
  });

  it("counts only experience that overlaps the package's subject matter", () => {
    const withExperience = vendor({
      experience: [
        {
          id: "e1",
          title: "Autonomous solar lighting for 96 hamlets",
          clientName: "Zilla Parishad",
          clientType: "STATE_GOVERNMENT",
          sector: "Energy",
          description: "Photovoltaic units with battery storage.",
          outcome: "All hamlets lit.",
          contractValueInr: 41_500_000,
          startYear: 2021,
          endYear: 2023,
        },
        {
          id: "e2",
          title: "Canteen catering for a district office",
          clientName: "Collectorate",
          clientType: "STATE_GOVERNMENT",
          sector: "Catering",
          description: "Daily meals.",
          outcome: "Served.",
          contractValueInr: 1_000_000,
          startYear: 2020,
          endYear: 2021,
        },
      ],
    });

    const result = scoreVendor(
      normalized(),
      withExperience,
      retrieved(),
      evaluateEligibility(normalized(), withExperience),
      { semanticEnabled: true },
    );

    assert.equal(result.evidence.relevantExperience.length, 1);
    assert.match(result.evidence.relevantExperience[0]?.title ?? "", /solar lighting/);
  });

  it("withholds the semantic dimension rather than scoring zero when it was not measured", () => {
    // A candidate found lexically but outside the retrieved neighbourhood has
    // an unknown similarity, not a zero one. Charging 20 points against an
    // unmeasured quantity could drop a supplier a whole band on where the
    // top-K cut happened to fall.
    const strong = vendor({
      capabilityKeywords: [
        "solar", "photovoltaic", "lighting", "battery", "luminaire", "pole",
        "panchayats", "standalone", "commissioned", "maintenance",
      ],
    });

    const unmeasured = scoreVendor(
      normalized(),
      strong,
      retrieved({ sources: ["LEXICAL"], semanticSimilarity: null }),
      evaluateEligibility(normalized(), strong),
      { semanticEnabled: true },
    );

    const measured = scoreVendor(
      normalized(),
      strong,
      retrieved({ sources: ["LEXICAL", "SEMANTIC"], semanticSimilarity: 0.7 }),
      evaluateEligibility(normalized(), strong),
      { semanticEnabled: true },
    );

    // Not scored, so not penalised into a different band.
    assert.ok(
      Math.abs(measured.overallScore - unmeasured.overallScore) < 20,
      `measured ${measured.overallScore} vs unmeasured ${unmeasured.overallScore}`,
    );

    // And the dimension says why rather than presenting a bare zero.
    const semantic = unmeasured.dimensions.find(
      (dimension) => (dimension.key as DimensionKey) === "semantic",
    );
    assert.ok(semantic !== undefined);
    assert.match(semantic.detail, /not scored/i);
  });

  it("redistributes the semantic weight rather than deflating the score when semantic is off", () => {
    const withSemantic = scoreVendor(
      normalized(),
      vendor(),
      retrieved({ sources: ["LEXICAL", "SEMANTIC"], semanticSimilarity: 0.7 }),
      eligible(),
      { semanticEnabled: true },
    );

    const withoutSemantic = scoreVendor(normalized(), vendor(), retrieved(), eligible(), {
      semanticEnabled: false,
    });

    // A lexical-only run must remain on the same 0-100 scale. Losing twenty
    // points purely because the embedding service was unreachable would make
    // two runs of the same data incomparable.
    assert.ok(
      Math.abs(withSemantic.overallScore - withoutSemantic.overallScore) < 25,
      `semantic ${withSemantic.overallScore} vs lexical-only ${withoutSemantic.overallScore}`,
    );
    assert.ok(withoutSemantic.overallScore > 0);
  });
});
