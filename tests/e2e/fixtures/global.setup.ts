/**
 * Global setup — runs once before all tests.
 * Logs in as each persona and saves the session storageState to disk so
 * individual tests can load it without re-authenticating.
 *
 * Playwright runs this as the "setup" project (see playwright.config.ts).
 */
import { test as setup, expect, request } from "@playwright/test";
import { createHmac } from "node:crypto";
import { PERSONAS, type Persona } from "./personas.js";
import { authFile } from "./auth-state.js";

const TEST_LOGIN_HMAC_CONTEXT = "daybook-development-browser-test-login:v1";
const developmentBrowserCheck = process.env["NODE_ENV"] === "development";

function developmentTestLoginHeaders(): Record<string, string> {
  if (!developmentBrowserCheck) return {};

  const sessionSecret = process.env["SESSION_SECRET"];
  if (!sessionSecret) {
    throw new Error(
      "SESSION_SECRET is required to run the development browser check. " +
      "The raw secret stays local; the test sends only a derived HMAC token.",
    );
  }

  return {
    "x-daybook-test-login-token": createHmac("sha256", sessionSecret)
      .update(TEST_LOGIN_HMAC_CONTEXT)
      .digest("base64url"),
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

async function loginPersona(
  persona: Persona,
  baseURL: string,
): Promise<void> {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/auth/test-login", {
    data: { email: persona.email },
    headers: developmentTestLoginHeaders(),
  });
  expect(res.status(), `test-login failed for ${persona.email}`).toBe(200);
  // Save cookies from this API context to disk
  await ctx.storageState({ path: authFile(persona.key) });
  await ctx.dispose();
}

// ── Setup tests ──────────────────────────────────────────────────────────────
//
// Hosted browser checks use the normal development workflow. Its HMAC-protected
// login accepts only the seeded super-admin, so don't ask it to create sessions
// for other CI personas. Full persona coverage remains enabled for NODE_ENV=test.
const personasToAuthenticate = developmentBrowserCheck
  ? [PERSONAS.superAdmin]
  : Object.values(PERSONAS);

for (const persona of personasToAuthenticate) {
  setup(`authenticate: ${persona.key}`, async ({ baseURL }) => {
    await loginPersona(persona, baseURL!);
  });
}
