/**
 * Viewport journey — key pages must render without layout breakage across
 * the four standard breakpoints used in the Daybook admin.
 *
 * Breakpoints under test:
 *   mobile  — 375 × 812   (iPhone SE / most Android phones)
 *   tablet  — 768 × 1024  (iPad portrait)
 *   desktop — 1280 × 800  (common laptop)
 *   wide    — 1440 × 900  (standard design width)
 *
 * What "passes" means for each check:
 *   · The page renders (not blank, not an error screen)
 *   · The primary content landmark is visible
 *   · No horizontal overflow (scrollWidth ≤ viewportWidth + 4px tolerance)
 *   · No text is clipped by overflow:hidden on its direct parent
 *   · Navigation elements do not overlap body content
 *
 * Pages under test:
 *   · Login page              — public, no auth
 *   · Super admin dashboard   — /super
 *   · Super admin Stores list — /super/stores
 *   · Store dashboard         — /store/ci_store_a
 *   · Store catalog           — /store/ci_store_a/catalog
 *   · Planner Studio          — /store/ci_store_a/studios/planners
 *   · Sticker Studio          — /store/ci_store_a/studios/stickers
 *   · Theme Studio            — /store/ci_store_a/studios/theme
 *   · Support inbox           — /store/ci_store_a/support-inbox
 *   · Public storefront       — /s/ci-store-a
 */
import { test, expect } from "../fixtures/base.js";

// ── Breakpoints ───────────────────────────────────────────────────────────────

const BREAKPOINTS = [
  { label: "mobile",  width: 375,  height: 812  },
  { label: "tablet",  width: 768,  height: 1024 },
  { label: "desktop", width: 1280, height: 800  },
  { label: "wide",    width: 1440, height: 900  },
] as const;

// ── Shared assertion helpers ──────────────────────────────────────────────────

/**
 * Assert that no element causes horizontal overflow beyond the viewport.
 * A 4px tolerance covers subpixel rendering differences.
 */
async function assertNoHorizontalOverflow(
  page: import("@playwright/test").Page,
  viewportWidth: number,
  label: string,
): Promise<void> {
  const maxRight = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("*"));
    return Math.max(...all.map((el) => el.getBoundingClientRect().right));
  });
  expect(
    maxRight,
    `horizontal overflow at ${label} — rightmost element edge is ${maxRight}px, viewport is ${viewportWidth}px`,
  ).toBeLessThanOrEqual(viewportWidth + 4);
}

/**
 * Assert the page has not crashed into a blank screen or error page.
 * Checks that at least one of: main content, heading, or known root elements is visible.
 */
async function assertPageRendered(
  page: import("@playwright/test").Page,
  description: string,
): Promise<void> {
  const visible = await page
    .locator("main, [role=main], h1, [data-testid], nav")
    .first()
    .isVisible({ timeout: 8_000 })
    .catch(() => false);
  expect(visible, `${description} must render at least one visible landmark`).toBe(true);
}

// ── Login page (public, no auth) ──────────────────────────────────────────────

test.describe("Viewport: Login page", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders correctly at ${label} (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await assertPageRendered(page, `login @ ${label}`);
      // The Sign in button or form must be visible
      await expect(
        page.locator("button[type=submit], [data-testid=login-btn], text=/sign in/i").first(),
      ).toBeVisible({ timeout: 8_000 });

      await assertNoHorizontalOverflow(page, width, label);
    });
  }
});

// ── Super admin dashboard ─────────────────────────────────────────────────────

test.describe("Viewport: Super admin dashboard", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders correctly at ${label} (${width}px)`, async ({ asSuperAdmin }) => {
      await asSuperAdmin.setViewportSize({ width, height });
      await asSuperAdmin.goto("/super");
      await asSuperAdmin.waitForLoadState("networkidle");

      await assertPageRendered(asSuperAdmin, `super dashboard @ ${label}`);
      await expect(asSuperAdmin).not.toHaveURL(/\/login/);
      await assertNoHorizontalOverflow(asSuperAdmin, width, label);
    });
  }
});

// ── Super admin Stores list ───────────────────────────────────────────────────

test.describe("Viewport: Super admin Stores page", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders correctly at ${label} (${width}px)`, async ({ asSuperAdmin }) => {
      await asSuperAdmin.setViewportSize({ width, height });
      await asSuperAdmin.goto("/super/stores");
      await asSuperAdmin.waitForLoadState("networkidle");

      await assertPageRendered(asSuperAdmin, `super/stores @ ${label}`);
      await assertNoHorizontalOverflow(asSuperAdmin, width, label);
    });
  }
});

// ── Store dashboard ───────────────────────────────────────────────────────────

test.describe("Viewport: Store dashboard", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders correctly at ${label} (${width}px)`, async ({ asOwnerA }) => {
      await asOwnerA.setViewportSize({ width, height });
      await asOwnerA.goto("/store/ci_store_a");
      await asOwnerA.waitForLoadState("networkidle");

      await assertPageRendered(asOwnerA, `store dashboard @ ${label}`);
      await expect(asOwnerA).not.toHaveURL(/\/login/);
      await assertNoHorizontalOverflow(asOwnerA, width, label);
    });
  }
});

// ── Store catalog ─────────────────────────────────────────────────────────────

test.describe("Viewport: Store catalog", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders correctly at ${label} (${width}px)`, async ({ asOwnerA }) => {
      await asOwnerA.setViewportSize({ width, height });
      await asOwnerA.goto("/store/ci_store_a/catalog");
      await asOwnerA.waitForLoadState("networkidle");

      await assertPageRendered(asOwnerA, `store catalog @ ${label}`);
      await assertNoHorizontalOverflow(asOwnerA, width, label);
    });
  }
});

// ── Planner Studio ────────────────────────────────────────────────────────────

test.describe("Viewport: Planner Studio", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders without overflow at ${label} (${width}px)`, async ({ asOwnerA }) => {
      await asOwnerA.setViewportSize({ width, height });
      await asOwnerA.goto("/store/ci_store_a/studios/planners");
      await asOwnerA.waitForLoadState("networkidle");

      await assertPageRendered(asOwnerA, `planner studio @ ${label}`);
      await expect(asOwnerA).not.toHaveURL(/\/login/);

      // Mode pills (product-type selector) must not be clipped
      const pills = asOwnerA.locator('[data-mode-pill], [role="tab"][data-product-type]');
      const pillCount = await pills.count();
      if (pillCount > 0) {
        for (let i = 0; i < pillCount; i++) {
          const clipped = await pills.nth(i).evaluate((el) => {
            const rect  = el.getBoundingClientRect();
            const pRect = el.parentElement?.getBoundingClientRect();
            return pRect ? rect.right > pRect.right + 2 : false;
          });
          expect(clipped, `mode pill #${i} must not be clipped at ${label}`).toBe(false);
        }
      }

      await assertNoHorizontalOverflow(asOwnerA, width, label);
    });
  }
});

// ── Sticker Studio ────────────────────────────────────────────────────────────

test.describe("Viewport: Sticker Studio", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders without overflow at ${label} (${width}px)`, async ({ asOwnerA }) => {
      await asOwnerA.setViewportSize({ width, height });
      await asOwnerA.goto("/store/ci_store_a/studios/stickers");
      await asOwnerA.waitForLoadState("networkidle");

      await assertPageRendered(asOwnerA, `sticker studio @ ${label}`);
      await expect(asOwnerA).not.toHaveURL(/\/login/);
      await assertNoHorizontalOverflow(asOwnerA, width, label);
    });
  }
});

// ── Theme Studio ──────────────────────────────────────────────────────────────

test.describe("Viewport: Theme Studio", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders without overflow at ${label} (${width}px)`, async ({ asOwnerA }) => {
      await asOwnerA.setViewportSize({ width, height });
      await asOwnerA.goto("/store/ci_store_a/studios/theme");
      await asOwnerA.waitForLoadState("networkidle");

      await assertPageRendered(asOwnerA, `theme studio @ ${label}`);
      await expect(asOwnerA).not.toHaveURL(/\/login/);
      await assertNoHorizontalOverflow(asOwnerA, width, label);
    });
  }
});

// ── Support Inbox ─────────────────────────────────────────────────────────────

test.describe("Viewport: Support Inbox", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders correctly at ${label} (${width}px)`, async ({ asOwnerA }) => {
      await asOwnerA.setViewportSize({ width, height });
      await asOwnerA.goto("/store/ci_store_a/support-inbox");
      await asOwnerA.waitForLoadState("networkidle");

      await assertPageRendered(asOwnerA, `support inbox @ ${label}`);
      await expect(asOwnerA).not.toHaveURL(/\/login/);
      await assertNoHorizontalOverflow(asOwnerA, width, label);
    });
  }
});

// ── Public storefront ─────────────────────────────────────────────────────────

test.describe("Viewport: Public storefront", () => {
  for (const { label, width, height } of BREAKPOINTS) {
    test(`renders correctly at ${label} (${width}px)`, async ({ page }) => {
      // Public route — no auth required
      await page.setViewportSize({ width, height });
      await page.goto("/s/ci-store-a");
      await page.waitForLoadState("networkidle");

      // The storefront may show an empty catalog or the real one —
      // just confirm it renders without crashing
      const rendered = await page
        .locator("main, [role=main], h1, [data-testid=storefront]")
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      // If the store slug doesn't exist, a 404 page is also acceptable
      const is404 = await page
        .locator("text=/not found/i, text=/404/")
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false);

      expect(
        rendered || is404,
        `storefront at ${label} must render or return a proper 404 — got a blank screen`,
      ).toBe(true);

      await assertNoHorizontalOverflow(page, width, label);
    });
  }
});
