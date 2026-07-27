/**
 * Global setup — runs once before all tests.
 * Logs in as each persona and saves the session storageState to disk so
 * individual tests can load it without re-authenticating.
 *
 * Playwright runs this as the "setup" project (see playwright.config.ts).
 */
import { test as setup, expect, request } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAS, type Persona } from "./personas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(__dirname, ".auth");

/** Path where the storageState for a persona is saved. */
export function authFile(key: string): string {
  return path.join(AUTH_DIR, `${key}.json`);
}

// ── Helper ───────────────────────────────────────────────────────────────────

async function loginPersona(
  persona: Persona,
  baseURL: string,
): Promise<void> {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/auth/test-login", {
    data: { email: persona.email },
  });
  expect(res.status(), `test-login failed for ${persona.email}`).toBe(200);
  // Save cookies from this API context to disk
  await ctx.storageState({ path: authFile(persona.key) });
  await ctx.dispose();
}

// ── Setup tests ──────────────────────────────────────────────────────────────

for (const persona of Object.values(PERSONAS)) {
  setup(`authenticate: ${persona.key}`, async ({ baseURL }) => {
    await loginPersona(persona, baseURL!);
  });
}
