/**
 * Extended Playwright test fixture that injects a pre-authenticated page for
 * each persona. Import `test` from here instead of `@playwright/test`.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/base.js";
 *
 *   test("super admin sees Stores nav", async ({ asSuperAdmin }) => {
 *     await asSuperAdmin.goto("/super/stores");
 *     await expect(asSuperAdmin.getByRole("heading", { name: "Stores" })).toBeVisible();
 *   });
 */
import { test as base, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAS, type PersonaKey } from "./personas.js";
import { authFile } from "./auth-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type PersonaFixtures = {
  [K in PersonaKey as `as${Capitalize<K>}`]: Page;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const test = base.extend<PersonaFixtures>(
  Object.fromEntries(
    (Object.entries(PERSONAS) as [PersonaKey, (typeof PERSONAS)[PersonaKey]][]).map(
      ([key, persona]) => [
        `as${capitalize(key)}`,
        async ({ browser }: { browser: import("@playwright/test").Browser }, use: (p: Page) => Promise<void>) => {
          const ctx = await browser.newContext({
            storageState: authFile(persona.key),
          });
          const page = await ctx.newPage();
          await use(page);
          await ctx.close();
        },
      ],
    ),
  ) as Parameters<typeof base.extend<PersonaFixtures>>[0],
);

export { expect } from "@playwright/test";
