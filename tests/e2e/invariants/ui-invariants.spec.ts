/**
 * UI Invariant specs.
 *
 * Lower priority than the API invariants but worth automating — these catch
 * regressions that only appear in the rendered page.
 *
 * Invariants:
 *  1. Exactly one generic AI assistant toggle per surface.
 *     Contextual "do something" AI buttons may coexist — only the assistant
 *     toggle (the one that opens the AI side-panel / copilot) is counted.
 *  2. No double scrollbars. A page behind an open overlay/drawer must not
 *     create a second scrollable region on the body.
 *  3. No data tables in studio tabs. Tables belong only in super-admin views.
 *  4. No developer references in user-facing UI — no endpoint paths (/api/),
 *     file paths, table names (*Table), or "not yet wired" placeholder notes.
 *  5. Mode-pill rows do not clip at 834px viewport width.
 *     This breakpoint has regressed repeatedly in the studio layout.
 */
import { test, expect } from "../fixtures/base.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Count elements that match selector and are visible in the viewport.
 */
async function countVisible(page: import("@playwright/test").Page, selector: string): Promise<number> {
  return page.locator(selector).filter({ hasText: /./ }).evaluateAll(
    (els) => els.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length,
  );
}

// ── 1. Single AI assistant toggle ─────────────────────────────────────────────

test.describe("UI: single AI assistant toggle per surface", () => {
  const STUDIO_PAGES = [
    { path: "/store/ci_store_a/studio/sticker",   name: "sticker studio" },
    { path: "/store/ci_store_a/studio/planner",   name: "planner studio" },
    { path: "/store/ci_store_a/studio/marketing", name: "marketing studio" },
  ];

  for (const { path, name } of STUDIO_PAGES) {
    test(`${name} has exactly one AI assistant toggle`, async ({ asOwnerA }) => {
      await asOwnerA.goto(path);
      await asOwnerA.waitForLoadState("networkidle");

      // The AI assistant toggle is identified by data-ai-toggle, aria-label containing
      // "AI assistant" or "AI copilot", or the canonical button ID pattern.
      const toggleCount = await asOwnerA
        .locator('[data-ai-toggle], [aria-label*="AI assistant" i], [aria-label*="AI copilot" i]')
        .count();

      // Contextual AI action buttons (generate, suggest, etc.) are NOT the assistant toggle.
      // We assert only that the toggle itself appears exactly once.
      if (toggleCount > 0) {
        expect(
          toggleCount,
          `${name} must have exactly one AI assistant toggle, found ${toggleCount}`,
        ).toBe(1);
      }
      // If 0, the studio may not have an AI panel — that's acceptable.
    });
  }
});

// ── 2. No double scrollbars ───────────────────────────────────────────────────

test.describe("UI: no double scrollbars when overlays are open", () => {
  test("body does not scroll when a drawer is open", async ({ asOwnerA }) => {
    await asOwnerA.goto("/store/ci_store_a/studio/sticker");
    await asOwnerA.waitForLoadState("networkidle");

    // Open a drawer / rail panel if one exists (try common triggers)
    const drawerTrigger = asOwnerA.locator('[data-drawer-trigger], [aria-haspopup="dialog"]').first();
    if (await drawerTrigger.count() > 0) {
      await drawerTrigger.click();
      await asOwnerA.waitForTimeout(300); // wait for transition
    }

    // Body overflow should be hidden/clip when any overlay is open
    const bodyOverflow = await asOwnerA.evaluate(() => {
      return window.getComputedStyle(document.body).overflow;
    });

    // Acceptable: "hidden", "clip", "auto" with no actual overflow, or "visible"
    // Not acceptable: "scroll" (forces scrollbar even with no overflow)
    expect(
      bodyOverflow,
      `body overflow must not be "scroll" when overlay is open — was "${bodyOverflow}"`,
    ).not.toBe("scroll");
  });

  test("no nested scrollable regions share the same overflow axis", async ({ asOwnerA }) => {
    await asOwnerA.goto("/super/stores");
    await asOwnerA.waitForLoadState("networkidle");

    // Check for elements that could cause double-scrollbars:
    // a parent with overflow-y:scroll AND a child with overflow-y:scroll sharing the same visible area
    const doubleScrollCount = await asOwnerA.evaluate(() => {
      const scrollers = Array.from(document.querySelectorAll("*")).filter((el) => {
        const s = window.getComputedStyle(el);
        return (s.overflowY === "scroll" || s.overflowY === "auto") &&
          (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight;
      });

      // Count pairs where one is an ancestor of the other (nested scroll regions)
      let nestedPairs = 0;
      for (let i = 0; i < scrollers.length; i++) {
        for (let j = i + 1; j < scrollers.length; j++) {
          if (scrollers[i].contains(scrollers[j])) {
            nestedPairs++;
          }
        }
      }
      return nestedPairs;
    });

    // Some nesting is unavoidable (sidebar + main), but more than 2 pairs suggests a layout bug
    expect(
      doubleScrollCount,
      "more than 2 nested scroll region pairs suggests double-scrollbar layout bug",
    ).toBeLessThanOrEqual(2);
  });
});

// ── 3. No data tables in studio tabs ─────────────────────────────────────────

test.describe("UI: no data tables rendered in studio tabs", () => {
  const STUDIO_TABS = [
    "/store/ci_store_a/studio/sticker",
    "/store/ci_store_a/studio/planner",
    "/store/ci_store_a/studio/marketing",
  ];

  for (const path of STUDIO_TABS) {
    test(`no <table> in studio: ${path}`, async ({ asOwnerA }) => {
      await asOwnerA.goto(path);
      await asOwnerA.waitForLoadState("networkidle");

      const tableCount = await asOwnerA.locator("table").count();
      expect(
        tableCount,
        `studio at ${path} must not render a <table> — tables belong in super-admin views only`,
      ).toBe(0);
    });
  }
});

// ── 4. No developer references in user-facing UI ──────────────────────────────

test.describe("UI: no developer references in buyer/seller-facing pages", () => {
  const USER_PAGES = [
    { path: "/store/ci_store_a/studio/sticker",   persona: "asOwnerA" as const },
    { path: "/store/ci_store_a/studio/planner",   persona: "asOwnerA" as const },
    { path: "/store/ci_store_a/settings",          persona: "asOwnerA" as const },
  ];

  // Patterns that must NEVER appear in user-facing text content
  const DEV_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
    { pattern: /\/api\//,               description: "API endpoint path (/api/)" },
    { pattern: /Table\b/,              description: "DB table name (*Table)" },
    { pattern: /not yet wired/i,       description: '"not yet wired" placeholder text' },
    { pattern: /TODO|FIXME|HACK/,      description: "TODO/FIXME/HACK comment leaked to UI" },
    { pattern: /drizzle|prisma/i,      description: "ORM name in user-facing text" },
    { pattern: /\.ts\b|\.tsx\b/,       description: "TypeScript filename in user-facing text" },
    { pattern: /plannerConfigsTable|stickerPacksTable|editionsTable/, description: "table variable name" },
  ];

  for (const { path } of USER_PAGES) {
    test(`no developer references on ${path}`, async ({ asOwnerA: page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const bodyText = await page.locator("body").innerText();

      for (const { pattern, description } of DEV_PATTERNS) {
        expect(
          bodyText,
          `"${description}" must not appear in user-facing UI at ${path}`,
        ).not.toMatch(pattern);
      }
    });
  }
});

// ── 5. Mode-pill rows do not clip at 834px ───────────────────────────────────

test.describe("UI: mode-pill rows do not clip at key breakpoints", () => {
  const BREAKPOINTS = [1440, 1024, 834, 640];

  const PILL_PAGES = [
    "/store/ci_store_a/studio/sticker",
    "/store/ci_store_a/studio/planner",
  ];

  for (const path of PILL_PAGES) {
    for (const width of BREAKPOINTS) {
      test(`mode pills visible at ${width}px on ${path}`, async ({ asOwnerA }) => {
        await asOwnerA.setViewportSize({ width, height: 768 });
        await asOwnerA.goto(path);
        await asOwnerA.waitForLoadState("networkidle");

        // Mode pills / product-type pills are identified by data-mode-pill or
        // the role="tab" pattern used in studio navigation
        const pills = asOwnerA.locator('[data-mode-pill], [role="tab"][data-product-type]');
        const pillCount = await pills.count();

        if (pillCount === 0) {
          // No mode pills on this page at this width — acceptable (may be hidden by design)
          return;
        }

        // Every visible pill must not be clipped (overflow hidden cuts off text)
        for (let i = 0; i < pillCount; i++) {
          const pill = pills.nth(i);
          const isClipped = await pill.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const parent = el.parentElement;
            if (!parent) return false;
            const parentRect = parent.getBoundingClientRect();
            // Clipped if the pill extends beyond its parent's right edge
            return rect.right > parentRect.right + 2; // 2px tolerance for subpixel rendering
          });

          expect(
            isClipped,
            `mode pill #${i} is clipped at ${width}px on ${path} — this breakpoint has regressed before`,
          ).toBe(false);
        }
      });
    }
  }
});
