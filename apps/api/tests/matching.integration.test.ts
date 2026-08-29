/**
 * End-to-end tests for work-package vendor matching.
 *
 * These need the database and the AI service, because what they verify is
 * precisely what the unit tests cannot: that pgvector retrieval, the embedding
 * lifecycle, organization scoping and the confirmed-package gate behave as
 * claimed against real data.
 *
 * Run with:
 *   npm run migrate && npm run seed && npm run test:integration
 *
 * The suite skips rather than fails when DATABASE_URL is absent, so a
 * contributor without a database can still run `npm test`.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { loadConfig } from "../src/config/env.js";
import { closePool, query } from "../src/db/pool.js";
import { runMatching } from "../src/matching/pipeline.js";
import { normalizeWorkPackage } from "../src/matching/normalization.js";
import { loadStoredRecommendations } from "../src/matching/presentation.js";
import { retrievalTerms } from "../src/matching/retrieval.js";
import {
  EMBEDDING_PIPELINE_VERSION,
  semanticStorageAvailable,
  sourceDigest,
  syncVendorEmbeddings,
} from "../src/repositories/embeddings.js";
import { findWorkPackageById } from "../src/repositories/workPackages.js";
import { EMBEDDING_DIMENSIONS, requestEmbeddings } from "../src/services/embeddingClient.js";
import { tokenise } from "../src/vendor/capabilityDocument.js";
import { ROLE_PERMISSIONS } from "../src/auth/permissions.js";

// Loaded at module scope, not in `before`: the skip flags below are evaluated
// while the suites are being declared, which happens before any hook runs.
try {
  loadConfig();
} catch {
  // No .env and no DATABASE_URL — the database suites skip.
}

const hasDatabase = process.env.DATABASE_URL !== undefined && process.env.DATABASE_URL !== "";

interface SeededPackage {
  id: string;
  packageNumber: string;
  status: string;
  organizationId: string;
  createdBy: string;
  projectId: string;
}

let packages: SeededPackage[] = [];

before(async () => {
  if (!hasDatabase) return;

  const result = await query<{
    id: string;
    package_number: string;
    status: string;
    organization_id: string;
    created_by: string;
    project_id: string;
  }>(
    `SELECT wp.id, wp.package_number, wp.status, pr.organization_id, pr.created_by, pr.id AS project_id
     FROM work_packages wp
     JOIN procurement_projects pr ON pr.id = wp.project_id
     WHERE pr.reference_number = 'PRJ-2026-0201' AND wp.is_deleted = false
     ORDER BY wp.display_order`,
  );

  packages = result.rows.map((row) => ({
    id: row.id,
    packageNumber: row.package_number,
    status: row.status,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    projectId: row.project_id,
  }));
});

after(async () => {
  if (hasDatabase) await closePool();
});

function packageByNumber(number: string): SeededPackage {
  const found = packages.find((entry) => entry.packageNumber === number);
  assert.ok(found !== undefined, `${number} is missing — run "npm run seed" first`);
  return found;
}

function match(entry: SeededPackage) {
  return runMatching({
    workPackageId: entry.id,
    organizationId: entry.organizationId,
    userId: entry.createdBy,
  });
}

describe("work package matching, end to end", { skip: !hasDatabase }, () => {
  it("matches a confirmed work package and ranks eligible suppliers", async () => {
    const outcome = await match(packageByNumber("WP-01"));

    assert.ok(outcome.recommendations.length > 0, "expected at least one eligible supplier");
    assert.ok(outcome.provenance.poolSize > 0);

    for (const ranked of outcome.recommendations) {
      assert.equal(ranked.eligibility.eligible, true);
      assert.deepEqual(ranked.eligibility.failedChecks, []);
    }

    // Descending, and every recommendation carries its reasons.
    for (let index = 1; index < outcome.recommendations.length; index += 1) {
      const previous = outcome.recommendations[index - 1]?.overallScore ?? 0;
      const current = outcome.recommendations[index]?.overallScore ?? 0;
      assert.ok(previous >= current, "recommendations must be ordered by score");
    }

    const top = outcome.recommendations[0];
    assert.ok(top !== undefined);
    assert.ok(top.explanation.length > 0);
    assert.ok(top.dimensions.length === 7);
  });

  it("refuses to match a work package that is not confirmed", async () => {
    const draft = packageByNumber("WP-05");
    assert.notEqual(draft.status, "CONFIRMED");

    await assert.rejects(
      () => match(draft),
      (error: unknown) =>
        (error as { code?: string }).code === "WORK_PACKAGE_NOT_CONFIRMED",
      "an unconfirmed package must not be matchable",
    );
  });

  it("returns 404 for a work package in another organization", async () => {
    const entry = packageByNumber("WP-01");

    await assert.rejects(
      () =>
        runMatching({
          workPackageId: entry.id,
          organizationId: "00000000-0000-4000-8000-000000000000",
          userId: entry.createdBy,
        }),
      (error: unknown) =>
        (error as { statusCode?: number }).statusCode === 404 &&
        (error as { code?: string }).code === "NOT_FOUND",
      "cross-organization access must read as absent, not forbidden",
    );
  });

  it("excludes suppliers failing a mandatory requirement and records why", async () => {
    const outcome = await match(packageByNumber("WP-01"));

    assert.ok(outcome.excluded.length > 0, "expected at least one excluded supplier");

    for (const ranked of outcome.excluded) {
      assert.equal(ranked.eligibility.eligible, false);
      assert.ok(
        ranked.eligibility.failedChecks.length > 0,
        "an excluded supplier must carry the check that excluded them",
      );
      for (const failed of ranked.eligibility.failedChecks) {
        assert.ok(failed.requirement.length > 0);
        assert.ok(failed.evidence.length > 0);
      }
    }

    // The gate is a gate: no excluded supplier appears among recommendations.
    const recommendedIds = new Set(
      outcome.recommendations.map((ranked) => ranked.vendor.profileId),
    );
    for (const ranked of outcome.excluded) {
      assert.ok(!recommendedIds.has(ranked.vendor.profileId));
    }
  });

  it("produces a different ranking for each package in the same project", async () => {
    const [roads, lighting, waste, food] = await Promise.all([
      match(packageByNumber("WP-01")),
      match(packageByNumber("WP-02")),
      match(packageByNumber("WP-03")),
      match(packageByNumber("WP-04")),
    ]);

    const winners = [roads, lighting, waste, food].map(
      (outcome) => outcome.recommendations[0]?.vendor.organizationName,
    );

    for (const winner of winners) {
      assert.ok(winner !== undefined, "every confirmed package should recommend someone");
    }

    // The whole reason for matching per package rather than per project: the
    // best supplier for road works is not the best supplier for food supply.
    assert.equal(
      new Set(winners).size,
      winners.length,
      `expected a different top supplier per package, got ${winners.join(" | ")}`,
    );
  });

  it("ranks deterministically across repeated runs", async () => {
    const entry = packageByNumber("WP-02");
    const first = await match(entry);
    const second = await match(entry);

    assert.deepEqual(
      first.recommendations.map((r) => [r.vendor.profileId, r.overallScore]),
      second.recommendations.map((r) => [r.vendor.profileId, r.overallScore]),
    );
  });

  it("records provenance sufficient to reproduce the run", async () => {
    const outcome = await match(packageByNumber("WP-03"));
    const p = outcome.provenance;

    assert.ok(p.runId.length > 0);
    assert.ok(p.strategyVersion >= 1);
    assert.ok(p.normalizationVersion >= 1);
    assert.ok(p.eligibilityVersion >= 1);
    assert.ok(p.rankingVersion >= 1);
    assert.ok(Object.keys(p.weights).length === 7);

    const stored = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM work_package_match_results WHERE run_id = $1`,
      [p.runId],
    );

    // Excluded suppliers are stored too — a gate whose decisions are not
    // written down cannot be audited.
    assert.equal(
      Number.parseInt(stored.rows[0]?.count ?? "0", 10),
      outcome.recommendations.length + outcome.excluded.length,
    );
  });

  it("serves a stored run identically to the fresh one", async () => {
    const outcome = await match(packageByNumber("WP-04"));
    const stored = await loadStoredRecommendations(outcome.provenance.runId);

    assert.deepEqual(
      stored.recommendations.map((r) => [r.vendor.vendorProfileId, r.overallScore, r.band]),
      outcome.recommendations.map((r) => [r.vendor.profileId, r.overallScore, r.band]),
    );
  });

  it("derives explanations only from data the supplier actually recorded", async () => {
    const outcome = await match(packageByNumber("WP-04"));
    const top = outcome.recommendations[0];
    assert.ok(top !== undefined);

    const recorded = new Set(top.vendor.capabilityKeywords.map((k) => k.toLowerCase()));
    for (const matched of top.evidence.matchedCapabilities) {
      assert.ok(recorded.has(matched), `"${matched}" was not declared by this supplier`);
    }

    const titles = new Set(top.vendor.experience.map((entry) => entry.title));
    for (const relevant of top.evidence.relevantExperience) {
      assert.ok(titles.has(relevant.title), `"${relevant.title}" is not a recorded project`);
    }

    const credentialNames = top.vendor.credentials.map((c) => c.name);
    for (const credential of top.evidence.credentials) {
      assert.ok(
        credentialNames.some((name) => credential.startsWith(name)),
        `"${credential}" is not a recorded credential`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Hybrid retrieval — the claim that semantic retrieval earns its place.
// ---------------------------------------------------------------------------

describe("hybrid retrieval", { skip: !hasDatabase }, () => {
  it("runs both halves and deduplicates the pool", async () => {
    const outcome = await match(packageByNumber("WP-02"));
    const p = outcome.provenance;

    assert.ok(p.lexicalCandidates > 0, "lexical retrieval should find candidates");

    if (p.semanticEnabled) {
      assert.ok(p.semanticCandidates > 0, "semantic retrieval should find candidates");
      // The union is deduplicated: the pool cannot exceed the sum, and a
      // supplier found by both appears once with both provenances.
      assert.ok(p.poolSize <= p.lexicalCandidates + p.semanticCandidates);
    }

    const all = [...outcome.recommendations, ...outcome.excluded];
    const ids = all.map((ranked) => ranked.vendor.profileId);
    assert.equal(new Set(ids).size, ids.length, "the candidate pool must be deduplicated");
    assert.equal(ids.length, p.poolSize);

    for (const ranked of all) {
      assert.ok(ranked.retrieval.sources.length > 0);
      for (const source of ranked.retrieval.sources) {
        assert.ok(source === "LEXICAL" || source === "SEMANTIC");
      }
    }
  });

  /**
   * The load-bearing claim: a supplier who does the work but describes it in
   * their own words is unreachable by keyword overlap and reachable by meaning.
   *
   * Proved on the mechanism rather than on a hand-picked seeded pair, so it
   * cannot pass by accident of demo data. The assertion is *relative* — the
   * paraphrase must beat an unrelated control by a clear margin — because an
   * absolute similarity threshold is meaningless across embedding models: a
   * trained encoder puts unrelated procurement text near 0.68, so "above 0.4"
   * would be true of everything and would prove nothing.
   */
  it("relates texts with zero lexical overlap, above an unrelated control", async () => {
    const cases: Array<{ left: string; right: string; control: string }> = [
      {
        left: "Aggregation, grading and cold chain for horticultural produce from smallholder farms",
        right: "Weekly supply of fresh agricultural vegetables to anganwadi centres",
        control: "Penetration testing, firewall configuration and information security auditing",
      },
      {
        left: "Municipal solid waste recovery, composting and material segregation for urban local bodies",
        right: "Decentralised refuse processing yards with organic fraction diversion",
        control: "Point-of-care haemoglobin diagnostics for maternal anaemia screening",
      },
      {
        left: "Autonomous photovoltaic generation with electrochemical storage for unelectrified habitations",
        right: "Solar street lighting with LED luminaires and battery backup",
        control: "Stitching and supply of school uniforms in cotton fabric",
      },
    ];

    const embeddings = await requestEmbeddings(
      cases.flatMap((entry) => [entry.left, entry.right, entry.control]),
    );
    if (embeddings === undefined) {
      assert.fail("the embedding service is unavailable — start apps/ai-service");
    }

    const dot = (a: number[], b: number[]) =>
      a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

    for (const [index, entry] of cases.entries()) {
      const leftTokens = new Set(tokenise(entry.left));
      const rightTokens = new Set(tokenise(entry.right));
      const shared = [...leftTokens].filter((token) => rightTokens.has(token));

      const left = embeddings.vectors[index * 3];
      const right = embeddings.vectors[index * 3 + 1];
      const control = embeddings.vectors[index * 3 + 2];
      assert.ok(left !== undefined && right !== undefined && control !== undefined);

      const paraphrase = dot(left, right);
      const unrelated = dot(left, control);

      // The lexical half genuinely fails on the paraphrase.
      assert.ok(
        shared.length <= 1,
        `expected near-zero lexical overlap, shared: ${shared.join(", ")}`,
      );

      // The semantic half genuinely succeeds, and does so by a margin that no
      // unrelated pair reaches.
      assert.ok(
        paraphrase > unrelated + 0.1,
        `"${entry.left.slice(0, 40)}…": paraphrase ${paraphrase.toFixed(3)} must clearly exceed ` +
          `unrelated control ${unrelated.toFixed(3)}`,
      );
    }
  });

  it("separates related from unrelated domains", async () => {
    const embeddings = await requestEmbeddings([
      "Road construction with bituminous surfacing and cross drainage culverts",
      "Earthwork, granular sub-base and reconstruction of failed culverts on rural links",
      "Point-of-care haemoglobin diagnostics for maternal anaemia screening",
    ]);
    assert.ok(embeddings !== undefined, "the embedding service is unavailable");

    const [roadsA, roadsB, health] = embeddings.vectors;
    assert.ok(roadsA !== undefined && roadsB !== undefined && health !== undefined);

    const dot = (a: number[], b: number[]) =>
      a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

    assert.ok(
      dot(roadsA, roadsB) > dot(roadsA, health),
      "two descriptions of road works must be closer to each other than to diagnostics",
    );
  });

  it("only retrieves on terms strong enough to mean something", async () => {
    const entry = packageByNumber("WP-01");
    const detail = await findWorkPackageById(entry.id);
    assert.ok(detail !== undefined);

    const project = await query<{ title: string; problem_description: string }>(
      `SELECT title, problem_description FROM procurement_projects WHERE id = $1`,
      [entry.projectId],
    );

    const normalized = normalizeWorkPackage({
      workPackage: detail,
      projectTitle: project.rows[0]?.title ?? "",
      projectProblemDescription: project.rows[0]?.problem_description ?? "",
    });

    const terms = retrievalTerms(normalized);
    assert.ok(terms.length > 0 && terms.length <= 40);

    // Generic procurement vocabulary must never reach retrieval — it is what
    // makes every supplier look like a candidate for every package.
    for (const generic of ["government", "supplier", "service", "solution", "contract", "project"]) {
      assert.ok(!terms.includes(generic), `"${generic}" must not be a retrieval term`);
    }
  });
});

// ---------------------------------------------------------------------------
// Embedding lifecycle
// ---------------------------------------------------------------------------

describe("embedding lifecycle", { skip: !hasDatabase }, () => {
  it("regenerates an embedding when its source representation changes", async () => {
    if (!(await semanticStorageAvailable())) return;

    const profile = await query<{ id: string; semantic_document: string }>(
      `SELECT p.id, p.semantic_document
       FROM vendor_profiles p
       WHERE p.semantic_document IS NOT NULL AND p.semantic_document <> ''
       ORDER BY p.completion_percentage DESC
       LIMIT 1`,
    );

    const row = profile.rows[0];
    assert.ok(row !== undefined, "no supplier with a semantic document — run the seed");

    await syncVendorEmbeddings([{ id: row.id, semanticDocument: row.semantic_document }]);

    const stored = await query<{ source_hash: string; embedding: string }>(
      `SELECT source_hash, embedding::text AS embedding
       FROM vendor_capability_embeddings WHERE vendor_profile_id = $1`,
      [row.id],
    );

    const before = stored.rows[0];
    assert.ok(before !== undefined, "the embedding should have been written");
    assert.equal(before.source_hash, sourceDigest(row.semantic_document));

    // An unchanged document must not be re-embedded.
    const unchanged = await syncVendorEmbeddings([
      { id: row.id, semanticDocument: row.semantic_document },
    ]);
    assert.equal(unchanged?.refreshed, 0, "an unchanged document must not be re-embedded");

    // A changed one must be.
    const revised = `${row.semantic_document}\nDrone-based topographic survey and photogrammetry.`;
    const refreshed = await syncVendorEmbeddings([
      { id: row.id, semanticDocument: revised },
    ]);
    assert.equal(refreshed?.refreshed, 1, "a changed document must be re-embedded");

    const after = await query<{ source_hash: string; embedding: string; embedding_version: number }>(
      `SELECT source_hash, embedding::text AS embedding, embedding_version
       FROM vendor_capability_embeddings WHERE vendor_profile_id = $1`,
      [row.id],
    );

    assert.equal(after.rows[0]?.source_hash, sourceDigest(revised));
    assert.notEqual(after.rows[0]?.embedding, before.embedding);
    assert.equal(after.rows[0]?.embedding_version, EMBEDDING_PIPELINE_VERSION);

    // Restore, so the suite leaves the demonstration data as it found it.
    await syncVendorEmbeddings([{ id: row.id, semanticDocument: row.semantic_document }]);
  });

  it("stores vectors of the width the column expects", async () => {
    if (!(await semanticStorageAvailable())) return;

    const result = await query<{ dimensions: number; actual: number }>(
      `SELECT dimensions, vector_dims(embedding) AS actual
       FROM vendor_capability_embeddings LIMIT 5`,
    );

    for (const row of result.rows) {
      assert.equal(row.actual, EMBEDDING_DIMENSIONS);
      assert.equal(row.dimensions, EMBEDDING_DIMENSIONS);
    }
  });
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("matching authorization", () => {
  it("grants matching to officials and read-only oversight to administrators", () => {
    assert.ok(ROLE_PERMISSIONS.GOVERNMENT_OFFICIAL.includes("vendor:matching:read"));
    assert.ok(ROLE_PERMISSIONS.GOVERNMENT_OFFICIAL.includes("vendor:shortlist:manage"));

    assert.ok(ROLE_PERMISSIONS.ADMIN.includes("vendor:matching:read"));
    // Shortlisting is a procurement act and stays with the accountable official.
    assert.ok(!ROLE_PERMISSIONS.ADMIN.includes("vendor:shortlist:manage"));
  });

  it("gives vendors no access to government matching at all", () => {
    assert.ok(!ROLE_PERMISSIONS.VENDOR.includes("vendor:matching:read"));
    assert.ok(!ROLE_PERMISSIONS.VENDOR.includes("vendor:shortlist:manage"));

    // A supplier must not be able to see who else was considered, or how they
    // were scored against them.
    for (const permission of ROLE_PERMISSIONS.VENDOR) {
      assert.ok(!permission.startsWith("vendor:matching"));
      assert.ok(!permission.startsWith("vendor:shortlist"));
    }
  });
});
