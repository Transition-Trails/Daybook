/**
 * Vitest configuration for the slow PDF link-survival test suite.
 * Run via:  pnpm --filter @workspace/api-server run test:links
 *
 * This config is intentionally separate from vitest.config.ts so the
 * default fast `pnpm test` run never picks up this file.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals:      true,
    environment:  "node",
    testTimeout:  180_000,   // individual tests can take up to 3 min
    hookTimeout:  300_000,   // beforeAll generates 5 real PDFs
    pool:         "forks",
    singleThread: true,
    reporters:    ["verbose"],
    include:      ["src/test/pdf-link-survival.test.ts"],
  },
});
