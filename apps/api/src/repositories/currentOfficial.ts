import { SEEDED_OFFICIAL } from "../config/seedIdentity.js";
import { query } from "../db/pool.js";
import { ApiError } from "../middleware/errors.js";

export interface CurrentOfficial {
  id: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
}

export async function getCurrentOfficial(): Promise<CurrentOfficial> {
  const result = await query<{
    id: string;
    full_name: string;
    organization_id: string;
    organization_name: string;
  }>(
    `SELECT u.id, u.full_name, u.organization_id, o.name AS organization_name
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.email = $1`,
    [SEEDED_OFFICIAL.email],
  );

  const row = result.rows[0];
  if (row === undefined) {
    throw new ApiError(
      500,
      "SEED_DATA_MISSING",
      "The seeded official was not found. Run `npm run seed` in apps/api.",
    );
  }

  return {
    id: row.id,
    fullName: row.full_name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
  };
}
