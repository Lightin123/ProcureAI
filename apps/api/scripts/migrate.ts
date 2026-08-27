import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closePool, getPool } from "../src/db/pool.js";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

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

run()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error((error as Error).message);
    await closePool();
    process.exit(1);
  });
