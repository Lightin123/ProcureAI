/**
 * Puts one work package into the Milestone 7 engagement state, so the shortlist,
 * the invitation and the supplier's unread notification are all visible on a
 * freshly seeded database without anyone having to click through the flow first.
 *
 * A development tool, not part of the application, and deliberately not part of
 * `npm run seed`: shortlisting and inviting are procurement acts, and the seed
 * script's job is to install the data those acts are performed *on*, not to
 * perform them. Keeping it separate also leaves the seeded packages clean for a
 * live demonstration.
 *
 *   npx tsx scripts/engagementDemo.ts          # WP-04 by default
 *   npx tsx scripts/engagementDemo.ts WP-01
 *
 * Everything it does goes through the same repository functions the API uses,
 * so the rows it leaves behind are exactly the rows an official's clicks would
 * have produced — including the eligibility gate, which will refuse a supplier
 * here for the same reason it would refuse one in the portal.
 *
 * Idempotent: re-running finds the existing shortlist entry and the existing
 * open invitation and leaves both alone.
 */

import { loadConfig } from "../src/config/env.js";
import { closePool, query } from "../src/db/pool.js";
import { runMatching } from "../src/matching/pipeline.js";
import { loadStoredRecommendations } from "../src/matching/presentation.js";
import { createNotification } from "../src/repositories/vendorNotifications.js";
import { recordWorkPackageHistory } from "../src/repositories/workPackageHistory.js";
import {
  createInvitation,
  findOpenInvitation,
} from "../src/repositories/workPackageInvitations.js";
import {
  addToShortlist,
  findLatestMatchRun,
  listShortlist,
} from "../src/repositories/workPackageMatching.js";

const DEFAULT_PACKAGE = "WP-04";

function dateInDays(days: number): string {
  const target = new Date(Date.now() + days * 86_400_000);
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${month}-${day}`;
}

/** Matches the wording the API's own invitation notification uses. */
function readableDay(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || day === undefined) return isoDay;
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function main(): Promise<void> {
  loadConfig();

  const packageNumber = process.argv[2] ?? DEFAULT_PACKAGE;

  const target = await query<{
    id: string;
    project_id: string;
    package_number: string;
    title: string;
    status: string;
    project_title: string;
    organization_id: string;
    organization_name: string;
    official_id: string;
  }>(
    `SELECT wp.id, wp.project_id, wp.package_number, wp.title, wp.status::text,
            pr.title AS project_title, pr.organization_id, o.name AS organization_name,
            pr.created_by AS official_id
     FROM work_packages wp
     JOIN procurement_projects pr ON pr.id = wp.project_id
     JOIN organizations o ON o.id = pr.organization_id
     WHERE pr.reference_number = 'PRJ-2026-0201'
       AND wp.package_number = $1
       AND wp.is_deleted = false`,
    [packageNumber],
  );

  const row = target.rows[0];
  if (row === undefined) {
    throw new Error(
      `${packageNumber} was not found in PRJ-2026-0201. Run \`npm run seed\` first.`,
    );
  }

  if (row.status !== "CONFIRMED") {
    throw new Error(
      `${packageNumber} is ${row.status}. Only a confirmed work package can be engaged, which ` +
        "is the same rule the API applies.",
    );
  }

  console.log(`${row.package_number}  ${row.title}`);
  console.log(`department: ${row.organization_name}`);
  console.log("");

  // ---- Ranked recommendations --------------------------------------------

  let run = await findLatestMatchRun(row.id);
  if (run === undefined) {
    console.log("no stored ranking — running the matching pipeline");
    await runMatching({
      workPackageId: row.id,
      organizationId: row.organization_id,
      userId: row.official_id,
    });
    run = await findLatestMatchRun(row.id);
  }

  if (run === undefined) {
    throw new Error("The matching pipeline produced no run.");
  }

  const stored = await loadStoredRecommendations(run.runId);
  console.log(
    `ranking: ${stored.recommendations.length} eligible, ${stored.excluded.length} excluded ` +
      `(${run.semanticEnabled ? run.embeddingModel : "lexical only"})`,
  );

  const top = stored.recommendations[0];
  if (top === undefined) {
    console.log("");
    console.log(
      "No supplier satisfied this package's mandatory conditions, so there is nothing to " +
        "shortlist. That is a correct outcome, not a failure — try another package.",
    );
    return;
  }

  const supplierName = top.vendor.legalName ?? top.vendor.organizationName;

  // ---- Shortlist ----------------------------------------------------------

  const already = (await listShortlist(row.id)).find(
    (entry) => entry.vendorProfileId === top.vendor.vendorProfileId,
  );

  if (already === undefined) {
    const reason =
      `Ranked #${top.rank} at ${top.overallScore}/100 with ` +
      `${top.eligibility.passedChecks.length} mandatory check(s) passed. ` +
      (top.evidence.strengths[0] ?? "Capability profile covers the stated scope.");

    const { created, refusedBecause } = await addToShortlist({
      workPackageId: row.id,
      vendorProfileId: top.vendor.vendorProfileId,
      reason,
      addedBy: row.official_id,
    });

    if (!created) {
      throw new Error(`The shortlist refused ${supplierName}: ${refusedBecause}`);
    }

    await recordWorkPackageHistory(
      row.project_id,
      row.id,
      row.official_id,
      "SHORTLISTED",
      null,
      {
        vendorProfileId: top.vendor.vendorProfileId,
        organizationName: top.vendor.organizationName,
        rankAtShortlist: top.rank,
        scoreAtShortlist: top.overallScore,
      },
      reason,
    );

    console.log(`shortlisted: ${supplierName} (#${top.rank}, ${top.overallScore}/100)`);
  } else {
    console.log(`shortlisted: ${supplierName} — already on the shortlist`);
  }

  // ---- Invitation ---------------------------------------------------------

  const open = await findOpenInvitation(row.id, top.vendor.vendorProfileId);
  if (open !== undefined) {
    console.log(`invitation:  already ${open.status.toLowerCase()} — nothing to issue`);
    console.log("");
    console.log(`Sign in as the supplier and open /vendor/invitations/${open.id}`);
    return;
  }

  const responseDeadline = dateInDays(21);
  const message =
    `Your organisation has been shortlisted for ${row.package_number}. Please confirm ` +
    "whether you are able to take on this work package within the stated scope and timeline, " +
    "and note any constraint the department should know about.";

  const { invitation, refusedBecause } = await createInvitation({
    workPackageId: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    vendorProfileId: top.vendor.vendorProfileId,
    message,
    responseDeadline,
    invitedBy: row.official_id,
  });

  if (invitation === undefined) {
    throw new Error(`The invitation was refused: ${refusedBecause}`);
  }

  await createNotification({
    profileId: top.vendor.vendorProfileId,
    category: "INVITATION",
    title: "New procurement invitation",
    body:
      "Your organisation has been invited to respond to " +
      `${row.package_number} - ${row.title}, part of ${row.project_title}, ` +
      `issued by ${row.organization_name}. A response is requested by ${readableDay(responseDeadline)}.`,
    linkPath: `/vendor/invitations/${invitation.id}`,
    invitationId: invitation.id,
  });

  await recordWorkPackageHistory(
    row.project_id,
    row.id,
    row.official_id,
    "INVITED",
    null,
    {
      invitationId: invitation.id,
      vendorProfileId: invitation.vendorProfileId,
      organizationName: invitation.organizationName,
      responseDeadline: invitation.responseDeadline,
    },
    message,
  );

  console.log(`invited:     ${supplierName}, response requested by ${responseDeadline}`);
  console.log(`notified:    one unread notification for ${top.vendor.organizationName}`);
  console.log("");
  console.log("The invitation is open and unanswered, so the supplier side of the");
  console.log("demonstration — the bell, the invitation, accept or decline — is still to run.");
  console.log(`  /vendor/invitations/${invitation.id}`);
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error((error as Error).message);
    await closePool();
    process.exit(1);
  });
