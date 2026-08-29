/**
 * Runs the matching pipeline against every confirmed work package in the
 * seeded demonstration project and prints the result.
 *
 * A development tool, not part of the application. It exists because the value
 * of hybrid retrieval is an empirical claim — that semantic retrieval surfaces
 * suppliers the keyword search misses — and the honest way to make that claim
 * is to run it and read what comes back.
 */

import { loadConfig } from "../src/config/env.js";
import { runMatching } from "../src/matching/pipeline.js";
import { closePool, query } from "../src/db/pool.js";

async function main(): Promise<void> {
  loadConfig();

  const packages = await query<{
    id: string;
    package_number: string;
    title: string;
    status: string;
    organization_id: string;
    created_by: string;
  }>(
    `SELECT wp.id, wp.package_number, wp.title, wp.status,
            pr.organization_id, pr.created_by
     FROM work_packages wp
     JOIN procurement_projects pr ON pr.id = wp.project_id
     WHERE pr.reference_number = 'PRJ-2026-0201' AND wp.is_deleted = false
     ORDER BY wp.display_order`,
  );

  for (const row of packages.rows) {
    console.log("");
    console.log("=".repeat(100));
    console.log(`${row.package_number}  ${row.title}`);
    console.log(`status: ${row.status}`);
    console.log("=".repeat(100));

    try {
      const outcome = await runMatching({
        workPackageId: row.id,
        organizationId: row.organization_id,
        userId: row.created_by,
      });

      const p = outcome.provenance;
      console.log(
        `pool ${p.poolSize} (lexical ${p.lexicalCandidates}, semantic ${p.semanticCandidates}) | ` +
          `eligible ${p.eligibleCount} | excluded ${p.excludedCount} | ` +
          `semantic ${p.semanticEnabled ? p.embeddingModel : "OFF"} | ${p.durationMs}ms`,
      );

      if (outcome.workPackage.mandatoryCertifications.length > 0) {
        console.log(
          `mandatory: ${outcome.workPackage.mandatoryCertifications.map((c) => c.label).join("; ")}`,
        );
      }
      if (outcome.workPackage.requiredRegions.length > 0) {
        console.log(`regions: ${outcome.workPackage.requiredRegions.join(", ")}`);
      }
      if (outcome.workPackage.estimatedValueCeilingInr !== null) {
        console.log(`value ceiling: ₹${outcome.workPackage.estimatedValueCeilingInr.toLocaleString("en-IN")}`);
      }

      console.log("");
      console.log("  RECOMMENDED");
      for (const [index, ranked] of outcome.recommendations.entries()) {
        const dims = ranked.dimensions
          .map((d) => `${d.key.slice(0, 4)}=${String(d.score).padStart(3)}`)
          .join(" ");
        console.log(
          `  #${index + 1} ${String(ranked.overallScore).padStart(3)} [${ranked.band.padEnd(8)}] ` +
            `${(ranked.vendor.legalName ?? ranked.vendor.organizationName).slice(0, 46).padEnd(46)} ` +
            `${ranked.retrieval.sources.join("+").padEnd(16)} ${dims}`,
        );
        if (ranked.evidence.strengths[0] !== undefined) {
          console.log(`       + ${ranked.evidence.strengths[0]}`);
        }
      }

      if (outcome.excluded.length > 0) {
        console.log("");
        console.log("  EXCLUDED");
        for (const ranked of outcome.excluded) {
          console.log(
            `  --  ${String(ranked.overallScore).padStart(3)}          ` +
              `${(ranked.vendor.legalName ?? ranked.vendor.organizationName).slice(0, 46).padEnd(46)} ` +
              `${ranked.retrieval.sources.join("+")}`,
          );
          for (const failed of ranked.eligibility.failedChecks) {
            console.log(`       x ${failed.label} — ${failed.evidence}`);
          }
        }
      }
    } catch (error) {
      console.log(`  REFUSED: ${(error as Error).message}`);
    }
  }
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
