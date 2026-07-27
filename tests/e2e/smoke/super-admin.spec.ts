/**
 * Super admin smoke tests — verify the platform-admin surfaces load and display
 * expected content. These are intentionally shallow: they confirm the page
 * renders without crashing, not every interaction.
 */
import { test, expect } from "../fixtures/base.js";

test.describe("Super admin — core navigation", () => {
  test("Stores list loads", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/stores");
    // Should show at least one store row (seeded)
    await expect(asSuperAdmin.locator("table, [data-testid=store-row], ul li").first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test("Support inbox loads", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/support");
    // Either shows tickets or the empty-state inbox icon
    const content = asSuperAdmin.locator("text=/platform support/i, text=/no platform/i");
    await expect(content.first()).toBeVisible({ timeout: 8_000 });
  });

  test("Support patterns loads", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/support/patterns");
    await expect(asSuperAdmin.getByText(/platform close patterns/i)).toBeVisible({ timeout: 8_000 });
  });

  test("Feature flags loads", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/flags");
    const heading = asSuperAdmin.getByRole("heading", { name: /feature flags/i });
    await expect(heading).toBeVisible({ timeout: 8_000 });
  });

  test("Recipes page loads", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/recipes");
    await expect(asSuperAdmin.getByRole("heading", { name: /product recipes/i })).toBeVisible({
      timeout: 8_000,
    });
  });
});

test.describe("Super admin — store inspector", () => {
  test("can inspect a seeded store", async ({ asSuperAdmin }) => {
    // Navigate to stores and click the first result
    await asSuperAdmin.goto("/super/stores");
    const firstStore = asSuperAdmin.locator("table tbody tr, [data-testid=store-row]").first();
    await expect(firstStore).toBeVisible({ timeout: 8_000 });
    await firstStore.click();
    // Should arrive at the inspector or a store-detail page
    await expect(asSuperAdmin).toHaveURL(/\/super\/(stores|store)\//);
  });
});
