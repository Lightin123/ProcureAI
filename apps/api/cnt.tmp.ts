import { closePool, query } from "./src/db/pool.js";
const r = await query<Record<string,string>>(
 `SELECT (SELECT COUNT(*)::text FROM procurement_projects) AS projects,
         (SELECT COUNT(*)::text FROM work_packages) AS wps,
         (SELECT COUNT(*)::text FROM project_requirements) AS reqs,
         (SELECT COUNT(*)::text FROM work_package_shortlist) AS shortlist,
         (SELECT COUNT(*)::text FROM work_package_invitations) AS invitations,
         (SELECT COUNT(*)::text FROM work_package_responses) AS responses,
         (SELECT COUNT(*)::text FROM work_package_match_runs) AS runs,
         (SELECT COUNT(*)::text FROM vendor_notifications WHERE category='INVITATION') AS invite_notifs`);
const x = r.rows[0]!;
process.stdout.write(`projects=${x.projects} wps=${x.wps} reqs=${x.reqs} shortlist=${x.shortlist} invitations=${x.invitations} responses=${x.responses} runs=${x.runs} inviteNotifs=${x.invite_notifs}\n`);
await closePool();
