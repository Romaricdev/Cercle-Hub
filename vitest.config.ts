import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/contracts/vitest.config.ts", "apps/api/vitest.config.ts", "apps/web/vitest.config.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
  },
});
