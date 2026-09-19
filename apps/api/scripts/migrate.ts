import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../src/config/env.js";
import { closePool, getPool } from "../src/db/pool.js";

/**
 * The SQL files are not compiled, so they sit next to the sources in
 * development and next to `dist/` once built. Resolving both layouts keeps one
 * copy of every migration rather than copying them into the build output, where
 * they could silently go stale.
 */
function resolveMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../migrations"), // scripts/ -> apps/api/migrations
    path.resolve(here, "../../migrations"), // dist/scripts/ -> apps/api/migrations
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`No migrations directory found. Looked in: ${candidates.join(", ")}`);
  }

  return found;
}

const migrationsDir = resolveMigrationsDir();

/**
 * Serialises migration runs across processes.
 *
 * A platform that can start several API instances, or a pre-deploy command
 * running while an old instance is still up, can invoke this concurrently. The
 * `schema_migrations` primary key would make the loser fail rather than corrupt
 * anything, but a failed deploy on a harmless race is still a failed deploy, so
 * the second runner waits and then finds nothing left to do.
 *
 * Session-scoped, so it is released if the process dies holding it.
 */
const MIGRATION_LOCK_ID = 4_872_301_990_112n;

async function ensureMigrationsTable(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await getPool().query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function run(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  let appliedCount = 0;

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`skip    ${filename} (already applied)`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, filename), "utf8");
    const client = await getPool().connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      console.log(`applied ${filename}`);
      appliedCount += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${filename} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  console.log(
    appliedCount === 0
      ? "Database is up to date; no migrations applied."
      : `Applied ${appliedCount} migration(s).`,
  );
}

/**
 * Whether the connection goes through a transaction-mode connection pooler.
 *
 * PgBouncer hands each transaction whichever backend is free, so a
 * session-scoped advisory lock taken in one statement may be released against a
 * different backend — leaving the lock held until that connection closes, and
 * the next run blocking on it forever. Neon's pooled endpoint is the common
 * case; its direct endpoint has no `-pooler` in the host.
 *
 * Detected rather than configured, because the failure it prevents is a silent
 * hang at start-up, which is the hardest kind to diagnose.
 */
function usesTransactionPooler(): boolean {
  if (process.env.MIGRATE_SKIP_ADVISORY_LOCK === "true") {
    return true;
  }

  const url = loadConfig().databaseUrl;
  if (url === undefined) {
    return false;
  }

  try {
    return new URL(url).hostname.includes("-pooler");
  } catch {
    return false;
  }
}

async function runExclusively(): Promise<void> {
  if (usesTransactionPooler()) {
    // Safe to proceed without it: `schema_migrations` has the filename as its
    // primary key, so a concurrent run loses the insert and rolls its
    // transaction back rather than applying anything twice. The lock only makes
    // that case tidy; it is not what protects the schema.
    console.log(
      "Connection uses a transaction pooler; skipping the advisory lock. " +
        "Use the direct (non-pooled) connection string if migrations must be " +
        "serialised across concurrent runners.",
    );
    await run();
    return;
  }

  const lockHolder = await getPool().connect();

  try {
    const acquired = await lockHolder.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [MIGRATION_LOCK_ID.toString()],
    );

    if (acquired.rows[0]?.locked !== true) {
      console.log("Another migration run holds the lock; waiting for it to finish.");
      await lockHolder.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID.toString()]);
    }

    try {
      await run();
    } finally {
      await lockHolder.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID.toString()]);
    }
  } finally {
    lockHolder.release();
  }
}

runExclusively()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error((error as Error).message);
    await closePool();
    process.exit(1);
  });
