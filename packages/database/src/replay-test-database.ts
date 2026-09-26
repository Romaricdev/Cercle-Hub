import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

function loadExample(name: string): string {
  const path = resolve(import.meta.dirname, "../../../.env.example");
  const text = readFileSync(path, "utf8");
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  if (!line) {
    throw new Error(`Variable ${name} absente de .env.example.`);
  }
  return line.slice(name.length + 1);
}

function quoteIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error("Nom de base refusé.");
  }
  return `"${value}"`;
}

const adminUrl = process.env.POSTGRES_ADMIN_URL ?? loadExample("POSTGRES_ADMIN_URL");
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL ?? loadExample("TEST_DATABASE_MIGRATION_URL");
const databaseName = new URL(migrationUrl).pathname.replace(/^\//, "");
if (!databaseName.endsWith("_test")) {
  throw new Error("Le rejeu ne vise qu’une base de test.");
}
if (!["127.0.0.1", "localhost"].includes(new URL(adminUrl).hostname)) {
  throw new Error("Le rejeu refuse un hôte non local.");
}

const admin = new Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
  [databaseName],
);
await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)}`);
await admin.query(`CREATE DATABASE ${quoteIdent(databaseName)} OWNER cercle_migrator`);
await admin.end();
console.log(`Base vide recréée : ${databaseName}`);
