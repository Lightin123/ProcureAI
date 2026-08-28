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

/**
 * Runs a unit of work on one connection inside a transaction. Vendor
 * registration creates an organization, a user and a capability profile
 * together; a partial success there would leave an account that cannot sign in
 * anywhere useful.
 */
export async function withTransaction<T>(
  work: (execute: <R extends pg.QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ) => Promise<pg.QueryResult<R>>) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await work((text, params = []) =>
      client.query(text, params as unknown[]),
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
