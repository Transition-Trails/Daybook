import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    singleFork: true,
    // Integration suites use one shared development database and several
    // clean up rows for seeded actors. Fork-level serialization prevents one
    // suite's cleanup from racing another suite's assertions.
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
