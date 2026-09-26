import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_MIGRATION_URL ??
      "postgresql://cercle_migrator:local-migrator-only@127.0.0.1:5432/cercle_complet",
  },
});
