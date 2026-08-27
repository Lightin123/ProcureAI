import { SEEDED_OFFICIAL, SEEDED_ORGANIZATION } from "../src/config/seedIdentity.js";
import { closePool, query } from "../src/db/pool.js";

async function run(): Promise<void> {
  const organization = await query<{ id: string }>(
    `INSERT INTO organizations (code, name)
     VALUES ($1, $2)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [SEEDED_ORGANIZATION.code, SEEDED_ORGANIZATION.name],
  );

  const organizationId = organization.rows[0]?.id;
  if (organizationId === undefined) {
    throw new Error("Failed to seed organization.");
  }

  const official = await query<{ id: string }>(
    `INSERT INTO users (email, full_name, role, organization_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role
     RETURNING id`,
    [SEEDED_OFFICIAL.email, SEEDED_OFFICIAL.fullName, SEEDED_OFFICIAL.role, organizationId],
  );

  const officialId = official.rows[0]?.id;
  if (officialId === undefined) {
    throw new Error("Failed to seed official.");
  }

  console.log(`Seeded organization ${SEEDED_ORGANIZATION.code} (${organizationId})`);
  console.log(`Seeded official ${SEEDED_OFFICIAL.email} (${officialId})`);
}

run()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error((error as Error).message);
    await closePool();
    process.exit(1);
  });
