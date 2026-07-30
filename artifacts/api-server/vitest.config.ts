import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    singleThread: true,
    reporters: ["verbose"],
    // Exclude the slow link-survival suite from the default fast run.
    // Run it explicitly with:  pnpm --filter @workspace/api-server run test:links
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/pdf-link-survival.test.ts",
    ],
  },
});
