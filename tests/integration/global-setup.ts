import { loadRootEnv } from "@cercle/database";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

function quoteIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error("Nom de base refusé.");
  }
  return `"${value}"`;
}

export default async function setup(): Promise<void> {
  loadRootEnv();
  const adminUrl = process.env.POSTGRES_ADMIN_URL;
  const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
  if (!adminUrl || !migrationUrl) {
    throw new Error("POSTGRES_ADMIN_URL et TEST_DATABASE_MIGRATION_URL sont requis.");
  }
  const databaseName = new URL(migrationUrl).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test") || !["127.0.0.1", "localhost"].includes(new URL(adminUrl).hostname)) {
    throw new Error("Le rejeu d’intégration refuse une cible qui n’est pas une base locale de test.");
  }
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [
    databaseName,
  ]);
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)}`);
  await admin.query(`CREATE DATABASE ${quoteIdent(databaseName)} OWNER cercle_migrator`);
  await admin.query(`GRANT CONNECT ON DATABASE ${quoteIdent(databaseName)} TO cercle_app`);
  await admin.end();
  const owner = new Client({ connectionString: migrationUrl });
  await owner.connect();
  await owner.query("ALTER SCHEMA public OWNER TO cercle_migrator");
  await owner.query("GRANT USAGE ON SCHEMA public TO cercle_app");
  await owner.end();
  await execFileAsync("pnpm", ["--filter", "@cercle/database", "exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_MIGRATION_URL: migrationUrl },
    shell: true,
  });
}
