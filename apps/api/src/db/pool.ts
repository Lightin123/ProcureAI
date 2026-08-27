import pg from "pg";

import { loadConfig } from "../config/env.js";
import { ApiError } from "../middleware/errors.js";

let pool: pg.Pool | undefined;

export function isDatabaseConfigured(): boolean {
  return loadConfig().databaseUrl !== undefined;
}

export function getPool(): pg.Pool {
  if (pool === undefined) {
    const config = loadConfig();

    if (config.databaseUrl === undefined) {
      throw new ApiError(
        503,
        "DATABASE_NOT_CONFIGURED",
        "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and set the connection string.",
      );
    }

    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return pool;
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[]);
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
    pool = undefined;
  }
}
