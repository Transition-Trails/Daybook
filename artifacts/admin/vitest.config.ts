import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // The full admin suite runs alongside API validation in task completion.
    // A few jsdom-heavy integration tests can exceed Vitest's five-second
    // default under that shared CPU load without indicating a product failure.
    testTimeout: 15_000,
    // Keep jsdom files serial when the API suite is running in parallel. This
    // avoids CPU-starved waitFor/findBy* assertions without weakening them.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
