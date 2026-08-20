import { defineConfig, devices } from "@playwright/test";

/**
 * Base URL resolution order:
 *   1. PLAYWRIGHT_BASE_URL env var  (set in CI to point at the running server,
 *      or set manually to test against a staging deployment)
 *   2. http://localhost:3001        (default for local dev where the API server
 *      also serves the admin SPA via SERVE_ADMIN_DIST)
 *
 * To run locally:
 *   PORT=3001 NODE_ENV=test SERVE_ADMIN_DIST=artifacts/admin/dist/public \
 *     node --enable-source-maps artifacts/api-server/dist/index.mjs &
 *   pnpm --filter @workspace/e2e run test
 *
 * Hosted browser checks use the normal development workflow. The focused
 * script seeds the deterministic CI fixtures, derives a one-way HMAC from the
 * server's SESSION_SECRET, and authenticates only the seeded super-admin.
 * The raw secret never reaches browser code. Run the focused browser journey:
 *
 *   pnpm --filter @workspace/e2e run test:development-browser
 */
const baseURL = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,   // tests share DB state; keep sequential by default
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: process.env["CI"]
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "on-failure" }]],

  use: {
    baseURL,
    // All tests use session cookies — credentials are handled per-fixture
    storageState: undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Reasonable timeout for a full-stack app
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    // ── Setup project — runs before all tests ─────────────────────────────
    {
      name: "setup",
      testMatch: "**/fixtures/global.setup.ts",
    },

    // ── Smoke tests (Chromium only, fast) ────────────────────────────────
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  outputDir: "test-results",
});
