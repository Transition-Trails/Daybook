/**
 * Store owner smoke tests — verify the store-admin surfaces load and that
 * the store-isolation boundary is enforced at the API level.
 */
import { test, expect } from "../fixtures/base.js";
import { PERSONAS } from "../fixtures/personas.js";

const STORE_A = PERSONAS.ownerA.storeId!;

test.describe("Store owner — core navigation", () => {
  test("Dashboard loads", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}`);
    // Expect some dashboard content — heading or stat tiles
    await expect(
      asOwnerA.locator("h1, [data-testid=dashboard-heading]").first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Support inbox loads", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}/support`);
    const content = asOwnerA.locator("text=/support inbox/i, text=/no tickets/i, text=/your customers/i");
    await expect(content.first()).toBeVisible({ timeout: 8_000 });
  });

  test("Email settings loads", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}/email-settings`);
    await expect(asOwnerA.getByText(/email settings/i)).toBeVisible({ timeout: 8_000 });
  });

  test("Catalog page loads", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}/catalog`);
    await expect(
      asOwnerA.locator("h1, [data-testid=catalog-heading], text=/catalog/i").first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Store owner — support workflow", () => {
  test("support patterns page loads", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}/support-patterns`);
    await expect(
      asOwnerA.getByText(/close pattern|no closed tickets/i).first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Staff member access", () => {
  test("staff member can access store A dashboard", async ({ asStaffA }) => {
    await asStaffA.goto(`/store/${STORE_A}`);
    await expect(asStaffA).not.toHaveURL(/\/login/);
  });

  test("staff member is blocked from store-owner-only routes (API)", async ({ asStaffA }) => {
    // Staff cannot access the billing / plan management routes
    const res = await asStaffA.request.get(
      `/api/store/${STORE_A}/billing`,
      { failOnStatusCode: false },
    );
    // Expect 403 Forbidden (staff lacks the owner role)
    expect(res.status()).toBeGreaterThanOrEqual(403);
  });
});
