#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql in filename order.
 *
 * This is the ONLY code in the repo that touches DATABASE_URL, and it never
 * runs as part of the app or the build -- it is a developer command. The
 * running application reaches Postgres exclusively through the Data API, as
 * the signed-in user, with RLS enforced.
 *
 *   npm run db:migrate
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const migrationsDir = join(repoRoot, "db", "migrations");

// `neon deploy` writes .env.local. A bare `import "dotenv/config"` only reads
// .env, so load both explicitly, .env.local first (dotenv keeps the first value
// it sees for a key, so .env.local wins).
loadEnv({ path: [join(repoRoot, ".env.local"), join(repoRoot, ".env")], quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "\nDATABASE_URL is not set.\n\n" +
      "Copy .env.example to .env.local and add your Neon connection string,\n" +
      "or run `neon deploy` to have the CLI write it for you.\n",
  );
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`No .sql files found in ${migrationsDir}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  console.log(`Connected. Applying ${files.length} migration(s).\n`);

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    process.stdout.write(`  ${file} ... `);
    // Each migration runs in its own transaction, so a failure leaves the
    // database on the last good migration rather than half-applied.
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log("ok");
    } catch (error) {
      await client.query("rollback");
      console.log("failed");
      throw error;
    }
  }

  // Report back what actually landed, so the run is self-verifying.
  const { rows: policies } = await client.query(
    `select policyname, cmd
       from pg_policies
      where schemaname = 'public' and tablename = 'contacts'
      order by cmd, policyname`,
  );
  const { rows: rls } = await client.query(
    `select relrowsecurity, relforcerowsecurity
       from pg_class
      where oid = 'public.contacts'::regclass`,
  );

  console.log("\nRow Level Security on public.contacts:");
  console.log(`  enabled: ${rls[0]?.relrowsecurity}   forced: ${rls[0]?.relforcerowsecurity}`);
  console.log(`\nPolicies (${policies.length}):`);
  for (const p of policies) {
    console.log(`  ${String(p.cmd).padEnd(7)} ${p.policyname}`);
  }
  console.log("\nDone.");
} catch (error) {
  console.error("\nMigration failed:\n", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
