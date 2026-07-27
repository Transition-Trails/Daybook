/**
 * Auth smoke tests — verify that each persona can reach their expected landing
 * page and that cross-persona isolation holds (owner A cannot access store B).
 */
import { test, expect } from "../fixtures/base.js";
import { PERSONAS } from "../fixtures/personas.js";

test.describe("Super admin auth", () => {
  test("lands on /super dashboard after login", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/");
    // Super admins should be redirected to /super or see the super admin shell
    await expect(asSuperAdmin).toHaveURL(/\/super/);
  });

  test("can reach /super/stores", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/stores");
    await expect(asSuperAdmin.getByRole("heading", { name: /stores/i })).toBeVisible();
  });

  test("can reach /super/support", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/support");
    await expect(asSuperAdmin.getByText(/platform support/i)).toBeVisible();
  });
});

test.describe("Store owner auth", () => {
  test("owner A reaches their store dashboard", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${PERSONAS.ownerA.storeId}`);
    await expect(asOwnerA).not.toHaveURL(/\/login/);
  });

  test("owner A is blocked from store B", async ({ asOwnerA }) => {
    const res = await asOwnerA.request.get(
      `/api/store/${PERSONAS.ownerB.storeId}/catalog`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(403);
  });

  test("owner B is blocked from store A", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.get(
      `/api/store/${PERSONAS.ownerA.storeId}/catalog`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(403);
  });
});

test.describe("Unauthenticated access", () => {
  test("unauthenticated request to /api/me returns 401", async ({ page }) => {
    const res = await page.request.get("/api/me", { failOnStatusCode: false });
    expect(res.status()).toBe(401);
  });
});
