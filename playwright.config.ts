import { loadRootEnv } from "@cercle/database";
import { defineConfig, devices } from "@playwright/test";

loadRootEnv();

const testDatabaseUrl = "postgresql://cercle_app:local-app-only@127.0.0.1:5432/cercle_complet_test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  // Les scénarios modifient des identités, affectations et secrets MFA partagés :
  // l’exécution séquentielle garantit l’isolation transactionnelle des fixtures.
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @cercle/api start",
      url: "http://127.0.0.1:4311/api/v1/health/live",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: testDatabaseUrl,
        PUBLIC_ORIGIN: "http://127.0.0.1:8080",
        WEB_ORIGIN: "http://127.0.0.1:8080",
        API_PORT: "4311",
      },
    },
    {
      command: "pnpm --filter @cercle/web start",
      url: "http://127.0.0.1:4310/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
